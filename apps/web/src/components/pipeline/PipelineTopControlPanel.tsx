'use client';

import { useRef, useState } from "react";
import {
  Youtube,
  Image as ImageIcon,
  Video,
  FileText,
  Mic,
  Link2,
  ChevronDown,
  Play,
  Bot,
  Shield,
} from "lucide-react";

export type AutomationMode =
  | "manual_mode"
  | "hybrid_mode"
  | "full_ai_ideas"
  | "full_ai_ideas_with_rules"
  | "full_auto_production";

export type OutputMode =
  | "static_image"
  | "video"
  | "image_to_video"
  | "image_and_video"
  | "full_campaign_pack";

export type PipelineNiche = "telehealth" | "ecommerce";

type ReferenceType =
  | "youtube_url"
  | "image_upload"
  | "video_upload"
  | "document_upload"
  | "audio_upload"
  | "web_url";

export type IdeaCard = {
  id: string;
  title: string;
  subtitle: string;
  angle: string;
};

export type GovernanceSnapshot = {
  approvedFactsLoaded: boolean;
  imageRulesLoaded: boolean;
  videoRulesLoaded: boolean;
  marketingLogicLoaded: boolean;
};

export type ReferencePayload =
  | { type: "youtube_url" | "web_url"; value: string }
  | { type: "image_upload" | "video_upload" | "document_upload" | "audio_upload"; file: File };

type Props = {
  niche: PipelineNiche;
  setNiche: (value: PipelineNiche) => void;
  automationMode: AutomationMode;
  setAutomationMode: (value: AutomationMode) => void;
  outputMode: OutputMode;
  setOutputMode: (value: OutputMode) => void;
  selectedTemplate: string;
  setSelectedTemplate: (value: string) => void;
  conceptType: string;
  setConceptType: (value: string) => void;
  governance: GovernanceSnapshot;
  ideas: IdeaCard[];
  selectedIdeaId: string | null;
  onSelectIdea: (idea: IdeaCard) => void;
  onAnalyzeReference: (payload: ReferencePayload) => Promise<void>;
  onAskAI: (message: string) => Promise<void>;
  onRunStep: (step: string) => void;
  aiResponse?: string;
  aiLoading?: boolean;
  referenceLoading?: boolean;
};

const automationOptions: { value: AutomationMode; label: string }[] = [
  { value: "manual_mode", label: "Manual" },
  { value: "hybrid_mode", label: "Hybrid" },
  { value: "full_ai_ideas", label: "Full AI Ideas" },
  { value: "full_ai_ideas_with_rules", label: "Full AI + Rules" },
  { value: "full_auto_production", label: "Full Auto" },
];

const outputOptions: { value: OutputMode; label: string }[] = [
  { value: "static_image", label: "Static Image" },
  { value: "video", label: "Video" },
  { value: "image_to_video", label: "Image → Video" },
  { value: "image_and_video", label: "Image + Video" },
  { value: "full_campaign_pack", label: "Campaign Pack" },
];

const referenceButtons: {
  type: ReferenceType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { type: "youtube_url", label: "YouTube Link", icon: Youtube },
  { type: "image_upload", label: "Image Upload", icon: ImageIcon },
  { type: "video_upload", label: "Video Upload", icon: Video },
  { type: "document_upload", label: "Doc / PDF", icon: FileText },
  { type: "audio_upload", label: "Audio", icon: Mic },
  { type: "web_url", label: "Web URL", icon: Link2 },
];

export function PipelineTopControlPanel({
  niche,
  setNiche,
  automationMode,
  setAutomationMode,
  outputMode,
  setOutputMode,
  selectedTemplate,
  setSelectedTemplate,
  conceptType,
  setConceptType,
  governance,
  ideas,
  selectedIdeaId,
  onSelectIdea,
  onAnalyzeReference,
  onAskAI,
  onRunStep,
  aiResponse = "",
  aiLoading = false,
  referenceLoading = false,
}: Props) {
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [activeRefType, setActiveRefType] = useState<ReferenceType>("youtube_url");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleReferenceClick = (type: ReferenceType) => {
    setActiveRefType(type);
    if (type === "youtube_url" || type === "web_url") return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await onAnalyzeReference({
      type: activeRefType as "image_upload" | "video_upload" | "document_upload" | "audio_upload",
      file,
    });
    event.target.value = "";
  };

  const handleAnalyzeLink = async () => {
    if (!linkInput.trim()) return;
    await onAnalyzeReference({
      type: activeRefType === "web_url" ? "web_url" : "youtube_url",
      value: linkInput.trim(),
    });
  };

  return (
    <div className="w-full bg-[#0f0f18] flex flex-col">

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
        onChange={handleFileChange}
      />

      {/* ROW A — Niche / Mode / Output / Template / Concept */}
      <div className="flex items-center gap-2 flex-wrap px-3 pt-2.5 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px]">
          <span className="text-white/40">Niche</span>
          <select value={niche} onChange={(e) => setNiche(e.target.value as PipelineNiche)} className="bg-transparent outline-none text-white/90 text-[11px] cursor-pointer">
            <option value="telehealth">Telehealth</option>
            <option value="ecommerce">Ecommerce</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px]">
          <span className="text-white/40">Mode</span>
          <select value={automationMode} onChange={(e) => setAutomationMode(e.target.value as AutomationMode)} className="bg-transparent outline-none text-white/90 text-[11px] cursor-pointer">
            {automationOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px]">
          <span className="text-white/40">Output</span>
          <select value={outputMode} onChange={(e) => setOutputMode(e.target.value as OutputMode)} className="bg-transparent outline-none text-white/90 text-[11px] cursor-pointer">
            {outputOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px]">
          <span className="text-white/40">Template</span>
          <input value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)} placeholder="e.g. clinical_lifestyle" className="bg-transparent outline-none text-white/90 text-[11px] w-28 placeholder:text-white/20" />
        </div>
        <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px]">
          <span className="text-white/40">Concept</span>
          <input value={conceptType} onChange={(e) => setConceptType(e.target.value)} placeholder="e.g. trust_first" className="bg-transparent outline-none text-white/90 text-[11px] w-24 placeholder:text-white/20" />
        </div>
      </div>

      {/* ROW B — Governance Snapshot */}
      <div className="border-b border-white/[0.06]">
        <button onClick={() => setGovernanceOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-cyan-300 hover:bg-white/[0.02] transition-colors">
          <span className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" />
            Governance Snapshot
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform duration-150 ${governanceOpen ? "rotate-180" : ""}`} />
        </button>
        {governanceOpen && (
          <div className="px-3 pb-2.5 grid grid-cols-2 gap-1.5">
            {[
              { label: "Approved facts", loaded: governance.approvedFactsLoaded },
              { label: "Image rules", loaded: governance.imageRulesLoaded },
              { label: "Video rules", loaded: governance.videoRulesLoaded },
              { label: "Marketing logic", loaded: governance.marketingLogicLoaded },
            ].map(({ label, loaded }) => (
              <div key={label} className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-2.5 py-1.5 text-[10px]">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${loaded ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className={loaded ? "text-white/60" : "text-red-400"}>{label} {loaded ? "loaded" : "missing"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ROW C — Pre-run Preview Matrix (only when ideas exist) */}
      {ideas.length > 0 && (
        <div className="px-3 py-2 border-b border-white/[0.06]">
          <div className="text-[9px] uppercase tracking-[0.15em] text-white/30 mb-2">Pre-run Preview Matrix</div>
          <div className="grid grid-cols-3 gap-2">
            {ideas.map((idea) => (
              <button
                key={idea.id}
                onClick={() => onSelectIdea(idea)}
                className={`rounded-xl border p-2.5 text-left transition-colors ${
                  selectedIdeaId === idea.id
                    ? "border-cyan-400/60 bg-cyan-400/10"
                    : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
                <div className="text-[9px] uppercase text-white/30 mb-1">{idea.angle}</div>
                <div className="text-[11px] font-semibold text-white mb-2">{idea.title}</div>
                <div className="h-14 rounded-lg bg-white/[0.04] mb-2" />
                <div className="text-center text-[10px] rounded-lg bg-cyan-400 py-1 text-black font-semibold">Select</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ROW D — Reference input buttons */}
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5 flex-wrap">
          {referenceButtons.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => handleReferenceClick(type)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap border transition-colors ${
                activeRefType === type
                  ? "bg-cyan-400/15 text-cyan-300 border-cyan-400/30"
                  : "bg-white/[0.05] text-white/60 border-white/[0.07] hover:bg-white/[0.09]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
        {(activeRefType === "youtube_url" || activeRefType === "web_url") && (
          <div className="mt-2 flex gap-2">
            <input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder={activeRefType === "youtube_url" ? "Paste YouTube link..." : "Paste web URL..."}
              className="flex-1 rounded-lg bg-white/[0.05] border border-white/[0.08] px-3 py-1.5 text-[11px] text-white/90 outline-none placeholder:text-white/20"
            />
            <button
              onClick={handleAnalyzeLink}
              disabled={referenceLoading}
              className="rounded-lg bg-cyan-400 px-3 py-1.5 text-[11px] font-semibold text-black disabled:opacity-60"
            >
              {referenceLoading ? "..." : "Analyze"}
            </button>
          </div>
        )}
      </div>

      {/* ROW E — AI Creative Direction */}
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <div className="text-[10px] text-white/30 mb-1.5">AI Creative Direction</div>
        {aiResponse && (
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-white/80 mb-2 leading-relaxed">
            {aiResponse}
          </div>
        )}
        {!aiResponse && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white/30 mb-2">
            AI will recommend the strongest production path, not just agree.
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && chatInput.trim()) void onAskAI(chatInput); }}
            placeholder="Ask AI..."
            disabled={aiLoading}
            className="flex-1 rounded-lg bg-white/[0.05] border border-white/[0.08] px-3 py-1.5 text-[11px] text-white/90 outline-none placeholder:text-white/20 disabled:opacity-50"
          />
          <button
            onClick={() => { if (chatInput.trim() && !aiLoading) void onAskAI(chatInput); }}
            disabled={aiLoading}
            className="rounded-lg bg-white/[0.07] border border-white/[0.1] px-3 py-1.5 text-[11px] text-cyan-300 flex items-center gap-1.5 disabled:opacity-50"
          >
            <Bot className="w-3.5 h-3.5" />
            {aiLoading ? "..." : "Ask"}
          </button>
        </div>
      </div>

      {/* ROW F — Step buttons + Run Full Pipeline */}
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
        {["Script", "Image", "Video", "Validator", "OCR QA", "Export"].map((step) => (
          <button
            key={step}
            onClick={() => onRunStep(step)}
            className="rounded-lg bg-white/[0.05] border border-white/[0.07] px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/[0.09] transition-colors"
          >
            {step}
          </button>
        ))}
        <button
          onClick={() => onRunStep("Run Full Pipeline")}
          className="ml-auto rounded-lg bg-cyan-400 px-3 py-1.5 text-[11px] font-semibold text-black flex items-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5" />
          Run Full Pipeline
        </button>
      </div>

    </div>
  );
}
