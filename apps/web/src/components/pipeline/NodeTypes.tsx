import { Handle, Position } from "reactflow";
import { MoreVertical, Loader2, CheckCircle, XCircle } from "lucide-react";
import { JsonViewer } from "./JsonViewer";

export const PipelineNode = ({ data, selected }: any) => {
  return (
    <div
      className={`w-80 p-5 rounded-2xl relative transition-all bg-[#12121a] ${
        selected
          ? "border-2 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.1)]"
          : "border border-white/[0.08] hover:border-white/[0.15]"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/20 !w-3 !h-3" />
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${data.iconBg || "bg-indigo-500/15"}`}>
            {data.icon || "⚡"}
          </div>
          <div>
            <p className="font-medium text-white">{data.label}</p>
            <p className="text-[10px] text-gray-500">{data.subLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           {data.status === 'running' && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
           {data.status === 'completed' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
           {data.status === 'error' && <XCircle className="w-4 h-4 text-red-400" />}
           <button className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 transition-colors">
            <MoreVertical className="w-4 h-4" />
           </button>
        </div>
      </div>
      
      <div className="bg-[#1a1a24] rounded-lg p-3 text-xs text-gray-400 font-mono">
        <div dangerouslySetInnerHTML={{ __html: data.content || "No configuration" }} />
      </div>

      {/* Output Preview for Webhook */}
      {data.output && (
        <div className="mt-3">
             <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] font-medium text-indigo-400">Response Data</span>
                <span className="text-[10px] text-gray-600">JSON</span>
             </div>
             <JsonViewer data={data.output} nodeLabel={data.label} />
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-white/20 !w-3 !h-3" />
    </div>
  );
};
