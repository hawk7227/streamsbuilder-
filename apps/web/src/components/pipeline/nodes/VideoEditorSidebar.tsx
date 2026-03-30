
"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Layers, Image as ImageIcon, Type, Video, Music, ChevronDown, ChevronRight, Settings } from "lucide-react";

interface Element {
    id: string;
    type: 'text' | 'video' | 'image' | 'voice' | 'component' | 'audio';
    text?: string;
    src?: string;
    duration?: number;
    start?: number;
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    settings?: any;
    [key: string]: any;
}

interface Scene {
    id: string;
    comment?: string;
    backgroundColor?: string;
    duration?: number;
    elements: Element[];
    transition?: any;
}

interface Project {
    resolution: string;
    quality: string;
    scenes: Scene[];
    elements: Element[]; // Global elements
}

interface VideoEditorSidebarProps {
    node: any;
    updateNodeData: (key: string, value: any) => void;
}

const defaultProject: Project = {
    resolution: "1080", // or "full-hd"
    quality: "high",
    scenes: [
        {
            id: crypto.randomUUID(),
            comment: "Scene 1",
            elements: []
        }
    ],
    elements: []
};

export function VideoEditorSidebar({ node, updateNodeData }: VideoEditorSidebarProps) {
    // Initialize project state from node data or default
    // We use a local state for immediate UI updates, and sync to node data on change
    const [project, setProject] = useState<Project>(() => {
        if (node.data.project) return node.data.project;
        // Fallback: try to parse jsonConfig if it exists and looks like a project
        if (node.data.jsonConfig) {
            try {
                const parsed = JSON.parse(node.data.jsonConfig);
                if (parsed.scenes) return parsed;
            } catch (e) { /* ignore */ }
        }
        return defaultProject;
    });

    const [activeTab, setActiveTab] = useState<'scenes' | 'global' | 'settings'>('scenes');
    const [expandedSceneId, setExpandedSceneId] = useState<string | null>(project.scenes[0]?.id || null);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

    // Render state
    const [isRendering, setIsRendering] = useState(false);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [renderSuccess, setRenderSuccess] = useState<string | null>(null);

    const handleRender = async () => {
        setIsRendering(true);
        setRenderError(null);
        setRenderSuccess(null);
        try {
            const res = await fetch("/api/video/render", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    project,
                    generationId: node.data.generationId || null,
                }),
            });
            const data = await res.json() as { outputUrl?: string; error?: string };
            if (!res.ok) throw new Error(data.error ?? "Render failed");
            updateNodeData("output", data.outputUrl);
            updateNodeData("videoUrl", data.outputUrl);
            setRenderSuccess(data.outputUrl ?? "");
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Render failed";
            setRenderError(msg);
            setTimeout(() => setRenderError(null), 5000);
        }
        setIsRendering(false);
    };

    // Sync to node data whenever project changes
    useEffect(() => {
        updateNodeData("project", project);
        // Also update jsonConfig for backward compatibility / advanced view sync
        updateNodeData("jsonConfig", JSON.stringify(project, null, 2));
    }, [project, updateNodeData]);

    const addScene = () => {
        const newScene: Scene = {
            id: crypto.randomUUID(),
            comment: `Scene ${project.scenes.length + 1}`,
            elements: []
        };
        setProject(prev => ({ ...prev, scenes: [...prev.scenes, newScene] }));
        setExpandedSceneId(newScene.id);
    };

    const removeScene = (sceneId: string) => {
        setProject(prev => ({ ...prev, scenes: prev.scenes.filter(s => s.id !== sceneId) }));
        if (expandedSceneId === sceneId) setExpandedSceneId(null);
    };

    const addElementToScene = (sceneId: string, type: Element['type']) => {
        const newElement: Element = {
            id: crypto.randomUUID(),
            type,
            // Default props based on type
            ...(type === 'text' && { text: "New Text", settings: { "font-size": "50px", color: "white" } }),
            ...(type === 'video' && { src: "", duration: 5 }),
            ...(type === 'image' && { src: "", duration: 3 }),
            ...(type === 'voice' && { text: "Hello", voice: "en-US-TonyNeural" }),
        };

        setProject(prev => ({
            ...prev,
            scenes: prev.scenes.map(scene => {
                if (scene.id === sceneId) {
                    return { ...scene, elements: [...scene.elements, newElement] };
                }
                return scene;
            })
        }));
        setSelectedElementId(newElement.id);
    };

    const updateElement = (sceneId: string, elementId: string, updates: Partial<Element>) => {
         setProject(prev => ({
            ...prev,
            scenes: prev.scenes.map(scene => {
                if (scene.id === sceneId) {
                    return {
                        ...scene,
                        elements: scene.elements.map(el => el.id === elementId ? { ...el, ...updates } : el)
                    };
                }
                return scene;
            })
        }));
    };

    const removeElement = (sceneId: string, elementId: string) => {
        setProject(prev => ({
            ...prev,
            scenes: prev.scenes.map(scene => {
                if (scene.id === sceneId) {
                    return { ...scene, elements: scene.elements.filter(el => el.id !== elementId) };
                }
                return scene;
            })
        }));
        if (selectedElementId === elementId) setSelectedElementId(null);
    };

    // --- RENDER HELPERS ---

    const renderElementForm = (sceneId: string, element: Element) => {
        return (
            <div className="space-y-3 p-3 bg-black/20 rounded border border-white/10 mt-2">
                <div className="flex justify-between items-center mb-2">
                     <span className="text-[10px] uppercase font-bold text-indigo-400">{element.type}</span>
                     <button onClick={() => removeElement(sceneId, element.id)} className="text-red-400 hover:text-red-300">
                        <Trash2 size={12} />
                     </button>
                </div>
                
                {/* Common Fields */}
                <div>
                     <label className="block text-[10px] text-gray-500">Duration (s)</label>
                     <input 
                        type="number" 
                        value={element.duration || ""} 
                        onChange={e => updateElement(sceneId, element.id, { duration: parseFloat(e.target.value) })}
                        placeholder="Auto"
                        className="w-full bg-[#12121a] border border-white/10 rounded px-2 py-1 text-xs"
                     />
                </div>

                 {/* Type Specific Fields */}
                {element.type === 'text' && (
                    <>
                        <div>
                             <label className="block text-[10px] text-gray-500">Text Content</label>
                             <textarea 
                                value={element.text || ""} 
                                onChange={e => updateElement(sceneId, element.id, { text: e.target.value })}
                                className="w-full bg-[#12121a] border border-white/10 rounded px-2 py-1 text-xs h-16"
                             />
                        </div>
                        {/* Simple Style Overrides */}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[10px] text-gray-500">Font Size</label>
                                <input 
                                    type="text" 
                                    value={element.settings?.['font-size'] || ""} 
                                    onChange={e => updateElement(sceneId, element.id, { settings: { ...element.settings, 'font-size': e.target.value } })}
                                    className="w-full bg-[#12121a] border border-white/10 rounded px-2 py-1 text-xs"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-500">Color</label>
                                <input 
                                    type="text" 
                                    value={element.settings?.color || ""} 
                                    onChange={e => updateElement(sceneId, element.id, { settings: { ...element.settings, color: e.target.value } })}
                                    className="w-full bg-[#12121a] border border-white/10 rounded px-2 py-1 text-xs"
                                />
                            </div>
                        </div>
                    </>
                )}

                {(element.type === 'video' || element.type === 'image') && (
                     <div>
                         <label className="block text-[10px] text-gray-500">Source URL</label>
                         <input 
                            type="text" 
                            value={element.src || ""} 
                            onChange={e => updateElement(sceneId, element.id, { src: e.target.value })}
                            placeholder="https://..."
                            className="w-full bg-[#12121a] border border-white/10 rounded px-2 py-1 text-xs"
                         />
                     </div>
                )}
                 
                 {element.type === 'video' && (
                     <div className="grid grid-cols-2 gap-2">
                          <div>
                             <label className="block text-[10px] text-gray-500">Trim Start</label>
                             <input 
                                type="number" 
                                value={element.trim_start || ""} 
                                onChange={e => updateElement(sceneId, element.id, { trim_start: parseFloat(e.target.value) })}
                                className="w-full bg-[#12121a] border border-white/10 rounded px-2 py-1 text-xs"
                             />
                          </div>
                           <div>
                             <label className="block text-[10px] text-gray-500">Trim End</label>
                             <input 
                                type="number" 
                                value={element.trim_end || ""} 
                                onChange={e => updateElement(sceneId, element.id, { trim_end: parseFloat(e.target.value) })}
                                className="w-full bg-[#12121a] border border-white/10 rounded px-2 py-1 text-xs"
                             />
                          </div>
                     </div>
                 )}

                 {element.type === 'voice' && (
                     <>
                        <div>
                             <label className="block text-[10px] text-gray-500">Text</label>
                             <textarea 
                                value={element.text || ""} 
                                onChange={e => updateElement(sceneId, element.id, { text: e.target.value })}
                                className="w-full bg-[#12121a] border border-white/10 rounded px-2 py-1 text-xs h-16"
                             />
                        </div>
                        <div>
                             <label className="block text-[10px] text-gray-500">Voice ID</label>
                             <input 
                                type="text" 
                                value={element.voice || ""} 
                                onChange={e => updateElement(sceneId, element.id, { voice: e.target.value })}
                                className="w-full bg-[#12121a] border border-white/10 rounded px-2 py-1 text-xs"
                             />
                        </div>
                     </>
                 )}

            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header / Tabs */}
            <div className="flex border-b border-white/10 mb-4">
                <button 
                  onClick={() => setActiveTab('scenes')}
                  className={`flex-1 py-2 text-xs font-medium ${activeTab === 'scenes' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-500'}`}
                >
                    Scenes
                </button>
                <button 
                  onClick={() => setActiveTab('settings')}
                  className={`flex-1 py-2 text-xs font-medium ${activeTab === 'settings' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-500'}`}
                >
                     Settings
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto pr-1">
                {activeTab === 'settings' && (
                    <div className="space-y-4">
                        <div>
                             <label className="block text-xs text-gray-500 mb-2">Resolution</label>
                             <select 
                                value={project.resolution} 
                                onChange={e => setProject(p => ({ ...p, resolution: e.target.value }))}
                                className="w-full bg-[#1a1a24] border border-white/10 rounded px-3 py-2 text-sm"
                             >
                                 <option value="1080">1080p (Full HD)</option>
                                 <option value="720">720p (HD)</option>
                                 <option value="square">Square (1:1)</option>
                                 <option value="portrait">Portrait (9:16)</option>
                             </select>
                        </div>
                        <div>
                             <label className="block text-xs text-gray-500 mb-2">Quality</label>
                             <select 
                                value={project.quality} 
                                onChange={e => setProject(p => ({ ...p, quality: e.target.value }))}
                                className="w-full bg-[#1a1a24] border border-white/10 rounded px-3 py-2 text-sm"
                             >
                                 <option value="low">Low (Fast)</option>
                                 <option value="medium">Medium</option>
                                 <option value="high">High</option>
                             </select>
                        </div>
                    </div>
                )}

                {activeTab === 'scenes' && (
                    <div className="space-y-2">
                        {project.scenes.map((scene, index) => (
                            <div key={scene.id} className="border border-white/10 rounded bg-[#1a1a24] overflow-hidden">
                                <div 
                                    className="flex items-center p-2 cursor-pointer bg-white/5 hover:bg-white/10"
                                    onClick={() => setExpandedSceneId(expandedSceneId === scene.id ? null : scene.id)}
                                >
                                    {expandedSceneId === scene.id ? <ChevronDown size={14} className="mr-2"/> : <ChevronRight size={14} className="mr-2"/>}
                                    <span className="text-xs font-medium flex-1">{scene.comment || `Scene ${index + 1}`}</span>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); removeScene(scene.id); }}
                                        className="text-gray-500 hover:text-red-400 p-1"
                                    >
                                        <Trash2 size={12}/>
                                    </button>
                                </div>

                                {expandedSceneId === scene.id && (
                                    <div className="p-2 border-t border-white/10">
                                         {/* Scene Settings */}
                                         <div className="mb-3">
                                             <label className="block text-[10px] text-gray-500 mb-1">Scene Name (Comment)</label>
                                             <input 
                                                value={scene.comment || ""}
                                                onChange={e => setProject(p => ({ 
                                                    ...p, 
                                                    scenes: p.scenes.map(s => s.id === scene.id ? { ...s, comment: e.target.value } : s)
                                                }))}
                                                className="w-full bg-[#12121a] border border-white/10 rounded px-2 py-1 text-xs"
                                             />
                                         </div>

                                        {/* Elements List */}
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[10px] font-bold text-gray-400">ELEMENTS</span>
                                                <div className="flex gap-1">
                                                    <button onClick={() => addElementToScene(scene.id, 'text')} className="p-1 hover:bg-white/10 rounded" title="Add Text"><Type size={12}/></button>
                                                    <button onClick={() => addElementToScene(scene.id, 'video')} className="p-1 hover:bg-white/10 rounded" title="Add Video"><Video size={12}/></button>
                                                    <button onClick={() => addElementToScene(scene.id, 'image')} className="p-1 hover:bg-white/10 rounded" title="Add Image"><ImageIcon size={12}/></button>
                                                    <button onClick={() => addElementToScene(scene.id, 'voice')} className="p-1 hover:bg-white/10 rounded" title="Add Voice"><Music size={12}/></button>
                                                </div>
                                            </div>

                                            {scene.elements.length === 0 && (
                                                <p className="text-[10px] text-gray-600 italic text-center py-2">No elements</p>
                                            )}

                                            {scene.elements.map(el => (
                                                <div key={el.id} className="ml-2">
                                                    <div 
                                                        className={`flex items-center p-1.5 rounded cursor-pointer ${selectedElementId === el.id ? 'bg-indigo-500/20 border border-indigo-500/50' : 'bg-[#12121a] border border-white/5 hover:border-white/20'}`}
                                                        onClick={() => setSelectedElementId(selectedElementId === el.id ? null : el.id)}
                                                    >
                                                        <span className="text-[10px] font-mono mr-2 opacity-50">{el.type}</span>
                                                        <span className="text-xs truncate flex-1">{el.text || el.src || "Element"}</span>
                                                    </div>
                                                    
                                                    {selectedElementId === el.id && renderElementForm(scene.id, el)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        <button 
                            onClick={addScene}
                            className="w-full py-2 flex items-center justify-center gap-2 border border-dashed border-gray-600 rounded hover:border-indigo-500 hover:text-indigo-400 text-xs text-gray-500 transition-colors"
                        >
                            <Plus size={14} /> Add Scene
                        </button>
                    </div>
                )}
            </div>

            {/* Save / Render footer */}
            <div className="border-t border-white/10 p-3 flex flex-col gap-2">
                {renderError && (
                    <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                        ✗ {renderError}
                    </div>
                )}
                {renderSuccess && (
                    <div className="text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">
                        ✓ Rendered — <a href={renderSuccess} target="_blank" rel="noreferrer" className="underline">View video ↗</a>
                    </div>
                )}
                <button
                    onClick={handleRender}
                    disabled={isRendering || project.scenes.length === 0}
                    className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isRendering ? (
                        <><span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Rendering…</>
                    ) : (
                        <>▶ Save &amp; Render</>
                    )}
                </button>
            </div>
        </div>
    );
}
