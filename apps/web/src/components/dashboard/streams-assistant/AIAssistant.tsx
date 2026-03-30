"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface MsgContent { type: "text" | "image_url" | "video_url" | "document"; text?: string; image_url?: { url: string }; }
interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string | MsgContent[];
  tool_call_id?: string;
}
interface ToolCallCard { id: string; tool: string; input: Record<string,unknown>; result?: string; duration?: number; }

interface Action {
  type: "update_prompt" | "update_settings";
  payload: any;
}

interface AIAssistantProps {
  context: Record<string, unknown>;
  onApplyPrompt?: (prompt: string) => void;
  onUpdateSettings?: (key: string, value: string) => void;
  // All 14 action callbacks
  onGenerateImage?: (conceptId?: string, prompt?: string) => void;
  onGenerateVideo?: (conceptId?: string, prompt?: string) => void;
  onRunPipeline?: () => void;
  onRunStep?: (stepId: string, data?: Record<string,unknown>) => void;
  onSelectConcept?: (conceptId: string) => void;
  onApproveOutput?: (type: string, url: string) => void;
  onOpenStepConfig?: (stepId: string) => void;
  onSetNiche?: (nicheId: string) => void;
  onUpdateImagePrompt?: (value: string) => void;
  onUpdateVideoPrompt?: (value: string) => void;
  onUpdateStrategyPrompt?: (value: string) => void;
  onUpdateCopyPrompt?: (value: string) => void;
  onUpdateI2VPrompt?: (value: string) => void;
  onUpdateQAInstruction?: (value: string) => void;
}

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content: "Hi! I can help you refine your prompt or suggest ideas. What's on your mind?",
};

const SUGGESTIONS = [
  "Enhance my prompt",
  "Fix grammar",
  "Make it cinematic",
  "Cyberpunk style",
  "Nature documentary style",
];

// ─── ConnectedStatus — tests each system and shows live status ───────────────
function ConnectedStatus() {
  const [status, setStatus] = useState<Record<string, "checking"|"ok"|"error">>({
    OpenAI: "checking", Anthropic: "checking", GitHub: "checking", Supabase: "checking",
  });

  useEffect(() => {
    const checks: Array<{key: string; test: () => Promise<boolean>}> = [
      { key: "OpenAI", test: async () => {
        const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${(typeof localStorage !== "undefined" && JSON.parse(localStorage.getItem("streams_extra_keys") ?? "{}").OPENAI_API_KEY) ?? ""}` } });
        return r.status !== 401;
      }},
      { key: "Anthropic", test: async () => {
        const r = await fetch("/api/ai-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "ping" }], context: { type: "ping", prompt: "", settings: {}, provider: "anthropic" } }) });
        return r.status !== 503;
      }},
      { key: "GitHub", test: async () => {
        const token = (typeof localStorage !== "undefined" && JSON.parse(localStorage.getItem("streams_extra_keys") ?? "{}").GITHUB_TOKEN) ?? "";
        if (!token) return false;
        const r = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}` } });
        return r.ok;
      }},
      { key: "Supabase", test: async () => {
        const url = (typeof window !== "undefined" && (window as typeof window & { __supabaseUrl?: string }).__supabaseUrl) ?? (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SUPABASE_URL) ?? "";
        if (!url) return false;
        const r = await fetch(`${url}/rest/v1/`);
        return r.status !== 0;
      }},
    ];
    checks.forEach(({ key, test }) => {
      test().then(ok => setStatus(p => ({ ...p, [key]: ok ? "ok" : "error" }))).catch(() => setStatus(p => ({ ...p, [key]: "error" })));
    });
  }, []);

  const COLOR: Record<string, string> = { checking: "#64748b", ok: "#22c55e", error: "#f87171" };
  const ICON: Record<string, string>  = { checking: "⏳", ok: "✓", error: "✗" };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {Object.entries(status).map(([k, v]) => (
        <span key={k} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, border: `1px solid ${COLOR[v]}33`, background: `${COLOR[v]}15`, color: COLOR[v], fontWeight: 700 }}>
          {ICON[v]} {k}
        </span>
      ))}
      <button
        type="button"
        onClick={() => {
          setStatus({ OpenAI: "checking", Anthropic: "checking", GitHub: "checking", Supabase: "checking" });
          setTimeout(() => window.location.reload(), 100);
        }}
        style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#64748b", cursor: "pointer" }}>
        ↺ recheck
      </button>
    </div>
  );
}

export default function AIAssistant({
  context,
  onApplyPrompt,
  onUpdateSettings,
  onGenerateImage,
  onGenerateVideo,
  onRunPipeline,
  onRunStep,
  onSelectConcept,
  onApproveOutput,
  onOpenStepConfig,
  onSetNiche,
  onUpdateImagePrompt,
  onUpdateVideoPrompt,
  onUpdateStrategyPrompt,
  onUpdateCopyPrompt,
  onUpdateI2VPrompt,
  onUpdateQAInstruction,
}: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // ── Attachment rail state ───────────────────────────────────────────────
  const [attachTab, setAttachTab] = useState<"URL"|"IMAGE"|"VIDEO"|"DOC"|"AUDIO"|null>(null);
  const [attachUrl, setAttachUrl] = useState("");
  const [attachments, setAttachments] = useState<MsgContent[]>([]);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  // ── Streaming state ─────────────────────────────────────────────────────
  const [streamingText, setStreamingText] = useState("");
  const [toolCards, setToolCards] = useState<ToolCallCard[]>([]);
  // ── Settings panel ──────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState<"openai"|"anthropic">(() => {
    if (typeof window === "undefined") return "openai";
    return (localStorage.getItem("streams_assistant_provider") as "openai"|"anthropic") ?? "openai";
  });
  const [extraKeys, setExtraKeys] = useState<Record<string,string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("streams_extra_keys") ?? "{}") as Record<string,string>; } catch { return {}; }
  });
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [conversationId, setConversationId] = useState<string|undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return localStorage.getItem("streams_conv_id") ?? undefined;
  });
  const [pendingConfirm, setPendingConfirm] = useState<{label:string;onConfirm:()=>void}|null>(null);
  const performAction = useCallback((action: { type: string; payload: Record<string,unknown> }) => {
    const CONFIRM_TYPES = ["run_pipeline", "push_github_file", "deploy_vercel", "deploy_do_app"];
    const doIt = () => {
      switch(action.type) {
        case "update_prompt": onApplyPrompt?.(action.payload.new_prompt as string ?? action.payload as unknown as string); break;
        case "update_settings": onUpdateSettings?.(action.payload.key as string, action.payload.value as string); break;
        case "update_image_prompt": onUpdateImagePrompt?.(action.payload.value as string); break;
        case "update_strategy_prompt": onUpdateStrategyPrompt?.(action.payload.value as string); break;
        case "update_copy_prompt": onUpdateCopyPrompt?.(action.payload.value as string); break;
        case "update_i2v_prompt": onUpdateI2VPrompt?.(action.payload.value as string); break;
        case "update_qa_instruction": onUpdateQAInstruction?.(action.payload.value as string); break;
        case "generate_image": onGenerateImage?.(action.payload.conceptId as string, action.payload.prompt as string); break;
        case "generate_video": onGenerateVideo?.(action.payload.conceptId as string, action.payload.prompt as string); break;
        case "run_pipeline": onRunPipeline?.(); break;
        case "run_step": onRunStep?.(action.payload.stepId as string, action.payload.data as Record<string,unknown>); break;
        case "select_concept": onSelectConcept?.(action.payload.conceptId as string); break;
        case "approve_output": onApproveOutput?.(action.payload.type as string, action.payload.url as string); break;
        case "open_step_config": onOpenStepConfig?.(action.payload.stepId as string); break;
        case "set_niche": onSetNiche?.(action.payload.nicheId as string); break;
        case "modify_prompt": {
          const field = action.payload.field as string;
          const val = action.payload.value as string;
          if (field === "imagePrompt") onUpdateImagePrompt?.(val);
          else if (field === "videoPrompt") onUpdateVideoPrompt?.(val);
          else if (field === "strategyPrompt") onUpdateStrategyPrompt?.(val);
          else if (field === "copyPrompt") onUpdateCopyPrompt?.(val);
          else if (field === "i2vPrompt") onUpdateI2VPrompt?.(val);
          else if (field === "qaInstruction") onUpdateQAInstruction?.(val);
          else onApplyPrompt?.(val);
          break;
        }
      }
    };
    if (CONFIRM_TYPES.includes(action.type)) {
      setPendingConfirm({ label: `Allow assistant to: ${action.type}?`, onConfirm: () => { doIt(); setPendingConfirm(null); } });
    } else {
      doIt();
    }
  }, [onApplyPrompt, onUpdateSettings, onGenerateImage, onGenerateVideo, onRunPipeline, onRunStep, onSelectConcept, onApproveOutput, onOpenStepConfig, onSetNiche, onUpdateImagePrompt, onUpdateVideoPrompt, onUpdateStrategyPrompt, onUpdateCopyPrompt, onUpdateI2VPrompt, onUpdateQAInstruction]);

  const submitMessage = useCallback(async (text: string) => {
    if ((!text.trim() && attachments.length === 0) || isLoading) return;

    const userContent: MsgContent[] = [{ type: "text", text }];
    userContent.push(...attachments);

    const userMsg: Message = {
      role: "user",
      content: userContent.length === 1 ? text : userContent,
    };

    setMessages((prev) => [...prev, userMsg]);
    setAttachments([]);
    setAttachTab(null);
    setStreamingText("");
    setToolCards([]);
    setIsLoading(true);

    const allMessages = [...messages, userMsg];

    try {
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          context: { ...context, provider, extraKeys },
          conversationId,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      const activeToolCards: ToolCallCard[] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
          for (const line of lines) {
            try {
              const ev = JSON.parse(line.slice(6)) as {
                type: string; delta?: string;
                tool?: string; input?: Record<string,unknown>; result?: string; duration?: number; id?: string;
                action?: { type: string; payload: Record<string,unknown> };
                message?: string; conversationId?: string;
              };
              if (ev.type === "text" && ev.delta) {
                fullText += ev.delta;
                setStreamingText(fullText);
              } else if (ev.type === "tool_call" && ev.tool) {
                activeToolCards.push({ id: ev.id ?? ev.tool, tool: ev.tool, input: ev.input ?? {} });
                setToolCards([...activeToolCards]);
              } else if (ev.type === "tool_result" && ev.tool) {
                const card = activeToolCards.find(tc => tc.tool === ev.tool);
                if (card) { card.result = ev.result; card.duration = ev.duration; }
                setToolCards([...activeToolCards]);
              } else if (ev.type === "action" && ev.action) {
                performAction(ev.action);
              } else if (ev.type === "error" && ev.message) {
                fullText += `\n⚠ ${ev.message}`;
                setStreamingText(fullText);
              } else if (ev.type === "done" && ev.conversationId) {
                setConversationId(ev.conversationId);
                if (typeof window !== "undefined") localStorage.setItem("streams_conv_id", ev.conversationId);
              }
            } catch { /* skip malformed */ }
          }
        }
      }

      const imgUrlMatch = fullText.match(/https?:\/\/\S+\.(png|jpg|jpeg|webp|gif)/i);
      const vidUrlMatch = fullText.match(/https?:\/\/\S+\.(mp4|webm|mov)/i);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: [
            { type: "text", text: fullText || "(no response)" },
            ...(imgUrlMatch ? [{ type: "image_url" as const, image_url: { url: imgUrlMatch[0] } }] : []),
            ...(vidUrlMatch ? [{ type: "video_url" as const, image_url: { url: vidUrlMatch[0] } }] : []),
          ] as MsgContent[],
        },
      ]);
      setStreamingText("");
      setToolCards([]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [messages, attachments, isLoading, context, provider, extraKeys, conversationId, performAction]);

    const handleClearChat = () => {
    setMessages([INITIAL_MESSAGE]);
    localStorage.removeItem("streamsai_chat_history");
  };

  const handleSuggestionClick = (suggestion: string) => {
    submitMessage(suggestion);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    submitMessage(input);
    setInput("");
  };

  // ── Attachment helpers ────────────────────────────────────────────────────
  const handleFileAttach = async (file: File, type: "IMAGE"|"VIDEO"|"DOC"|"AUDIO") => {
    if (type === "IMAGE") {
      const reader = new FileReader();
      reader.onload = e => {
        const url = e.target?.result as string;
        setAttachments(prev => [...prev, { type: "image_url", image_url: { url } }]);
      };
      reader.readAsDataURL(file);
    } else {
      const text = await file.text().catch(() => `[${file.name} — ${file.type}]`);
      setAttachments(prev => [...prev, { type: "text", text: `[${type}: ${file.name}]\n${text.slice(0, 4000)}` }]);
    }
    setAttachTab(null);
  };

  const handleUrlAttach = async () => {
    if (!attachUrl.trim()) return;
    setAttachments(prev => [...prev, { type: "text", text: `[URL: ${attachUrl}]` }]);
    setAttachUrl("");
    setAttachTab(null);
  };

  const saveProvider = (p: "openai"|"anthropic") => {
    setProvider(p);
    if (typeof window !== "undefined") localStorage.setItem("streams_assistant_provider", p);
  };

  const saveExtraKey = () => {
    if (!newKeyLabel.trim() || !newKeyValue.trim()) return;
    const next = { ...extraKeys, [newKeyLabel.trim()]: newKeyValue.trim() };
    setExtraKeys(next);
    if (typeof window !== "undefined") localStorage.setItem("streams_extra_keys", JSON.stringify(next));
    setNewKeyLabel(""); setNewKeyValue("");
  };

  const removeExtraKey = (label: string) => {
    const next = { ...extraKeys };
    delete next[label];
    setExtraKeys(next);
    if (typeof window !== "undefined") localStorage.setItem("streams_extra_keys", JSON.stringify(next));
  };

  return (
    <div className="bg-bg-secondary border border-border-color rounded-2xl overflow-hidden flex flex-col h-[500px]">
      <div className="px-5 py-4 border-b border-border-color flex items-center justify-between bg-bg-secondary">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-linear-to-br from-accent-indigo to-accent-purple flex items-center justify-center text-sm">
            🤖
          </div>
          <span className="font-medium text-sm">AI Assistant</span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-accent-emerald/10 text-accent-emerald">
            Active
          </span>
        </div>
        <button type="button" onClick={() => setShowSettings(v => !v)}
          className={`text-text-muted hover:text-white transition-colors p-1 mr-1 ${showSettings ? "text-accent-indigo" : ""}`}
          title="Settings">
          ⚙
        </button>
        <button
          type="button"
          onClick={handleClearChat}
          className="text-text-muted hover:text-white transition-colors p-1"
          title="Clear Chat"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          </svg>
        </button>
      </div>

      {/* ── Settings panel ── */}
      {showSettings && (
        <div className="border-b border-border-color bg-bg-tertiary p-3 text-xs flex flex-col gap-3">
          <div className="font-bold text-text-secondary uppercase tracking-wider text-[10px]">Assistant Settings</div>
          {/* Provider toggle */}
          <div className="flex items-center gap-2">
            <span className="text-text-muted w-20">Provider</span>
            <div className="flex gap-1">
              {(["openai","anthropic"] as const).map(p => (
                <button key={p} type="button" onClick={() => saveProvider(p)}
                  className={`px-2 py-1 rounded text-[10px] font-bold ${provider===p?"bg-accent-indigo text-white":"border border-border-color text-text-muted"}`}>
                  {p==="openai"?"GPT-4o":"Claude"}
                </button>
              ))}
            </div>
          </div>
          {/* Connected systems status */}
          <div>
            <div className="text-text-muted mb-1">Connected Systems</div>
            <ConnectedStatus />
          </div>
          {/* Extra keys */}
          <div>
            <div className="text-text-muted mb-1">Extra API Keys / Tokens</div>
            {Object.entries(extraKeys).map(([k]) => (
              <div key={k} className="flex items-center gap-2 mb-1">
                <span className="text-text-secondary flex-1 truncate">{k}</span>
                <span className="text-text-muted">••••••••</span>
                <button type="button" onClick={() => removeExtraKey(k)} className="text-red-400 hover:text-red-300 text-[10px]">✕</button>
              </div>
            ))}
            <div className="flex gap-1 mt-1">
              <input value={newKeyLabel} onChange={e=>setNewKeyLabel(e.target.value)} placeholder="Label (e.g. GITHUB_TOKEN)" className="flex-1 bg-bg-secondary border border-border-color rounded px-2 py-1 text-[10px] text-white outline-none" />
              <input value={newKeyValue} onChange={e=>setNewKeyValue(e.target.value)} type="password" placeholder="Value" className="flex-1 bg-bg-secondary border border-border-color rounded px-2 py-1 text-[10px] text-white outline-none" />
              <button type="button" onClick={saveExtraKey} className="px-2 py-1 rounded bg-accent-emerald/20 text-accent-emerald text-[10px] font-bold">+</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action confirmation modal ── */}
      {pendingConfirm && (
        <div className="border-b border-border-color bg-amber-900/20 p-3 flex items-center gap-3">
          <span className="flex-1 text-xs text-amber-300">{pendingConfirm.label}</span>
          <button type="button" onClick={pendingConfirm.onConfirm} className="px-3 py-1 rounded bg-amber-500 text-black text-xs font-bold">Allow</button>
          <button type="button" onClick={() => setPendingConfirm(null)} className="px-3 py-1 rounded border border-border-color text-text-muted text-xs">Deny</button>
        </div>
      )}

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Tool call cards */}
        {toolCards.map((tc, i) => (
          <div key={i} className="flex justify-start">
            <div className="max-w-[90%] rounded-xl px-3 py-2 text-xs bg-purple-900/20 border border-purple-500/20 text-purple-300">
              <div className="flex items-center gap-2 font-bold mb-1">
                <span>🔧</span><span>{tc.tool}</span>
                {tc.duration && <span className="text-purple-500 font-normal">{tc.duration}ms</span>}
              </div>
              {tc.result && <div className="text-purple-400/70 truncate">{tc.result.slice(0,120)}{tc.result.length>120?"…":""}</div>}
            </div>
          </div>
        ))}
        {/* Streaming text preview */}
        {streamingText && isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm bg-bg-tertiary border border-border-color text-text-secondary rounded-bl-sm">
              {streamingText}
              <span className="inline-block w-1 h-3 bg-accent-indigo ml-1 animate-pulse" />
            </div>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${
              msg.role === "user" ? "justify-end" : msg.role === "system" ? "justify-center my-2" : "justify-start"
            }`}
          >
            {msg.role === "system" ? (
               <div className="text-[10px] uppercase tracking-wider text-text-muted bg-bg-tertiary/50 px-3 py-1 rounded-full border border-white/5">
                 {typeof msg.content === "string" ? msg.content : ""}
               </div>
            ) : (
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-accent-indigo text-white rounded-br-sm"
                  : "bg-bg-tertiary border border-border-color text-text-secondary rounded-bl-sm"
              }`}
            >
              {typeof msg.content === "string"
                ? msg.content
                : (msg.content as MsgContent[]).map((b, bi) => (
                    <div key={bi}>
                      {b.type === "text" && <span>{b.text}</span>}
                      {b.type === "image_url" && b.image_url && (
                        <img src={b.image_url.url} alt="result" className="mt-2 rounded-lg max-w-full max-h-64 object-contain" />
                      )}
                      {b.type === "video_url" && b.image_url && (
                        <video src={b.image_url.url} autoPlay muted loop playsInline controls className="mt-2 rounded-lg max-w-full max-h-64" />
                      )}
                    </div>
                  ))
              }
            </div>
            )}
          </div>
        ))}
        {messages.length === 1 && !isLoading && (
          <div className="flex flex-wrap gap-2 mt-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-3 py-1.5 rounded-full border border-border-color bg-bg-tertiary text-xs text-text-secondary hover:border-accent-indigo hover:text-accent-indigo transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-bg-tertiary border border-border-color px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Attachment rail ── */}
      <div className="px-3 pt-2 border-t border-border-color bg-bg-secondary">
        {/* Tab buttons */}
        <div className="flex gap-1 mb-2">
          {(["URL","IMAGE","VIDEO","DOC","AUDIO"] as const).map(tab => (
            <button key={tab} type="button"
              onClick={() => setAttachTab(t => t === tab ? null : tab)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${attachTab===tab?"bg-accent-indigo text-white":"border border-border-color text-text-muted hover:text-white"}`}>
              {tab}
            </button>
          ))}
          {/* Provider badge */}
          <span className="ml-auto text-[9px] text-text-muted px-2 py-0.5 border border-border-color rounded">
            {provider === "openai" ? "GPT-4o" : "Claude"}
          </span>
        </div>
        {/* URL input */}
        {attachTab === "URL" && (
          <div className="flex gap-1 mb-2">
            <input value={attachUrl} onChange={e => setAttachUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleUrlAttach()}
              placeholder="Paste URL and press Enter…"
              className="flex-1 bg-bg-tertiary border border-border-color rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent-indigo" />
            <button type="button" onClick={handleUrlAttach} className="px-3 py-2 rounded-lg bg-accent-indigo text-white text-xs font-bold">→</button>
          </div>
        )}
        {/* Hidden file inputs */}
        <input ref={imgInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e => { const f=e.target.files?.[0]; if(f) handleFileAttach(f,"IMAGE"); e.target.value=""; }} />
        <input ref={vidInputRef} type="file" accept="video/*" style={{display:"none"}} onChange={e => { const f=e.target.files?.[0]; if(f) handleFileAttach(f,"VIDEO"); e.target.value=""; }} />
        <input ref={docInputRef} type="file" accept=".pdf,.txt,.md,.json,.csv" style={{display:"none"}} onChange={e => { const f=e.target.files?.[0]; if(f) handleFileAttach(f,"DOC"); e.target.value=""; }} />
        <input ref={audioInputRef} type="file" accept="audio/*" style={{display:"none"}} onChange={e => { const f=e.target.files?.[0]; if(f) handleFileAttach(f,"AUDIO"); e.target.value=""; }} />
        {/* Trigger file pick on tab click */}
        {attachTab === "IMAGE" && (() => { imgInputRef.current?.click(); setAttachTab(null); return null; })()}
        {attachTab === "VIDEO" && (() => { vidInputRef.current?.click(); setAttachTab(null); return null; })()}
        {attachTab === "DOC" && (() => { docInputRef.current?.click(); setAttachTab(null); return null; })()}
        {attachTab === "AUDIO" && (() => { audioInputRef.current?.click(); setAttachTab(null); return null; })()}
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-1 bg-accent-indigo/15 border border-accent-indigo/30 rounded px-2 py-0.5 text-[10px] text-accent-indigo">
                {a.type === "image_url" ? "🖼 Image" : a.type === "text" ? `📎 ${(a.text??"").slice(0,24)}…` : "📄"}
                <button type="button" onClick={() => setAttachments(prev => prev.filter((_,j) => j!==i))} className="text-text-muted hover:text-white ml-1">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="p-3 pt-0 border-b border-border-color bg-bg-secondary">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything or request a prompt..."
            className="w-full pl-4 pr-10 py-3 rounded-xl border border-border-color bg-bg-tertiary text-sm text-white focus:outline-none focus:border-accent-indigo placeholder-text-muted"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-accent-indigo hover:bg-accent-indigo/10 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
