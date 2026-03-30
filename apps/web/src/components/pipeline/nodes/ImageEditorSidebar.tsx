"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { 
    Sliders, 
    RotateCw, 
    FlipHorizontal, 
    FlipVertical, 
    Save, 
    Image as ImageIcon,
    ZoomIn,
    ZoomOut,
    Download,
    Upload,
    Undo,
    Variable,
    MousePointer2
} from "lucide-react";

interface ImageEditorSidebarProps {
    node: any;
    updateNodeData: (key: string, value: any) => void;
}

interface ImageSettings {
    brightness: number | string;
    contrast: number | string;
    saturation: number | string;
    blur: number | string;
    grayscale: number | string;
    sepia: number | string;
    rotation: number | string;
    flipH: boolean;
    flipV: boolean;
    scale: number;
}

const defaultSettings: ImageSettings = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    grayscale: 0,
    sepia: 0,
    rotation: 0,
    flipH: false,
    flipV: false,
    scale: 1,
};


// Helper component for dynamic controls
const DynamicControl = ({ 
    label, 
    value, 
    onChange, 
    min, 
    max, 
    unit = "%" 
}: { 
    label: string, 
    value: number | string, 
    onChange: (val: number | string) => void,
    min: number, 
    max: number,
    unit?: string
}) => {
    // Determine mode based on value type or if string contains variable syntax
    const isVariable = typeof value === 'string' && (value.includes('{{') || isNaN(Number(value)));
    const [mode, setMode] = useState<'slider' | 'variable'>(isVariable ? 'variable' : 'slider');

    // Sync local mode if external value changes significantly (e.g. paste)
    useEffect(() => {
        if (isVariable && mode !== 'variable') setMode('variable');
    }, [value, isVariable, mode]);

    const handleModeToggle = () => {
        setMode(prev => prev === 'slider' ? 'variable' : 'slider');
    };

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] text-gray-500">
                <span>{label}</span>
                <button 
                    onClick={handleModeToggle}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors text-[9px] ${
                        mode === 'variable' 
                        ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400' 
                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                    }`}
                    title={mode === 'slider' ? "Switch to Variable" : "Switch to Slider"}
                >
                    {mode === 'slider' ? <MousePointer2 size={10} /> : <Variable size={10} />}
                    <span>{mode === 'slider' ? 'Manual' : 'Var'}</span>
                </button>
            </div>

            {mode === 'slider' ? (
                <div className="flex gap-2 items-center">
                    <input 
                        type="range" 
                        min={min} max={max} 
                        value={typeof value === 'number' ? value : 0} // Fallback for slider
                        onChange={(e) => onChange(parseInt(e.target.value))}
                        className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:rounded-full"
                    />
                    <span className="text-[10px] text-gray-400 w-8 text-right">{value}{unit}</span>
                </div>
            ) : (
                <input 
                    type="text" 
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="{{ variable }}"
                    className="w-full bg-[#1a1a24] border border-white/10 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-indigo-500 focus:bg-white/5 placeholder:text-gray-600"
                />
            )}
        </div>
    );
};

export function ImageEditorSidebar({ node, updateNodeData }: ImageEditorSidebarProps) {
    const [imageUrl, setImageUrl] = useState<string>(node.data.imageUrl || "");
    const [settings, setSettings] = useState<ImageSettings>(node.data.settings || defaultSettings);
    const [activeTab, setActiveTab] = useState<'adjust' | 'transform'>('adjust');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    
    // Initialize from node data
    useEffect(() => {
        if (node.data.imageUrl) setImageUrl(node.data.imageUrl);
        if (node.data.settings) setSettings(node.data.settings);
    }, [node.data.imageUrl, node.data.settings]);

    // Update node data when local state changes
    useEffect(() => {
        updateNodeData("settings", settings);
    }, [settings, updateNodeData]);

    useEffect(() => {
        updateNodeData("imageUrl", imageUrl);
    }, [imageUrl, updateNodeData]);

    // Helper to get numeric value for preview (fallback to default if variable)
    const getNum = (val: string | number, defaultVal: number = 0) => {
        if (typeof val === 'number') return val;
        // Check if string contains curly braces (variable)
        if (val.includes('{{')) return defaultVal;
        // Try parsing numerical string
        const parsed = parseFloat(val);
        return isNaN(parsed) ? defaultVal : parsed;
    };

    const drawImage = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageUrl) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageUrl;

        img.onload = () => {
             // Set canvas size to match image (or scaled)
             canvas.width = img.width;
             canvas.height = img.height;

             // Clear canvas
             ctx.clearRect(0, 0, canvas.width, canvas.height);

             // Use helper to get safe numbers for canvas
             const b = getNum(settings.brightness, 100);
             const c = getNum(settings.contrast, 100);
             const s = getNum(settings.saturation, 100);
             const bl = getNum(settings.blur, 0);
             const g = getNum(settings.grayscale, 0);
             const sp = getNum(settings.sepia, 0);

             // Apply Filters
             ctx.filter = `
                brightness(${b}%) 
                contrast(${c}%) 
                saturate(${s}%) 
                blur(${bl}px) 
                grayscale(${g}%) 
                sepia(${sp}%)
             `;

             // Apply Transformations
             ctx.save();
             ctx.translate(canvas.width / 2, canvas.height / 2);
             const rot = getNum(settings.rotation, 0);
             ctx.rotate((rot * Math.PI) / 180);
             ctx.scale(
                (settings.flipH ? -1 : 1) * settings.scale, 
                (settings.flipV ? -1 : 1) * settings.scale
             );
             ctx.drawImage(img, -img.width / 2, -img.height / 2);
             ctx.restore();

             setIsLoaded(true);
        };
    }, [imageUrl, settings]);

    useEffect(() => {
        drawImage();
    }, [drawImage]);

    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

    const handleSave = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const editedDataUri = canvas.toDataURL("image/png");
        // Keep local node output updated immediately
        updateNodeData("output", editedDataUri);

        const originalGenerationId = node.data.generationId || node.id;
        if (!originalGenerationId) {
            // No generation ID — just keep the local update
            setSaveSuccess("Saved locally.");
            setTimeout(() => setSaveSuccess(null), 2500);
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        setSaveSuccess(null);
        try {
            const res = await fetch("/api/generations/save-edited", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ originalGenerationId, editedDataUri }),
            });
            const data = await res.json() as { newGenerationId?: string; outputUrl?: string; error?: string };
            if (!res.ok) throw new Error(data.error ?? "Save failed");
            updateNodeData("generationId", data.newGenerationId);
            updateNodeData("imageUrl", data.outputUrl);
            setSaveSuccess("Saved to library.");
            setTimeout(() => setSaveSuccess(null), 3000);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Save failed";
            setSaveError(msg);
            setTimeout(() => setSaveError(null), 4000);
        }
        setIsSaving(false);
    };

    const resetSettings = () => {
        setSettings(defaultSettings);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                setImageUrl(event.target.result as string);
            }
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex flex-col">
            <div className="mb-4 space-y-3 border-b border-white/10 pb-4">
                 <div>
                    <label className="block text-xs text-gray-500 mb-2">Image Source</label>
                    <div className="flex gap-2">
                         <input 
                            type="text" 
                            value={imageUrl} 
                            onChange={(e) => setImageUrl(e.target.value)}
                            className="flex-1 bg-[#1a1a24] border border-white/10 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                            placeholder="https://example.com/image.jpg"
                         />
                    </div>
                     <p className="text-[10px] text-gray-600 mt-1">
                        Use output from previous step (e.g. {'{{step.output}}'}) or a direct URL.
                    </p>
                    
                    <div className="mt-2">
                        <label className="flex items-center justify-center w-full px-3 py-2 border border-dashed border-white/20 rounded-lg text-xs text-gray-400 hover:text-white hover:border-indigo-500 hover:bg-white/5 cursor-pointer transition-colors gap-2">
                            <Upload size={14} />
                            <span>Upload Image</span>
                            <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={handleFileUpload}
                            />
                        </label>
                    </div>
                 </div>
            </div>

            {/* Canvas Preview (Scaled Down) */}
            <div className="mb-4 bg-[#050505] border border-white/10 rounded-lg p-2 flex items-center justify-center min-h-[150px] overflow-hidden relative group">
                {!imageUrl ? (
                    <div className="text-gray-600 flex flex-col items-center">
                        <ImageIcon size={24} className="mb-2 opacity-50"/>
                        <span className="text-xs">No image loaded</span>
                    </div>
                ) : (
                    <canvas 
                        ref={canvasRef} 
                        className="max-w-full max-h-[200px] object-contain"
                    />
                )}
            </div>

            {/* Controls Tabs */}
            <div className="flex border-b border-white/10 mb-4">
                 <button 
                  onClick={() => setActiveTab('adjust')}
                  className={`flex-1 py-1.5 text-xs font-medium ${activeTab === 'adjust' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-500 hover:text-white'}`}
                >
                    <Sliders size={12} className="inline mr-1" /> Adjust
                </button>
                <button 
                  onClick={() => setActiveTab('transform')}
                  className={`flex-1 py-1.5 text-xs font-medium ${activeTab === 'transform' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-500 hover:text-white'}`}
                >
                    <RotateCw size={12} className="inline mr-1" /> Transform
                </button>
            </div>

            <div className="space-y-4">
                {activeTab === 'adjust' && (
                    <div className="space-y-4">
                        <DynamicControl 
                            label="Brightness" 
                            value={settings.brightness} 
                            onChange={(v) => setSettings({...settings, brightness: v})} 
                            min={0} max={200} 
                        />
                        <DynamicControl 
                            label="Contrast" 
                            value={settings.contrast} 
                            onChange={(v) => setSettings({...settings, contrast: v})} 
                            min={0} max={200} 
                        />
                        <DynamicControl 
                            label="Saturation" 
                            value={settings.saturation} 
                            onChange={(v) => setSettings({...settings, saturation: v})} 
                            min={0} max={200} 
                        />

                        {/* Filters */}
                         <div className="space-y-3 pt-2 border-t border-white/5">
                            <label className="text-[10px] font-bold text-gray-400">FILTERS</label>
                            
                            <DynamicControl 
                                label="Blur" 
                                value={settings.blur} 
                                onChange={(v) => setSettings({...settings, blur: v})} 
                                min={0} max={10} 
                                unit="px"
                            />
                            <DynamicControl 
                                label="Grayscale" 
                                value={settings.grayscale} 
                                onChange={(v) => setSettings({...settings, grayscale: v})} 
                                min={0} max={100} 
                            />
                            <DynamicControl 
                                label="Sepia" 
                                value={settings.sepia} 
                                onChange={(v) => setSettings({...settings, sepia: v})} 
                                min={0} max={100} 
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'transform' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => setSettings({...settings, rotation: getNum(settings.rotation, 0) + 90})}
                                className="flex flex-col items-center justify-center p-3 bg-[#1a1a24] hover:bg-white/5 border border-white/10 rounded-lg transition-colors"
                            >
                                <RotateCw size={16} className="mb-2 text-indigo-400" />
                                <span className="text-[10px] text-gray-400">Rotate +90°</span>
                            </button>

                            <button 
                                onClick={() => setSettings({...settings, rotation: getNum(settings.rotation, 0) - 90})}
                                className="flex flex-col items-center justify-center p-3 bg-[#1a1a24] hover:bg-white/5 border border-white/10 rounded-lg transition-colors"
                            >
                                <RotateCw size={16} className="mb-2 text-indigo-400 -scale-x-100" />
                                <span className="text-[10px] text-gray-400">Rotate -90°</span>
                            </button>

                            <button 
                                onClick={() => setSettings({...settings, flipH: !settings.flipH})}
                                className={`flex flex-col items-center justify-center p-3 bg-[#1a1a24] hover:bg-white/5 border border-white/10 rounded-lg transition-colors ${settings.flipH ? 'border-indigo-500/50 bg-indigo-500/10' : ''}`}
                            >
                                <FlipHorizontal size={16} className="mb-2 text-indigo-400" />
                                <span className="text-[10px] text-gray-400">Flip H</span>
                            </button>

                            <button 
                                onClick={() => setSettings({...settings, flipV: !settings.flipV})}
                                className={`flex flex-col items-center justify-center p-3 bg-[#1a1a24] hover:bg-white/5 border border-white/10 rounded-lg transition-colors ${settings.flipV ? 'border-indigo-500/50 bg-indigo-500/10' : ''}`}
                            >
                                <FlipVertical size={16} className="mb-2 text-indigo-400" />
                                <span className="text-[10px] text-gray-400">Flip V</span>
                            </button>
                        </div>

                        {/* Manual Rotation Input */}
                        <div>
                             <div className="flex justify-between items-center text-[10px] text-gray-500 mb-1">
                                <span>Rotation Angle</span>
                                <input 
                                    type="text" 
                                    value={settings.rotation}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setSettings(prev => ({ ...prev, rotation: isNaN(Number(val)) ? val : Number(val) }));
                                    }}
                                    className="bg-[#1a1a24] border border-white/10 rounded px-1.5 py-0.5 text-right text-[10px] text-gray-300 focus:outline-none focus:border-indigo-500 w-16"
                                    placeholder="0"
                                />
                             </div>
                             <p className="text-[10px] text-gray-600">Enter degrees (e.g. 90, 180) or a variable.</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-white/10 flex gap-2 flex-col">
                {saveError && (
                    <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                        ✗ {saveError}
                    </div>
                )}
                {saveSuccess && (
                    <div className="text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">
                        ✓ {saveSuccess}
                    </div>
                )}
                <div className="flex gap-2">
                    <button
                        onClick={resetSettings}
                        className="flex-1 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-xs text-gray-400 flex items-center justify-center gap-2"
                    >
                        <Undo size={14} /> Reset
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!imageUrl || isSaving}
                        className="flex-[2] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? (
                            <><span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                        ) : (
                            <><Save size={14} /> Save Changes</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
