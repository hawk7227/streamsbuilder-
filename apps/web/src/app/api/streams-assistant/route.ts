import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

interface AssistantMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  tool_call_id?: string;
  tool_calls?: OAIToolCall[];
}
interface ContentBlock { type: string; text?: string; image_url?: { url: string }; }
interface OAIToolCall { id: string; type: "function"; function: { name: string; arguments: string }; }
interface FullContext {
  type: string; prompt: string; settings: Record<string,string>;
  provider?: "openai"|"anthropic"; conversationId?: string;
  pipelineName?: string; nicheId?: string; pipelineMode?: string; outputMode?: string;
  pipelineRunning?: boolean;
  steps?: Array<{id:string;name:string;state:string;error?:string|null}>;
  stepStates?: Record<string,string>;
  csFields?: Record<string,string>;
  csRealism?: {mode:string;imperfections:Record<string,boolean>;strictNegatives:Record<string,boolean>;strictBlocks:Record<string,boolean>};
  conceptOutputs?: Record<string,{image?:string|null;video?:string|null;status?:string;error?:string|null}>;
  approvedOutputs?: {image?:string;video?:string;script?:string};
  imageResult?: string|null; videoResult?: string|null;
  imagePrompt?: string; videoPrompt?: string;
  imageProvider?: string; videoProvider?: string; videoMode?: string;
  selectedConceptId?: string; sessionId?: string;
  extraKeys?: Record<string,string>;
}

const TOOLS = [
  {type:"function",function:{name:"fetch_url",description:"Fetch any URL — returns text, JSON, or base64 for images.",parameters:{type:"object",properties:{url:{type:"string"},method:{type:"string",enum:["GET","POST"]},body:{type:"string"}},required:["url"]}}},
  {type:"function",function:{name:"generate_image",description:"Trigger image generation.",parameters:{type:"object",properties:{conceptId:{type:"string"},prompt:{type:"string"},provider:{type:"string",enum:["openai","fal"]}},required:[]}}},
  {type:"function",function:{name:"generate_video",description:"Trigger video generation.",parameters:{type:"object",properties:{conceptId:{type:"string"},prompt:{type:"string"},provider:{type:"string",enum:["kling","runway"]},mode:{type:"string",enum:["scratch_t2v","i2v"]}},required:[]}}},
  {type:"function",function:{name:"run_pipeline",description:"Run full governance pipeline.",parameters:{type:"object",properties:{},required:[]}}},
  {type:"function",function:{name:"run_step",description:"Run single pipeline step.",parameters:{type:"object",properties:{stepId:{type:"string"},data:{type:"object"}},required:["stepId"]}}},
  {type:"function",function:{name:"read_pipeline_state",description:"Read current pipeline state.",parameters:{type:"object",properties:{sessionId:{type:"string"}},required:[]}}},
  {type:"function",function:{name:"modify_prompt",description:"Update a prompt field.",parameters:{type:"object",properties:{field:{type:"string",enum:["imagePrompt","videoPrompt","strategyPrompt","copyPrompt","validatorPrompt","i2vPrompt","qaInstruction","pipelinePrompt","finalPrompt"]},value:{type:"string"}},required:["field","value"]}}},
  {type:"function",function:{name:"trigger_generation",description:"Generic generation trigger.",parameters:{type:"object",properties:{type:{type:"string",enum:["image","video","i2v","script"]},provider:{type:"string"},prompt:{type:"string"},conceptId:{type:"string"}},required:["type"]}}},
  {type:"function",function:{name:"fetch_github_file",description:"Read file from any GitHub repo.",parameters:{type:"object",properties:{repo:{type:"string"},path:{type:"string"},branch:{type:"string"}},required:["repo","path"]}}},
  {type:"function",function:{name:"push_github_file",description:"Write/update file in GitHub repo.",parameters:{type:"object",properties:{repo:{type:"string"},path:{type:"string"},content:{type:"string"},message:{type:"string"},branch:{type:"string"}},required:["repo","path","content","message"]}}},
  {type:"function",function:{name:"read_supabase_table",description:"Query any Supabase table.",parameters:{type:"object",properties:{table:{type:"string"},filter:{type:"object"},limit:{type:"number"},order:{type:"string"}},required:["table"]}}},
  {type:"function",function:{name:"write_supabase_row",description:"Insert or upsert a row.",parameters:{type:"object",properties:{table:{type:"string"},data:{type:"object"},upsert:{type:"boolean"}},required:["table","data"]}}},
  {type:"function",function:{name:"read_memory",description:"Query assistant memory for past runs, URLs, decisions.",parameters:{type:"object",properties:{memory_type:{type:"string",enum:["pipeline_run","image_url","decision","error","custom","all"]},key:{type:"string"},limit:{type:"number"}},required:[]}}},
  {type:"function",function:{name:"write_memory",description:"Store fact/decision to memory.",parameters:{type:"object",properties:{memory_type:{type:"string",enum:["pipeline_run","image_url","decision","error","custom"]},key:{type:"string"},value:{type:"object"},tags:{type:"array",items:{type:"string"}}},required:["memory_type","key","value"]}}},
  {type:"function",function:{name:"deploy_vercel",description:"Trigger Vercel deployment.",parameters:{type:"object",properties:{project:{type:"string",enum:["streamsailive","streamsai-editor"]}},required:["project"]}}},
  {type:"function",function:{name:"deploy_do_app",description:"Trigger DigitalOcean deployment.",parameters:{type:"object",properties:{force_rebuild:{type:"boolean"}},required:[]}}},
];

async function executeTool(name: string, args: Record<string,unknown>, ctx: FullContext, userId: string, sb: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const gh = ctx.extraKeys?.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
  const vt = ctx.extraKeys?.VERCEL_TOKEN ?? process.env.VERCEL_TOKEN ?? "";
  const dt = ctx.extraKeys?.DO_API_TOKEN ?? process.env.DO_API_TOKEN ?? "";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";
  try {
    switch(name) {
      case "fetch_url": {
        const r = await fetch(args.url as string,{method:(args.method as string)??"GET",headers:{"User-Agent":"STREAMS-AI/1.0"},...(args.body?{body:args.body as string}:{})});
        const ct = r.headers.get("content-type")??"";
        if(ct.includes("image")){const b=await r.arrayBuffer();return JSON.stringify({type:"image",base64:Buffer.from(b).toString("base64").slice(0,300)+"...",contentType:ct});}
        return (await r.text()).slice(0,8000);
      }
      case "generate_image": {
        const r = await fetch(`${base}/api/generations`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"image",prompt:args.prompt??ctx.imagePrompt??"realistic photo",conceptId:args.conceptId??ctx.selectedConceptId??"concept-1",provider:args.provider??ctx.imageProvider??"openai",aspectRatio:"16:9"})});
        const d = await r.json() as {data?:{id:string;status:string;output_url?:string};error?:string};
        return d.error?`Error: ${d.error}`:JSON.stringify({status:d.data?.status,url:d.data?.output_url,id:d.data?.id});
      }
      case "generate_video": {
        const r = await fetch(`${base}/api/generations`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"video",prompt:args.prompt??ctx.videoPrompt??"slow natural motion",conceptId:args.conceptId??ctx.selectedConceptId??"concept-1",provider:args.provider??ctx.videoProvider??"kling",mode:args.mode??ctx.videoMode??"scratch_t2v"})});
        const d = await r.json() as {data?:{id:string;status:string;output_url?:string};error?:string};
        return d.error?`Error: ${d.error}`:JSON.stringify({status:d.data?.status,url:d.data?.output_url,id:d.data?.id});
      }
      case "run_pipeline": return JSON.stringify({action:"run_pipeline",message:"Triggered via UI callback"});
      case "run_step": {
        const r = await fetch(`${base}/api/pipeline/run-node`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:args.stepId,data:args.data??{},context:ctx})});
        return JSON.stringify(await r.json());
      }
      case "read_pipeline_state": {
        const sid = (args.sessionId as string)??ctx.sessionId;
        if(!sid) return JSON.stringify({steps:ctx.steps,conceptOutputs:ctx.conceptOutputs,approvedOutputs:ctx.approvedOutputs});
        const {data} = await sb.from("pipeline_sessions").select("*").eq("id",sid).single();
        return JSON.stringify(data??{error:"Not found"});
      }
      case "modify_prompt": return JSON.stringify({action:"modify_prompt",field:args.field,value:args.value});
      case "trigger_generation": {
        const r = await fetch(`${base}/api/generations`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:args.type,prompt:args.prompt,conceptId:args.conceptId??ctx.selectedConceptId,provider:args.provider})});
        return JSON.stringify(await r.json());
      }
      case "fetch_github_file": {
        if(!gh) return "Error: GITHUB_TOKEN not set";
        const r = await fetch(`https://api.github.com/repos/${args.repo}/contents/${args.path}?ref=${args.branch??"main"}`,{headers:{Authorization:`Bearer ${gh}`,Accept:"application/vnd.github.v3+json"}});
        const d = await r.json() as {content?:string;message?:string};
        if(!r.ok) return `Error: ${d.message}`;
        return Buffer.from(d.content!.replace(/\n/g,""),"base64").toString("utf-8").slice(0,8000);
      }
      case "push_github_file": {
        if(!gh) return "Error: GITHUB_TOKEN not set";
        const gr = await fetch(`https://api.github.com/repos/${args.repo}/contents/${args.path}?ref=${args.branch??"main"}`,{headers:{Authorization:`Bearer ${gh}`}});
        const ex = gr.ok?await gr.json() as {sha?:string}:null;
        const pr = await fetch(`https://api.github.com/repos/${args.repo}/contents/${args.path}`,{method:"PUT",headers:{Authorization:`Bearer ${gh}`,"Content-Type":"application/json"},body:JSON.stringify({message:args.message,content:Buffer.from(args.content as string).toString("base64"),branch:args.branch??"main",...(ex?.sha?{sha:ex.sha}:{})})});
        const d = await pr.json() as {commit?:{sha:string};message?:string};
        return pr.ok?JSON.stringify({committed:d.commit?.sha}):`Error: ${d.message}`;
      }
      case "read_supabase_table": {
        let q = sb.from(args.table as string).select("*").limit((args.limit as number)??20);
        if(args.filter) Object.entries(args.filter as Record<string,unknown>).forEach(([k,v])=>{q=q.eq(k,v as string);});
        if(args.order) q=q.order(args.order as string,{ascending:false});
        const {data,error} = await q;
        return error?`Error: ${error.message}`:JSON.stringify(data?.slice(0,20));
      }
      case "write_supabase_row": {
        const op=(args.upsert as boolean)?sb.from(args.table as string).upsert({...(args.data as Record<string,unknown>),user_id:userId}):sb.from(args.table as string).insert({...(args.data as Record<string,unknown>),user_id:userId});
        const {error}=await op;
        return error?`Error: ${error.message}`:"Success";
      }
      case "read_memory": {
        let q=sb.from("assistant_memory").select("*").eq("user_id",userId).limit((args.limit as number)??10).order("updated_at",{ascending:false});
        if(args.memory_type&&args.memory_type!=="all") q=q.eq("memory_type",args.memory_type);
        if(args.key) q=q.eq("key",args.key);
        const {data,error}=await q;
        return error?`Error: ${error.message}`:JSON.stringify(data);
      }
      case "write_memory": {
        const {error}=await sb.from("assistant_memory").upsert({user_id:userId,memory_type:args.memory_type,key:args.key,value:args.value,tags:args.tags??[],updated_at:new Date().toISOString()},{onConflict:"user_id,key"});
        return error?`Error: ${error.message}`:"Memory stored";
      }
      case "deploy_vercel": {
        if(!vt) return "Error: VERCEL_TOKEN not set — add to DO environment variables";
        const pid=args.project==="streamsailive"?process.env.VERCEL_PROJECT_ID:process.env.VERCEL_EDITOR_PROJECT_ID;
        if(!pid) return `Error: VERCEL_PROJECT_ID not set for ${args.project}`;
        const r=await fetch("https://api.vercel.com/v13/deployments",{method:"POST",headers:{Authorization:`Bearer ${vt}`,"Content-Type":"application/json"},body:JSON.stringify({name:args.project,target:"production"})});
        const d=await r.json() as {id?:string;url?:string;error?:{message:string}};
        return r.ok?JSON.stringify({deploymentId:d.id,url:d.url}):`Error: ${d.error?.message}`;
      }
      case "deploy_do_app": {
        if(!dt) return "Error: DO_API_TOKEN not set — add to DO environment variables";
        const aid=process.env.DO_APP_ID??"";
        if(!aid) return "Error: DO_APP_ID not set";
        const r=await fetch(`https://api.digitalocean.com/v2/apps/${aid}/deployments`,{method:"POST",headers:{Authorization:`Bearer ${dt}`,"Content-Type":"application/json"},body:JSON.stringify({force_build:args.force_rebuild??false})});
        const d=await r.json() as {deployment?:{id:string;phase:string};message?:string};
        return r.ok?JSON.stringify({deploymentId:d.deployment?.id,phase:d.deployment?.phase}):`Error: ${d.message}`;
      }
      default: return `Unknown tool: ${name}`;
    }
  } catch(e){ return `Tool error: ${e instanceof Error?e.message:String(e)}`; }
}

function sysPrompt(ctx: FullContext, mem: string): string {
  const s=[
    ctx.pipelineName?`Pipeline: ${ctx.pipelineName}`:"",
    ctx.nicheId?`Niche: ${ctx.nicheId}`:"",
    ctx.pipelineRunning?"⚡ PIPELINE RUNNING":"",
    ctx.steps?.length?`Steps: ${ctx.steps.map(s=>`${s.name}(${s.state})`).join(", ")}`:"",
    ctx.imageProvider?`Image provider: ${ctx.imageProvider}`:"",
    ctx.imagePrompt?`Image prompt: ${ctx.imagePrompt.slice(0,200)}`:"",
    ctx.conceptOutputs?`Concepts: ${JSON.stringify(ctx.conceptOutputs).slice(0,400)}`:"",
    ctx.approvedOutputs?`Approved: ${JSON.stringify(ctx.approvedOutputs)}`:"",
    ctx.csFields?`Creative Setup: ${JSON.stringify(ctx.csFields).slice(0,300)}`:"",
    ctx.csRealism?`Realism: ${ctx.csRealism.mode}`:"",
  ].filter(Boolean).join("\n");
  return `You are STREAMS — a powerful AI pipeline director with full access to: pipeline generation, GitHub (hawk7227/*), Vercel deployments, DigitalOcean apps, Supabase, and all APIs (OpenAI, Anthropic, ElevenLabs, Runway, Kling).

You can read/write files, push code, trigger deployments, generate images/videos, modify prompts, query databases, remember decisions.

PIPELINE STATE:\n${s||"No pipeline loaded"}

MEMORY:\n${mem||"No memory yet"}

GOVERNANCE: No diagnostic claims. Realism-first: no cinematic, no airbrushed. Motion: no face warping, max 5s.

ACTIONS (emit JSON when intent matches): generate_image, generate_video, run_pipeline, run_step, modify_prompt, select_concept, approve_output, open_step_config, set_niche, update_prompt, update_strategy_prompt, update_copy_prompt, update_i2v_prompt, update_qa_instruction

Use tools proactively without asking. Be direct. Tell user what you are doing.
When emitting actions: {"message":"...","actions":[{"type":"...","payload":{...}}]}`;
}

async function loadMem(uid: string, sb: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  try{const{data}=await sb.from("assistant_memory").select("memory_type,key,value").eq("user_id",uid).order("updated_at",{ascending:false}).limit(20);return data?.length?data.map(m=>`[${m.memory_type}] ${m.key}: ${JSON.stringify(m.value).slice(0,200)}`).join("\n"):"";}catch{return "";}
}

async function saveMem(ctx: FullContext, uid: string, sb: Awaited<ReturnType<typeof createClient>>) {
  try {
    if (ctx.approvedOutputs?.image) {
      await sb.from("assistant_memory").upsert({
        user_id: uid, memory_type: "image_url",
        key: `img_${Date.now()}`,
        value: { url: ctx.approvedOutputs.image, niche: ctx.nicheId, ts: new Date().toISOString() },
        tags: [ctx.nicheId ?? "unknown"], updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,key" });
    }
    if (ctx.pipelineName) {
      await sb.from("assistant_memory").upsert({
        user_id: uid, memory_type: "pipeline_run",
        key: `run_${ctx.pipelineName}_${new Date().toISOString().split("T")[0]}`,
        value: { name: ctx.pipelineName, niche: ctx.nicheId, steps: ctx.steps?.map(s => ({ id: s.id, state: s.state })), provider: ctx.imageProvider, ts: new Date().toISOString() },
        tags: [ctx.nicheId ?? "unknown"], updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,key" });
    }
  } catch { /* non-blocking */ }
}

function sse(type: string, d: Record<string,unknown>|string): string {
  return `data: ${JSON.stringify({type,...(typeof d==="string"?{text:d}:d)})}\n\n`;
}

export async function POST(req: Request): Promise<Response> {
  const sb = await createClient();
  const{data:{user}}=await sb.auth.getUser();
  if(!user) return new Response("Unauthorized",{status:401});
  let payload:{messages?:AssistantMessage[];context?:FullContext;conversationId?:string};
  try{payload=await req.json();}catch{return new Response("Invalid JSON",{status:400});}
  const{messages=[],context={type:"image",prompt:"",settings:{}}}=payload;
  const prov=context.provider??"openai";
  const mem=await loadMem(user.id,sb);
  const sys=sysPrompt(context,mem);
  let cid=context.conversationId??payload.conversationId;
  if(!cid){const{data:c}=await sb.from("assistant_conversations").insert({user_id:user.id,title:(messages.find(m=>m.role==="user")?.content as string)?.slice(0,60)??"New conversation",niche_id:context.nicheId}).select("id").single();cid=c?.id;}
  const enc=new TextEncoder();
  const stream=new ReadableStream({
    async start(ctrl){
      const emit=(t:string,d:Record<string,unknown>|string)=>ctrl.enqueue(enc.encode(sse(t,d)));
      try{
        const ok=context.extraKeys?.OPENAI_API_KEY??process.env.OPENAI_API_KEY;
        const ak=context.extraKeys?.ANTHROPIC_API_KEY??process.env.ANTHROPIC_API_KEY;
        if(prov==="openai"&&!ok){emit("error",{message:"OPENAI_API_KEY not set"});ctrl.close();return;}
        if(prov==="anthropic"&&!ak){emit("error",{message:"ANTHROPIC_API_KEY not set"});ctrl.close();return;}
        const loop:AssistantMessage[]=[{role:"system",content:sys},...messages];
        const acts:Array<{type:string;payload:Record<string,unknown>}>=[];
        let i=0;
        while(i++<10){
          if(prov==="openai"){
            const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${ok}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o",messages:loop,tools:TOOLS,tool_choice:"auto",temperature:0.4,max_tokens:1200})});
            if(!r.ok){const e=await r.json().catch(()=>({})) as{error?:{message:string}};emit("error",{message:`OpenAI: ${e.error?.message??r.status}`});break;}
            const d=await r.json() as{choices:[{message:{content?:string;tool_calls?:OAIToolCall[]};finish_reason:string}]};
            const msg=d.choices[0].message;
            if(msg.content){
              emit("text",{delta:msg.content});
              try{const p=JSON.parse(msg.content) as{message?:string;actions?:Array<{type:string;payload:Record<string,unknown>}>};if(p.actions?.length){acts.push(...p.actions);}}catch{}
            }
            if(msg.tool_calls?.length){
              loop.push({role:"assistant",content:msg.content??"",tool_calls:msg.tool_calls});
              for(const tc of msg.tool_calls){
                let ta:Record<string,unknown>={};try{ta=JSON.parse(tc.function.arguments);}catch{}
                emit("tool_call",{tool:tc.function.name,input:ta,id:tc.id});
                const t0=Date.now();const res=await executeTool(tc.function.name,ta,context,user.id,sb);const dur=Date.now()-t0;
                emit("tool_result",{tool:tc.function.name,result:res.slice(0,2000),duration:dur});
                if(cid)await sb.from("assistant_tool_calls").insert({conversation_id:cid,tool_name:tc.function.name,input:ta,result:{text:res.slice(0,4000)},duration_ms:dur}).then(()=>{});
                loop.push({role:"tool",content:res,tool_call_id:tc.id});
              }
              continue;
            }
            break;
          }
          if(prov==="anthropic"){
            const am=loop.filter(m=>m.role!=="system").map(m=>({role:m.role==="tool"?"user":m.role,content:m.content}));
            const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":ak!,"anthropic-version":"2023-06-01","Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,system:sys,messages:am,tools:TOOLS.map(t=>({name:t.function.name,description:t.function.description,input_schema:t.function.parameters}))})});
            if(!r.ok){const e=await r.json().catch(()=>({})) as{error?:{message:string}};emit("error",{message:`Anthropic: ${e.error?.message??r.status}`});break;}
            const d=await r.json() as{content:Array<{type:string;text?:string;id?:string;name?:string;input?:Record<string,unknown>}>;stop_reason:string};
            let ht=false;
            for(const b of d.content){
              if(b.type==="text"&&b.text) emit("text",{delta:b.text});
              if(b.type==="tool_use"&&b.name&&b.id){
                ht=true;
                emit("tool_call",{tool:b.name,input:b.input??{},id:b.id});
                const t0=Date.now();const res=await executeTool(b.name,b.input??{},context,user.id,sb);const dur=Date.now()-t0;
                emit("tool_result",{tool:b.name,result:res.slice(0,2000),duration:dur});
                if(cid)await sb.from("assistant_tool_calls").insert({conversation_id:cid,tool_name:b.name,input:b.input??{},result:{text:res.slice(0,4000)},duration_ms:dur}).then(()=>{});
                loop.push({role:"tool",content:res,tool_call_id:b.id});
              }
            }
            if(ht) continue;
            break;
          }
          break;
        }
        for(const a of acts) emit("action",{action:a});
        saveMem(context,user.id,sb).catch(()=>{});
        if(cid){
          const lu=messages[messages.length-1];const la=loop[loop.length-1];
          if(lu?.role==="user")await sb.from("assistant_messages").insert({conversation_id:cid,role:"user",content:typeof lu.content==="string"?lu.content:JSON.stringify(lu.content),provider:prov}).then(()=>{});
          if(la?.role==="assistant")await sb.from("assistant_messages").insert({conversation_id:cid,role:"assistant",content:typeof la.content==="string"?la.content:JSON.stringify(la.content),provider:prov}).then(()=>{});
        }
        emit("done",{conversationId:cid});
      }catch(e){ctrl.enqueue(enc.encode(sse("error",{message:e instanceof Error?e.message:"Unknown error"})));}
      finally{ctrl.close();}
    }
  });
  return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"}});
}
