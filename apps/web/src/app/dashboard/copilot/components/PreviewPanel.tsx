import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Icons } from './Icons';
import { generatePreviewHtml } from '../utils';

const DEVICE_PRESETS = [
  { id: 'responsive', name: 'Responsive', width: '100%', height: '100%', icon: '🖥️' },
  { id: 'desktop', name: 'Desktop', width: 1440, height: 900, icon: '🖥️' },
  { id: 'laptop', name: 'Laptop', width: 1280, height: 800, icon: '💻' },
  { id: 'tablet', name: 'iPad Pro', width: 1024, height: 1366, icon: '📱' },
  { id: 'tablet-mini', name: 'iPad Mini', width: 768, height: 1024, icon: '📱' },
  { id: 'iphone-16-pro-max', name: 'iPhone 16 Pro Max', width: 440, height: 956, icon: '📱' },
  { id: 'iphone-16-pro', name: 'iPhone 16 Pro', width: 402, height: 874, icon: '📱' },
];

interface MoreActionsMenuProps {
  onRefresh: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onOpenNewTab: () => void;
  disabled: boolean;
}

interface DeviceSelectorProps {
  selected: string;
  onSelect: (deviceId: string) => void;
}

interface PreviewPanelProps {
  isVisible: boolean;
  code: string;
  language: string;
  previewMode: string;
  setPreviewMode: React.Dispatch<React.SetStateAction<string>>;
  chatId: string | null;
}

function MoreActionsMenu({ onRefresh, onCopy, onDownload, onOpenNewTab, disabled }: MoreActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button 
        onClick={() => setOpen(!open)}
        className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
        title="More options"
      >
        <div className="rotate-90">{Icons.moreHorizontal || '...'}</div>
      </button>
      {open && (
        <div className="absolute z-50 mt-2 py-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl min-w-[160px] right-0 overflow-hidden">
             <button onClick={() => { onRefresh(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left">
                {Icons.refresh} <span>Refresh Preview</span>
            </button>
            <button onClick={() => { onCopy(); setOpen(false); }} disabled={disabled} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left disabled:opacity-50">
                {Icons.copy} <span>Copy Code</span>
            </button>
            <button onClick={() => { onDownload(); setOpen(false); }} disabled={disabled} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left disabled:opacity-50">
                {Icons.download} <span>Download</span>
            </button>
            <div className="h-px bg-zinc-800 my-1" />
            <button onClick={() => { onOpenNewTab(); setOpen(false); }} disabled={disabled} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left disabled:opacity-50">
                {Icons.externalLink} <span>Open in New Tab</span>
            </button>
        </div>
      )}
    </div>
  );
}

function DeviceSelector({ selected, onSelect }: DeviceSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const device = DEVICE_PRESETS.find(d => d.id === selected);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
      
  return (
    <div ref={ref} className="relative">
      <button 
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-8 px-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors text-zinc-100 whitespace-nowrap"
        title={device?.name}
      >
        {Icons.phone}
        <span className="hidden sm:inline truncate max-w-[100px]">{device?.name || 'Responsive'}</span>
        {device?.width !== '100%' && <span className="text-zinc-500 text-xs hidden xl:inline">{device?.width}×{device?.height}</span>}
        {Icons.chevronDown}
      </button>
      {open && (
        <div className="absolute z-50 mt-2 py-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl min-w-[240px] right-0 max-h-80 overflow-y-auto">
          <div className="px-3 py-2 text-xs font-medium text-zinc-500 uppercase">Devices</div>
          {DEVICE_PRESETS.map(d => (
            <button
              key={d.id}
              onClick={() => { onSelect(d.id); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-zinc-800 transition-colors ${selected === d.id ? 'text-emerald-400' : 'text-zinc-300'}`}
            >
              <span className="flex items-center gap-2">
                 <span>{d.icon}</span>
                 <span>{d.name}</span>
               </span>
               {d.width !== '100%' && <span className="text-xs text-zinc-500">{d.width}×{d.height}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PreviewPanel({ isVisible, code, language, previewMode, setPreviewMode, chatId }: PreviewPanelProps) {
  const [selectedDevice, setSelectedDevice] = useState('responsive');
  const [iframeKey, setIframeKey] = useState(0);

  const device = DEVICE_PRESETS.find(d => d.id === selectedDevice);
  const isResponsive = selectedDevice === 'responsive';

  const previewHtml = useMemo(() => generatePreviewHtml(code), [code]);

  const iframeSrc = useMemo(() => {
    if (!previewHtml) return 'about:blank';
    const blob = new Blob([previewHtml], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [previewHtml]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code.${language === 'jsx' || language === 'tsx' ? 'tsx' : language}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenExternal = () => {
     if (chatId) {
         window.open(`/preview/${chatId}`, '_blank');
     } else {
         const blob = new Blob([previewHtml], { type: 'text/html' });
         window.open(URL.createObjectURL(blob), '_blank');
     }
  };

  if (!isVisible || !code) return null;

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
           {['preview', 'code'].map((m) => (
             <button
               key={m}
               onClick={() => setPreviewMode(m)}
               className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${previewMode === m ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
             >
               {m === 'preview' ? Icons.preview : Icons.code}
               <span className="hidden md:inline">{m}</span>
             </button>
           ))}
        </div>

        <div className="flex items-center gap-2">
           {(previewMode === 'preview' || previewMode === 'split') && (
             <DeviceSelector selected={selectedDevice} onSelect={setSelectedDevice} />
           )}
           <div className="flex items-center">
             <MoreActionsMenu 
                onRefresh={() => setIframeKey(k => k + 1)}
                onCopy={handleCopy}
                onDownload={handleDownload}
                onOpenNewTab={handleOpenExternal}
                disabled={!code}
             />
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {/* Preview Mode */}
        {previewMode === 'preview' && (
           <div className="h-full flex items-center justify-center bg-zinc-900 p-4 overflow-auto">
             {code ? (
               <div 
                 className={`bg-white overflow-hidden transition-all duration-300 ${!isResponsive ? 'device-frame shadow-2xl rounded-[24px]' : 'w-full h-full rounded-lg shadow-md'}`}
                 style={!isResponsive ? { width: device?.width, height: device?.height, maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' } : {}}
               >
                 <iframe key={iframeKey} src={iframeSrc} className="w-full h-full border-0" title="Preview" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
               </div>
             ) : (
                <div className="text-center text-zinc-500"><p>No preview available</p></div>
             )}
           </div>
        )}

        {/* Code Mode */}
        {previewMode === 'code' && (
           <div className="h-full overflow-auto bg-zinc-950 p-4">
             <pre className="text-sm font-mono leading-relaxed text-zinc-300">
               {code || 'No code yet'}
             </pre>
           </div>
        )}
      </div>
    </div>
  );
}
