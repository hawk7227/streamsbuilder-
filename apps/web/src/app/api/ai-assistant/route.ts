import { type PipelineContext, type ChatMessage, getProviderConfig, createRequestBody, getLastUserText, createAssistantChatResponse } from '@/lib/openai/responses';
import { shouldRunProbes, extractFeatureTarget, detectModeFromText } from '@/lib/enforcement/modeEngine';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentWorkspaceSelection } from '@/lib/team-server';
import { buildIntegratedChatContext } from '@/lib/ai-chat/context/buildIntegratedContext';
import { runValidators } from '@/lib/enforcement/validatorRunner';
import { validateChatResponse } from '@/lib/enforcement/validators/chat';
import type { AssistantRequestContext } from '@/lib/ai-chat/context/types';
import type { VerifyResponse } from '@/app/api/verify/route';
import type { User } from '@supabase/supabase-js';

export const maxDuration = 60;

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const enc = new TextEncoder();
function emit(controller: ReadableStreamDefaultController<Uint8Array>, data: unknown) {
  controller.enqueue(enc.encode(sse(data)));
}

async function ensureConversation(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  incomingId: string | undefined,
  firstUserText: string,
): Promise<string> {
  if (incomingId) {
    const { data } = await admin
      .from('assistant_conversations')
      .select('id')
      .eq('id', incomingId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  const title = firstUserText.slice(0, 60) || 'New conversation';
  const { data, error } = await admin
    .from('assistant_conversations')
    .insert({ user_id: userId, title })
    .select('id')
    .single();
  if (error || !data) throw new Error('Failed to create conversation');
  return data.id as string;
}

async function persistExchange(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  userText: string,
  assistantText: string,
  model: string,
): Promise<void> {
  const inserts: Array<{ conversation_id: string; role: string; content: string; model?: string }> = [];
  if (userText) inserts.push({ conversation_id: conversationId, role: 'user', content: userText });
  if (assistantText) inserts.push({ conversation_id: conversationId, role: 'assistant', content: assistantText, model });
  if (inserts.length > 0) await admin.from('assistant_messages').insert(inserts);
  await admin.from('assistant_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}

async function runProbes(requestUrl: string, cookieHeader: string, features: string): Promise<VerifyResponse | null> {
  try {
    // Use env var first — request.url in DO may be an internal container address
    const origin = process.env['NEXT_PUBLIC_APP_URL']
      ?? (() => { try { return new URL(requestUrl).origin; } catch { return 'http://localhost:3000'; } })();
    const res = await fetch(`${origin}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader, 'X-Probe-Origin': origin },
      body: JSON.stringify({ features }),
    });
    if (!res.ok) return null;
    return await res.json() as VerifyResponse;
  } catch { return null; }
}

function formatProbeResults(data: VerifyResponse): string {
  const passed = data.results.filter((r) => r.status === 'pass');
  const failed = data.results.filter((r) => r.status !== 'pass');
  const lines: string[] = ['VERIFIED:'];
  if (passed.length === 0) lines.push('- None passed.');
  else for (const r of passed) lines.push(`- ${r.label} \u2192 HTTP ${r.httpStatus} (${r.durationMs}ms)`);
  lines.push('', 'NOT VERIFIED:');
  if (failed.length === 0) lines.push('- All checks passed.');
  else for (const r of failed) {
    const status = r.httpStatus !== null ? `HTTP ${r.httpStatus}` : r.status.toUpperCase();
    lines.push(`- ${r.label} \u2192 ${status}${r.error ? ` \u2014 ${r.error}` : ''}`);
  }
  lines.push('', 'REQUIRES RUNTIME:');
  lines.push(failed.length > 0
    ? `- ${failed.length} check${failed.length > 1 ? 's' : ''} did not pass. Inspect logs for details.`
    : '- Nothing \u2014 all routes responded as expected.');
  lines.push('', `Pass rate: ${data.summary.passRate}% (${data.summary.passed}/${data.summary.total}) \u00b7 Run ID: ${data.runId}`);
  return lines.join('\n');
}

function parseStreamingLine(line: string, isAnthropic: boolean): string {
  if (!line.startsWith('data: ')) return '';
  const payload = line.slice(6).trim();
  if (!payload || payload === '[DONE]') return '';
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (isAnthropic) {
      // Anthropic: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
      if (parsed.type === 'content_block_delta') {
        const delta = parsed.delta as Record<string, unknown> | undefined;
        return typeof delta?.text === 'string' ? delta.text : '';
      }
      return '';
    }
    // OpenAI: { choices: [{ delta: { content: "..." } }] }
    const choices = parsed.choices as Array<{ delta?: { content?: string } }> | undefined;
    return choices?.[0]?.delta?.content ?? '';
  } catch { return ''; }
}

export async function POST(request: Request) {
  // Parse body first — synchronous, zero network cost
  let payload: { messages?: unknown; context?: unknown; requestContext?: unknown; conversationId?: string; model?: string; };
  try { payload = await request.json(); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  const { messages, context, requestContext, conversationId: incomingConvId, model: clientModel } = payload;
  if (!messages || !Array.isArray(messages)) return new Response('messages array is required', { status: 400 });
  if (!context || typeof context !== 'object') return new Response('context object is required', { status: 400 });

  const lastUserMsg = (messages as Array<{ role: string; content: unknown }>).findLast((m) => m.role === 'user');
  const userText =
    typeof lastUserMsg?.content === 'string' ? lastUserMsg.content
    : Array.isArray(lastUserMsg?.content)
      ? (lastUserMsg.content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ')
      : '';

  // Snapshot before async — headers not readable after stream opens
  const requestUrl = request.url;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const authHeader = request.headers.get('authorization') ?? '';

  // ── Open SSE to client IMMEDIATELY ──────────────────────────────────────
  // All async work (auth, DB, LLM) happens INSIDE the stream.
  // Client receives first byte within one network RTT — no dead time.

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => { try { controller.close(); } catch { /* already closed */ } };

      // Phase 1: Auth
      emit(controller, { type: 'phase', phase: 'starting', label: 'Starting secure session...' });

      let user: User | null = null;
      try {
        const supabase = await createClient();
        const { data } = await supabase.auth.getUser();
        user = data.user;
      } catch { /* fall through */ }

      if (!user) {
        try {
          const admin = createAdminClient();
          const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
          if (token) { const { data } = await admin.auth.getUser(token); user = data.user; }
        } catch { /* non-fatal */ }
      }

      if (!user) {
        emit(controller, { type: 'error', message: 'Unauthorized' });
        close();
        return;
      }

      // Phase 2: Context
      emit(controller, { type: 'phase', phase: 'reviewing_context', label: 'Reviewing context...' });

      const admin = createAdminClient();
      let workspaceId: string | undefined = (requestContext as AssistantRequestContext | undefined)?.workspaceId;
      if (!workspaceId) {
        try {
          const selection = await getCurrentWorkspaceSelection(admin, user);
          workspaceId = selection.current.workspace.id;
        } catch { workspaceId = undefined; }
      }

      const integratedContext = await buildIntegratedChatContext({
        ...(typeof requestContext === 'object' && requestContext ? requestContext as AssistantRequestContext : {}),
        workspaceId,
      });

      // Phase 3: Conversation record
      emit(controller, { type: 'phase', phase: 'planning', label: 'Preparing the best path...' });

      let conversationId: string | undefined;
      try { conversationId = await ensureConversation(admin, user.id, incomingConvId, userText); }
      catch { conversationId = undefined; }

      if (conversationId) emit(controller, { type: 'conversation_id', conversationId });

      // Probe path — bypass LLM
      if (shouldRunProbes(userText)) {
        const features = extractFeatureTarget(userText);
        emit(controller, { type: 'phase', phase: 'validating', label: 'Running live HTTP probes...' });
        emit(controller, { type: 'text', delta: `Running live HTTP probes (${features === 'all' ? 'all systems' : features})...\n\n` });
        const probeData = await runProbes(requestUrl, cookieHeader, features);
        const fullText = probeData ? formatProbeResults(probeData)
          : 'VERIFIED:\n- None.\n\nNOT VERIFIED:\n- All routes — /api/verify returned an error.\n\nREQUIRES RUNTIME:\n- Ensure /api/verify is deployed and reachable.';
        for (let i = 0; i < fullText.length; i += 80) emit(controller, { type: 'text', delta: fullText.slice(i, i + 80) });
        emit(controller, { type: 'done', mode: 'verification' });
        close();
        if (conversationId) persistExchange(admin, conversationId, userText, fullText, 'probe').catch(() => {});
        return;
      }

      // Phase 4: Model call — emit understanding phase BEFORE the blocking fetch
      emit(controller, { type: 'phase', phase: 'understanding_request', label: 'Understanding your request...' });

      const activeModel = clientModel || 'gpt-4o';
      const provider = getProviderConfig(activeModel);
      // Use the correct API key based on provider
      const apiKey = activeModel.startsWith('claude-')
        ? (process.env.ANTHROPIC_API_KEY ?? '')
        : (process.env.OPENAI_API_KEY ?? '');

      if (!apiKey) {
        emit(controller, { type: 'error', message: 'Missing API key' });
        close();
        return;
      }

      const pipelineContext: PipelineContext = { ...(context as PipelineContext), integratedContext };
      const requestText = getLastUserText(messages as ChatMessage[]);
      const mode = detectModeFromText(requestText);

      try {
        if (mode === 'action') {
          emit(controller, { type: 'phase', phase: 'finalizing', label: 'Finalizing response...' });
          const finalResponse = await createAssistantChatResponse(messages as ChatMessage[], pipelineContext);
          const chunks = finalResponse.message.match(/.{1,80}/g) ?? [finalResponse.message];
          for (const chunk of chunks) emit(controller, { type: 'text', delta: chunk });
          for (const action of finalResponse.actions) emit(controller, { type: 'action', action });
          emit(controller, { type: 'done', mode });
          close();
          if (conversationId) persistExchange(admin, conversationId, userText, finalResponse.message, activeModel).catch(() => {});
          return;
        }

        // Signal we are about to call the model — user sees this immediately
        emit(controller, { type: 'phase', phase: 'planning', label: 'Connecting to model...' });

        // Streaming — pipe deltas as they arrive from provider
        const upstream = await fetch(provider.url, {
          method: 'POST',
          headers: { ...provider.authHeader(apiKey), 'Content-Type': 'application/json' },
          // Override model with client selection — createRequestBody uses getSiteConfig() internally
          body: JSON.stringify((() => {
            const base = createRequestBody(mode, messages as ChatMessage[], pipelineContext, true);
            if (activeModel.startsWith('claude-')) {
              // Anthropic format: system is top-level, not inside messages[]
              const msgs = (base.messages as Array<{role:string;content:unknown}>) ?? [];
              const systemMsg = msgs.find(m => m.role === 'system');
              const userMsgs = msgs.filter(m => m.role !== 'system');
              return {
                model: activeModel,
                max_tokens: (base.max_tokens as number) ?? 4096,
                stream: true,
                system: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
                messages: userMsgs,
              };
            }
            return { ...base, model: activeModel };
          })()),
        });

        if (!upstream.ok || !upstream.body) {
          const errBody = await upstream.text().catch(() => 'Unknown upstream error');
          emit(controller, { type: 'error', message: `Model request failed (${upstream.status}): ${errBody}` });
          close();
          return;
        }

        // Upstream connected — first token arriving now
        emit(controller, { type: 'phase', phase: 'finalizing', label: 'Streaming response...' });

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let firstToken = true;
        const isAnthropic = activeModel.startsWith('claude-');

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const delta = parseStreamingLine(line.trim(), isAnthropic);
            if (!delta) continue;
            if (firstToken) {
              // Real first token — clear the "streaming" phase, let text speak for itself
              emit(controller, { type: 'phase', phase: 'completed', label: 'Ready' });
              firstToken = false;
            }
            fullText += delta;
            emit(controller, { type: 'text', delta });
          }
        }

        const ledger = runValidators('chat', [{
          name: 'chat-response',
          result: validateChatResponse({ mode, requestText, responseText: fullText, streamed: true }),
        }], { mode });
        const blocking = ledger.issues.find((i) => i.severity === 'error');
        if (blocking) emit(controller, { type: 'error', message: blocking.message });
        emit(controller, { type: 'done', mode, ledger });
        close();
        if (conversationId) persistExchange(admin, conversationId, userText, fullText, activeModel).catch(() => {});
      } catch (error) {
        emit(controller, { type: 'error', message: error instanceof Error ? error.message : String(error) });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
