import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface JsonViewerProps {
  data: any;
  nodeLabel: string;
}

export const JsonViewer = ({ data, nodeLabel }: JsonViewerProps) => {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleCopy = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const formattedLabel = nodeLabel.toLowerCase().replace(/\s+/g, '_');
    const variablePath = `{{${formattedLabel}.${path}}}`;
    
    navigator.clipboard.writeText(variablePath);
    setCopiedPath(path);
    
    // Reset after 1 second
    setTimeout(() => {
      setCopiedPath(null);
    }, 1000);
  };

  const renderJson = (obj: any, path: string = ""): any => {
    if (typeof obj !== 'object' || obj === null) {
      const isCopied = copiedPath === path;
      
      return (
        <div 
          key={path} 
          className="group flex items-start gap-2 hover:bg-white/5 p-1 rounded cursor-pointer transition-colors relative"
          onClick={(e) => handleCopy(path, e)}
        >
          <span className="text-gray-500 shrink-0">{path.split('.').pop()}:</span>
          <span className="text-emerald-400 break-all">{String(obj)}</span>
          
          <button 
            className={`ml-auto flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded transition-all ${
              isCopied 
                ? "bg-emerald-500/20 text-emerald-400 opacity-100" 
                : "bg-indigo-500 text-white opacity-0 group-hover:opacity-100"
            }`}
          >
            {isCopied ? (
              <>
                <Check className="w-2.5 h-2.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-2.5 h-2.5" />
                Copy
              </>
            )}
          </button>
        </div>
      );
    }

    if (typeof obj === 'string' && (obj.startsWith('data:image/') || obj.match(/^https?:\/\/.*\.(jpeg|jpg|gif|png|webp)$/i))) {
         const isCopied = copiedPath === path;
         return (
            <div key={path} className="group relative">
                <div 
                  className="flex items-start gap-2 hover:bg-white/5 p-1 rounded cursor-pointer transition-colors"
                  onClick={(e) => handleCopy(path, e)}
                >
                  <span className="text-gray-500 shrink-0">{path.split('.').pop()}:</span>
                  <span className="text-emerald-400 break-all line-clamp-1">{String(obj)}</span>
                  
                  <button 
                    className={`ml-auto flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded transition-all ${
                      isCopied 
                        ? "bg-emerald-500/20 text-emerald-400 opacity-100" 
                        : "bg-indigo-500 text-white opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {isCopied ? <><Check className="w-2.5 h-2.5" /> Copied!</> : <><Copy className="w-2.5 h-2.5" /> Copy</>}
                  </button>
                </div>
                <div className="mt-1 ml-4 mb-2">
                    <img src={obj} alt="Preview" className="max-w-full h-auto max-h-32 rounded border border-white/10 object-contain bg-[#050505]" />
                </div>
            </div>
         );
    }

    return Object.entries(obj).map(([key, value]) => {
      const newPath = path ? `${path}.${key}` : key;
      if (typeof value === 'object' && value !== null) {
        return (
          <div key={newPath} className="ml-2 border-l border-white/10 pl-2">
            <div className="text-gray-500 py-1 text-[10px]">{key}</div>
            {renderJson(value, newPath)}
          </div>
        );
      }
      return renderJson(value, newPath);
    });
  };

  // Safe parse if string
  let parsedData = data;
  if (typeof data === 'string') {
      try {
          // Attempt to parse, but if it looks like a number, keep it as string to avoid confusion if needed, 
          // or if it's just a plain string that happens to be valid JSON (like "true"), parse it.
          // For this specific case, we want to treat image data URLs or plain text as is if they don't look like objects/arrays.
          const parsed = JSON.parse(data);
          if (typeof parsed === 'object' && parsed !== null) {
            parsedData = parsed;
          } else {
            // It was a primitive (number, boolean, string), keep as is or use parsed.
            // But if it was a string that became a number, we might want the string format if preserving leading zeros etc, 
            // but JSON.parse usually handles this fine. 
            // The main issue is "Invalid JSON" for simple strings.
            parsedData = parsed;
          }
      } catch (e) {
          // Not valid JSON, treat as raw string
          parsedData = data;
      }
  }

  return (
    <div className="w-full px-2 py-2 max-h-60 overflow-y-auto bg-[#1a1a24] border border-white/[0.08] rounded-lg text-xs font-mono text-gray-300">
      {renderJson(parsedData)}
    </div>
  );
};
