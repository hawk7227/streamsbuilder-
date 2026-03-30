"use client";

/**
 * MediaEditor.tsx
 * Full image + video editor for the StreamsAI pipeline workspace.
 *
 * IMAGE MODE  — Fabric.js canvas: filters, text, draw, crop, shapes, undo/redo
 * VIDEO MODE  — HTML5 <video> + canvas overlay + WaveSurfer waveform + trim handles
 * EXPORT      — Image: canvas.toDataURL → PNG/JPG
 *               Video: MediaRecorder (canvas.captureStream) → WebM → ffmpeg.wasm → MP4
 * SHARE       — navigator.share() with File blob, clipboard fallback
 * DOWNLOAD    — <a download> with blob URL
 * DRAG-DROP   — drop any file onto canvas/video area
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Canvas as FabricCanvas, FabricImage as FabricImageType } from "fabric";

// ─── Types ────────────────────────────────────────────────────────────────────

type EditorMode = "image" | "video";
type Tool = "select" | "draw" | "text" | "rect" | "circle" | "arrow";

interface FilterValues {
  brightness: number;   // -1 → 1
  contrast: number;     // -1 → 1
  saturation: number;   // -1 → 1
  blur: number;         // 0 → 20
  hue: number;          // -180 → 180
  sepia: number;        // 0 → 1
  grayscale: boolean;
  invert: boolean;
}

interface TrimPoints {
  start: number;   // 0 → 1 (fraction of duration)
  end: number;
}

export interface MediaEditorProps {
  /** Initial image URL to load into the image editor */
  imageUrl?: string | null;
  /** Initial video URL to load into the video editor */
  videoUrl?: string | null;
  /** Called when user clicks "Send to Screen" — parent shows destination picker */
  onSendToScreen: (url: string, type: "image" | "video") => void;
  /** Called to log messages to the workspace log */
  onLog: (msg: string) => void;
}

// ─── Default filter values ────────────────────────────────────────────────────

const DEFAULT_FILTERS: FilterValues = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  hue: 0,
  sepia: 0,
  grayscale: false,
  invert: false,
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.download = filename;
  a.href = URL.createObjectURL(blob);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

async function shareOrDownload(blob: Blob, filename: string, onLog: (m: string) => void) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "StreamsAI export" });
      onLog("✓ Shared via system share sheet");
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  // Fallback: copy URL to clipboard
  try {
    await navigator.clipboard.writeText(URL.createObjectURL(blob));
    onLog("✓ URL copied to clipboard (share not supported)");
  } catch {
    downloadBlob(blob, filename);
    onLog("✓ Downloaded (share not supported)");
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MediaEditor({
  imageUrl,
  videoUrl,
  onSendToScreen,
  onLog,
}: MediaEditorProps) {
  // ── Mode ────────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<EditorMode>(videoUrl ? "video" : "image");

  // ── Image editor state ──────────────────────────────────────────────────────
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [textInput, setTextInput] = useState("Your text here");
  const [textColor, setTextColor] = useState("#ffffff");
  const [fontSize, setFontSize] = useState(28);
  const [drawColor, setDrawColor] = useState("#00d4aa");
  const [drawWidth, setDrawWidth] = useState(4);
  const [activePanel, setActivePanel] = useState<"filters" | "text" | "draw" | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── Video editor state ──────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<ReturnType<typeof import("wavesurfer.js")["default"]["create"]> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [trim, setTrim] = useState<TrimPoints>({ start: 0, end: 1 });
  const [draggingHandle, setDraggingHandle] = useState<"start" | "end" | "playhead" | null>(null);
  const [videoExporting, setVideoExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // ── Init Fabric.js ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "image") return;
    let fabricInstance: FabricCanvas | null = null;

    async function initFabric() {
      const { Canvas, PencilBrush } = await import("fabric");
      if (!canvasElRef.current) return;
      if (fabricRef.current) { fabricRef.current.dispose(); }

      const parent = canvasElRef.current.parentElement;
      const w = parent?.clientWidth || 720;
      const h = parent?.clientHeight || 480;

      const fc = new Canvas(canvasElRef.current, {
        width: w,
        height: h,
        backgroundColor: "#111827",
        selection: true,
      });
      fabricInstance = fc;
      fabricRef.current = fc;

      // Resize canvas when container resizes
      const ro = new ResizeObserver(entries => {
        const entry = entries[0];
        if (!entry || !fabricRef.current) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          fabricRef.current.setDimensions({ width, height });
          fabricRef.current.renderAll();
        }
      });
      if (parent) ro.observe(parent);

      fc.renderAll();

      // Load initial image
      if (imageUrl) {
        try {
          const { FabricImage } = await import("fabric");
          const img = await FabricImage.fromURL(imageUrl, { crossOrigin: "anonymous" });
          const scale = Math.min(
            (fc.width ?? 720) / (img.width ?? 1),
            (fc.height ?? 480) / (img.height ?? 1)
          );
          img.scale(scale);
          img.set({ left: 0, top: 0, selectable: true });
          fc.add(img);
          fc.sendObjectToBack(img);
          fc.renderAll();
          saveSnapshot(fc);
          onLog("✓ Image loaded into editor");
        } catch {
          onLog("⚠ Could not load image into editor");
        }
      }

      // Snapshot on modification
      fc.on("object:modified", () => saveSnapshot(fc));
      fc.on("object:added", () => saveSnapshot(fc));
    }

    initFabric().catch(console.error);

    return () => {
      if (fabricInstance) { fabricInstance.dispose(); fabricRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, imageUrl]);

  // ── Snapshot management ─────────────────────────────────────────────────────
  function saveSnapshot(fc: FabricCanvas) {
    const json = JSON.stringify(fc.toJSON());
    setHistory(prev => {
      const next = prev.slice(0, historyIdx + 1);
      next.push(json);
      setHistoryIdx(next.length - 1);
      return next;
    });
  }

  async function undo() {
    if (historyIdx <= 0 || !fabricRef.current) return;
    const prev = history[historyIdx - 1];
    await fabricRef.current.loadFromJSON(JSON.parse(prev));
    fabricRef.current.renderAll();
    setHistoryIdx(i => i - 1);
  }

  async function redo() {
    if (historyIdx >= history.length - 1 || !fabricRef.current) return;
    const next = history[historyIdx + 1];
    await fabricRef.current.loadFromJSON(JSON.parse(next));
    fabricRef.current.renderAll();
    setHistoryIdx(i => i + 1);
  }

  // ── Tool switching ──────────────────────────────────────────────────────────
  const switchTool = useCallback(async (t: Tool) => {
    setTool(t);
    if (!fabricRef.current) return;
    const fc = fabricRef.current;
    fc.isDrawingMode = false;
    fc.selection = true;

    if (t === "draw") {
      const { PencilBrush } = await import("fabric");
      fc.isDrawingMode = true;
      fc.freeDrawingBrush = new PencilBrush(fc);
      fc.freeDrawingBrush.color = drawColor;
      fc.freeDrawingBrush.width = drawWidth;
      setActivePanel("draw");
    } else if (t === "text") {
      setActivePanel("text");
    } else if (t === "select") {
      setActivePanel(null);
    } else if (t === "rect") {
      const { Rect } = await import("fabric");
      const rect = new Rect({
        left: 80, top: 80, width: 160, height: 100,
        fill: "rgba(103,232,249,0.18)", stroke: "#67e8f9", strokeWidth: 2,
      });
      fc.add(rect); fc.setActiveObject(rect); fc.renderAll();
    } else if (t === "circle") {
      const { Circle } = await import("fabric");
      const circle = new Circle({
        left: 80, top: 80, radius: 60,
        fill: "rgba(167,139,250,0.18)", stroke: "#a78bfa", strokeWidth: 2,
      });
      fc.add(circle); fc.setActiveObject(circle); fc.renderAll();
    }
  }, [drawColor, drawWidth]);

  // ── Add text to canvas ──────────────────────────────────────────────────────
  async function addText() {
    if (!fabricRef.current) return;
    const { IText } = await import("fabric");
    const txt = new IText(textInput, {
      left: 60, top: 60,
      fontSize, fill: textColor,
      fontFamily: "Inter, sans-serif",
      fontWeight: "700",
      shadow: new (require("fabric").Shadow)({ color: "rgba(0,0,0,0.6)", blur: 4, offsetX: 2, offsetY: 2 }),
    });
    fabricRef.current.add(txt);
    fabricRef.current.setActiveObject(txt);
    fabricRef.current.renderAll();
    onLog(`✓ Text added: "${textInput}"`);
  }

  // ── Apply filters ───────────────────────────────────────────────────────────
  const applyFilters = useCallback(async (f: FilterValues) => {
    if (!fabricRef.current) return;
    const { filters: FabricFilters } = await import("fabric");
    const fc = fabricRef.current;
    const objects = fc.getObjects();
    const baseImage = objects.find(o => o.type === "image") as FabricImageType | undefined;
    if (!baseImage) return;

    const activeFilters = [];
    if (f.brightness !== 0) activeFilters.push(new FabricFilters.Brightness({ brightness: f.brightness }));
    if (f.contrast !== 0) activeFilters.push(new FabricFilters.Contrast({ contrast: f.contrast }));
    if (f.saturation !== 0) activeFilters.push(new FabricFilters.Saturation({ saturation: f.saturation }));
    if (f.blur > 0) activeFilters.push(new FabricFilters.Blur({ blur: f.blur / 20 }));
    if (f.hue !== 0) activeFilters.push(new FabricFilters.HueRotation({ rotation: f.hue / 180 * Math.PI }));
    if (f.sepia > 0) activeFilters.push(new FabricFilters.Sepia());
    if (f.grayscale) activeFilters.push(new FabricFilters.Grayscale());
    if (f.invert) activeFilters.push(new FabricFilters.Invert());

    baseImage.filters = activeFilters;
    baseImage.applyFilters();
    fc.renderAll();
  }, []);

  useEffect(() => { applyFilters(filters); }, [filters, applyFilters]);

  // ── Delete selected object ──────────────────────────────────────────────────
  function deleteSelected() {
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObjects();
    active.forEach(o => fabricRef.current!.remove(o));
    fabricRef.current.discardActiveObject();
    fabricRef.current.renderAll();
  }

  // ── Image export ────────────────────────────────────────────────────────────
  async function exportImage(fmt: "png" | "jpg") {
    if (!fabricRef.current) return;
    setExporting(true);
    try {
      const dataUrl = fabricRef.current.toDataURL({ format: fmt === "jpg" ? "jpeg" : "png", quality: 0.95, multiplier: 2 });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const filename = `streamsai-export-${Date.now()}.${fmt}`;
      downloadBlob(blob, filename);
      onLog(`✓ Downloaded as ${filename}`);
    } catch (e) { onLog(`✗ Export failed: ${e}`); }
    setExporting(false);
  }

  async function shareImage() {
    if (!fabricRef.current) return;
    setExporting(true);
    try {
      const dataUrl = fabricRef.current.toDataURL({ format: "png", quality: 0.95, multiplier: 2 });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await shareOrDownload(blob, `streamsai-${Date.now()}.png`, onLog);
    } catch (e) { onLog(`✗ Share failed: ${e}`); }
    setExporting(false);
  }

  async function sendImageToScreen() {
    if (!fabricRef.current) return;
    const dataUrl = fabricRef.current.toDataURL({ format: "png", quality: 0.95, multiplier: 2 });
    onSendToScreen(dataUrl, "image");
    onLog("✓ Image ready — choose preview screen");
  }

  // ── Drag-drop onto image canvas ─────────────────────────────────────────────
  async function handleCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (!file || !fabricRef.current) return;
    const url = URL.createObjectURL(file);
    if (file.type.startsWith("image/")) {
      const { FabricImage } = await import("fabric");
      const img = await FabricImage.fromURL(url);
      const fc = fabricRef.current;
      const scale = Math.min((fc.width ?? 720) / (img.width ?? 1), (fc.height ?? 480) / (img.height ?? 1));
      img.scale(scale);
      fc.add(img); fc.sendObjectToBack(img); fc.renderAll();
      onLog(`✓ Dropped: ${file.name}`);
    } else if (file.type.startsWith("video/")) {
      setMode("video");
      // Parent will reload with videoUrl — for now log
      onLog(`⚠ Video dropped — switching to video editor: ${file.name}`);
    }
  }

  // ── Init WaveSurfer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "video" || !videoUrl || !waveformRef.current) return;
    let ws: typeof wavesurferRef.current = null;

    async function initWaveSurfer() {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      if (!waveformRef.current) return;
      if (wavesurferRef.current) { wavesurferRef.current.destroy(); }

      ws = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: "rgba(103,232,249,0.5)",
        progressColor: "rgba(103,232,249,0.9)",
        cursorColor: "#7c3aed",
        barWidth: 2,
        barGap: 1,
        height: 48,
        normalize: true,
        media: videoRef.current ?? undefined,
      });
      wavesurferRef.current = ws;
    }

    initWaveSurfer().catch(console.error);
    return () => { if (ws) ws.destroy(); };
  }, [mode, videoUrl]);

  // ── Video event listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    video.src = videoUrl;
    video.playbackRate = speed;
    video.volume = volume;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => {
      setDuration(video.duration);
      setTrim({ start: 0, end: 1 });
    };
    const onEnded = () => {
      setPlaying(false);
      // Loop within trim
      video.currentTime = trim.start * video.duration;
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("ended", onEnded);
    };
  }, [videoUrl, speed, volume]);

  // ── Enforce trim end during playback ────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playing) return;
    const check = () => {
      if (duration > 0 && video.currentTime >= trim.end * duration) {
        video.currentTime = trim.start * duration;
        if (!video.loop) video.pause();
        setPlaying(false);
      }
    };
    const id = setInterval(check, 100);
    return () => clearInterval(id);
  }, [playing, trim, duration]);

  // ── Timeline drag ────────────────────────────────────────────────────────────
  function getTimelineFraction(e: React.MouseEvent<HTMLDivElement>) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  function onTimelineMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const f = getTimelineFraction(e);
    const startDist = Math.abs(f - trim.start);
    const endDist = Math.abs(f - trim.end);
    const playheadDist = duration > 0 ? Math.abs(f - currentTime / duration) : 1;
    const minDist = Math.min(startDist, endDist, playheadDist);
    if (minDist === startDist && startDist < 0.04) { setDraggingHandle("start"); }
    else if (minDist === endDist && endDist < 0.04) { setDraggingHandle("end"); }
    else { setDraggingHandle("playhead"); if (videoRef.current && duration > 0) videoRef.current.currentTime = f * duration; }
  }

  function onTimelineMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!draggingHandle) return;
    const f = getTimelineFraction(e);
    if (draggingHandle === "start") setTrim(t => ({ ...t, start: Math.min(f, t.end - 0.02) }));
    else if (draggingHandle === "end") setTrim(t => ({ ...t, end: Math.max(f, t.start + 0.02) }));
    else if (draggingHandle === "playhead" && videoRef.current && duration > 0) videoRef.current.currentTime = f * duration;
  }

  function onTimelineMouseUp() { setDraggingHandle(null); }

  // ── Play/Pause ──────────────────────────────────────────────────────────────
  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (playing) { video.pause(); setPlaying(false); }
    else {
      if (duration > 0 && video.currentTime >= trim.end * duration) video.currentTime = trim.start * duration;
      video.play().catch(console.error);
      setPlaying(true);
    }
  }

  // ── Video export via MediaRecorder + ffmpeg.wasm ────────────────────────────
  async function exportVideo() {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    setVideoExporting(true);
    setExportProgress(0);
    recordedChunksRef.current = [];

    try {
      // Seek to trim start
      video.currentTime = trim.start * duration;
      await new Promise<void>(res => { video.onseeked = () => { video.onseeked = null; res(); }; });

      const stream = (video as HTMLVideoElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(30);
      if (!stream) throw new Error("captureStream not supported in this browser");

      // Add audio if available
      const audioCtx = new AudioContext();
      const src = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      src.connect(dest);
      const audioTracks = dest.stream.getAudioTracks();
      audioTracks.forEach(t => stream.addTrack(t));

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };

      await new Promise<void>((resolve, reject) => {
        mr.onstop = () => resolve();
        mr.onerror = reject;
        mr.start(100);
        video.play().catch(reject);

        const trimDurationMs = (trim.end - trim.start) * duration * 1000;
        let elapsed = 0;
        const tick = setInterval(() => {
          elapsed += 250;
          setExportProgress(Math.min(0.8, elapsed / trimDurationMs));
          if (elapsed >= trimDurationMs) {
            clearInterval(tick);
            mr.stop();
            video.pause();
          }
        }, 250);
      });

      setExportProgress(0.85);
      onLog("→ Encoding to MP4 via ffmpeg.wasm…");

      // Convert WebM → MP4 in browser
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }) => setExportProgress(0.85 + progress * 0.14));

      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      const webmBlob = new Blob(recordedChunksRef.current, { type: mimeType });
      await ffmpeg.writeFile("input.webm", await fetchFile(webmBlob));
      await ffmpeg.exec(["-i", "input.webm", "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", "output.mp4"]);
      const data = await ffmpeg.readFile("output.mp4");
      const mp4Blob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });

      setExportProgress(1);
      const filename = `streamsai-video-${Date.now()}.mp4`;
      downloadBlob(mp4Blob, filename);
      onLog(`✓ Video exported as ${filename}`);
      await audioCtx.close();
    } catch (e) {
      onLog(`✗ Video export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setVideoExporting(false);
    setExportProgress(0);
  }

  async function shareVideo() {
    if (!videoUrl) return;
    try {
      const res = await fetch(videoUrl);
      const blob = await res.blob();
      await shareOrDownload(blob, `streamsai-video-${Date.now()}.mp4`, onLog);
    } catch (e) { onLog(`✗ Share failed: ${e}`); }
  }

  function sendVideoToScreen() {
    if (!videoUrl) return;
    onSendToScreen(videoUrl, "video");
    onLog("✓ Video ready — choose preview screen");
  }

  // ── Video drag-drop ─────────────────────────────────────────────────────────
  function handleVideoDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (videoRef.current) { videoRef.current.src = url; }
    onLog(`✓ Video dropped: ${file.name}`);
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mode === "image") {
        if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
        if (e.key === "Delete" || e.key === "Backspace") { if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") deleteSelected(); }
      }
      if (mode === "video") {
        if (e.key === " " && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); togglePlay(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, historyIdx, history]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  const S = {
    root: { display: "flex", flexDirection: "column" as const, height: "100%", width: "100%", background: "rgba(255,255,255,0.01)", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" },
    header: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 },
    modeBtn: (active: boolean) => ({ padding: "4px 12px", borderRadius: 6, border: `1px solid ${active ? "rgba(103,232,249,0.4)" : "rgba(255,255,255,0.1)"}`, background: active ? "rgba(103,232,249,0.12)" : "transparent", color: active ? "#67e8f9" : "#475569", fontSize: 11, fontWeight: 700, cursor: "pointer" }),
    toolBtn: (active: boolean) => ({ width: 34, height: 34, borderRadius: 8, border: `1px solid ${active ? "rgba(103,232,249,0.4)" : "rgba(255,255,255,0.08)"}`, background: active ? "rgba(103,232,249,0.12)" : "rgba(255,255,255,0.03)", color: active ? "#67e8f9" : "#64748b", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }),
    actionBtn: { padding: "6px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 },
    primaryBtn: { padding: "6px 14px", borderRadius: 7, border: "none", background: "rgba(103,232,249,0.9)", color: "#000", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 },
    slider: { width: "100%", accentColor: "#67e8f9" },
    label: { fontSize: 10, color: "#475569", marginBottom: 2, display: "block" },
  };

  return (
    <div style={S.root}>
      {/* ── Header: mode toggle + mode-specific actions ── */}
      <div style={S.header}>
        <button style={S.modeBtn(mode === "image")} onClick={() => setMode("image")}>🖼 Image</button>
        <button style={S.modeBtn(mode === "video")} onClick={() => setMode("video")}>🎬 Video</button>
        <div style={{ flex: 1 }} />
        {/* Upload button */}
        <button onClick={() => (document.getElementById("media-editor-file-input") as HTMLInputElement)?.click()}
          style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(103,232,249,0.35)", background: "rgba(103,232,249,0.12)", color: "#67e8f9", fontSize: 11, fontWeight: 700, cursor: "pointer", marginRight: 6 }}>
          ⬆ Upload
        </button>
        <input id="media-editor-file-input" type="file" accept="image/*,video/*" style={{ display: "none" }}
          onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            if (file.type.startsWith("video/")) {
              if (videoRef.current) videoRef.current.src = url;
              setMode("video");
              onLog(`✓ Video loaded: ${file.name}`);
            } else if (file.type.startsWith("image/")) {
              const { FabricImage } = await import("fabric");
              if (!fabricRef.current) { setMode("image"); setTimeout(() => {}, 500); }
              if (fabricRef.current) {
                const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
                const fc = fabricRef.current;
                const scale = Math.min((fc.width ?? 720) / (img.width ?? 1), (fc.height ?? 480) / (img.height ?? 1));
                img.scale(scale);
                img.set({ left: 0, top: 0, selectable: true });
                fc.clear();
                fc.add(img);
                fc.sendObjectToBack(img);
                fc.renderAll();
                onLog(`✓ Image loaded: ${file.name}`);
              }
            }
            e.target.value = "";
          }} />
        <span style={{ fontSize: 10, color: "#334155" }}>
          {mode === "image" ? "Ctrl+Z undo · Del remove · drag to drop" : "Space play/pause · drag timeline"}
        </span>
      </div>

      {/* ══ IMAGE EDITOR ══ */}
      {mode === "image" && (
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Left toolbar */}
          <div style={{ width: 46, background: "rgba(0,0,0,0.2)", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 0", flexShrink: 0 }}>
            {([
              ["select", "↖", "Select"],
              ["draw", "✏", "Draw"],
              ["text", "T", "Text"],
              ["rect", "▭", "Rectangle"],
              ["circle", "○", "Circle"],
            ] as [Tool, string, string][]).map(([t, icon, label]) => (
              <button key={t} style={S.toolBtn(tool === t)} title={label} onClick={() => switchTool(t)}>{icon}</button>
            ))}
            <div style={{ flex: 1 }} />
            <button style={S.toolBtn(activePanel === "filters")} title="Filters" onClick={() => setActivePanel(p => p === "filters" ? null : "filters")}>⚙</button>
            <button style={{ ...S.toolBtn(false), color: "#f87171" }} title="Delete selected (Del)" onClick={deleteSelected}>🗑</button>
          </div>

          {/* Canvas */}
          <div
            style={{ flex: 1, position: "relative", overflow: "hidden", background: isDraggingOver ? "rgba(103,232,249,0.06)" : "#111827", transition: "background 150ms", minHeight: 0, minWidth: 0 }}
            onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleCanvasDrop}
          >
            <canvas ref={canvasElRef} style={{ display: "block", width: "100%", height: "100%" }} />
            {isDraggingOver && (
              <div style={{ position: "absolute", inset: 0, border: "2px dashed #67e8f9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <span style={{ color: "#67e8f9", fontSize: 13, fontWeight: 700 }}>Drop image here</span>
              </div>
            )}
            {!imageUrl && !fabricRef.current?.getObjects().length && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, pointerEvents: "none" }}>
                <div style={{ fontSize: 28, opacity: 0.15 }}>🖼</div>
                <div style={{ fontSize: 11, color: "#334155", textAlign: "center", lineHeight: 1.5 }}>Generate an image above,<br/>or drop an image file here</div>
              </div>
            )}
          </div>

          {/* Right panel — filters or text config */}
          {activePanel && (
            <div style={{ width: 200, background: "rgba(0,0,0,0.25)", borderLeft: "1px solid rgba(255,255,255,0.06)", padding: 12, overflowY: "auto", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {activePanel === "filters" ? "Filters" : activePanel === "text" ? "Text" : "Brush"}
                </span>
                <button onClick={() => setActivePanel(null)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>

              {activePanel === "filters" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {([
                    ["brightness", "Brightness", -1, 1, 0.01],
                    ["contrast", "Contrast", -1, 1, 0.01],
                    ["saturation", "Saturation", -1, 1, 0.01],
                    ["blur", "Blur", 0, 20, 0.5],
                    ["hue", "Hue Rotate", -180, 180, 1],
                    ["sepia", "Sepia", 0, 1, 0.01],
                  ] as [keyof FilterValues, string, number, number, number][]).map(([key, label, min, max, step]) => (
                    <div key={key}>
                      <span style={S.label}>{label}: {typeof filters[key] === "number" ? (filters[key] as number).toFixed(2) : ""}</span>
                      <input type="range" min={min} max={max} step={step} value={filters[key] as number}
                        onChange={e => setFilters(f => ({ ...f, [key]: parseFloat(e.target.value) }))}
                        style={S.slider} />
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(["grayscale", "invert"] as const).map(k => (
                      <label key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#94a3b8", cursor: "pointer" }}>
                        <input type="checkbox" checked={filters[k]} onChange={e => setFilters(f => ({ ...f, [k]: e.target.checked }))} />
                        {k.charAt(0).toUpperCase() + k.slice(1)}
                      </label>
                    ))}
                  </div>
                  <button onClick={() => setFilters(DEFAULT_FILTERS)} style={{ ...S.actionBtn, justifyContent: "center", fontSize: 10 }}>Reset filters</button>
                </div>
              )}

              {activePanel === "text" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={S.label}>Text content</span>
                  <input value={textInput} onChange={e => setTextInput(e.target.value)}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#f1f5f9", fontSize: 11, padding: "5px 8px", outline: "none" }} />
                  <span style={S.label}>Color</span>
                  <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} style={{ width: "100%", height: 28, cursor: "pointer", borderRadius: 4, border: "none" }} />
                  <span style={S.label}>Size: {fontSize}px</span>
                  <input type="range" min={10} max={120} value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} style={S.slider} />
                  <button onClick={addText} style={S.primaryBtn}>+ Add to canvas</button>
                </div>
              )}

              {activePanel === "draw" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={S.label}>Brush color</span>
                  <input type="color" value={drawColor} onChange={e => { setDrawColor(e.target.value); if (fabricRef.current?.freeDrawingBrush) fabricRef.current.freeDrawingBrush.color = e.target.value; }} style={{ width: "100%", height: 28, cursor: "pointer", borderRadius: 4, border: "none" }} />
                  <span style={S.label}>Width: {drawWidth}px</span>
                  <input type="range" min={1} max={40} value={drawWidth} onChange={e => { const v=parseInt(e.target.value); setDrawWidth(v); if (fabricRef.current?.freeDrawingBrush) fabricRef.current.freeDrawingBrush.width = v; }} style={S.slider} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Image bottom bar ── */}
      {mode === "image" && (
        <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
          <button style={S.actionBtn} onClick={undo} disabled={historyIdx <= 0} title="Ctrl+Z">↩ Undo</button>
          <button style={S.actionBtn} onClick={redo} disabled={historyIdx >= history.length - 1} title="Ctrl+Shift+Z">↪ Redo</button>
          <div style={{ flex: 1 }} />
          <button style={S.actionBtn} onClick={() => exportImage("png")} disabled={exporting}>⬇ PNG</button>
          <button style={S.actionBtn} onClick={() => exportImage("jpg")} disabled={exporting}>⬇ JPG</button>
          <button style={S.actionBtn} onClick={shareImage} disabled={exporting}>↗ Share</button>
          <button style={S.primaryBtn} onClick={sendImageToScreen}>→ Send to Screen</button>
        </div>
      )}

      {/* ══ VIDEO EDITOR ══ */}
      {mode === "video" && (
        <>
          {/* Video + overlay canvas */}
          <div
            style={{ flex: 1, position: "relative", background: "#000", minHeight: 0, overflow: "hidden" }}
            onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleVideoDrop}
          >
            <video
              ref={videoRef}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              playsInline
              preload="metadata"
            />
            <canvas
              ref={overlayCanvasRef}
              style={{ position: "absolute", inset: 0, pointerEvents: "none", width: "100%", height: "100%" }}
            />
            {!videoUrl && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <div style={{ fontSize: 28, opacity: 0.15 }}>🎬</div>
                <div style={{ fontSize: 11, color: "#334155", textAlign: "center", lineHeight: 1.5 }}>Generate a video above,<br/>or drop a video file here</div>
              </div>
            )}
            {isDraggingOver && (
              <div style={{ position: "absolute", inset: 0, border: "2px dashed #67e8f9", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(103,232,249,0.06)", pointerEvents: "none" }}>
                <span style={{ color: "#67e8f9", fontSize: 13, fontWeight: 700 }}>Drop video here</span>
              </div>
            )}
          </div>

          {/* Waveform */}
          {videoUrl && <div ref={waveformRef} style={{ background: "rgba(0,0,0,0.3)", flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.05)" }} />}

          {/* Timeline */}
          {videoUrl && duration > 0 && (
            <div
              ref={timelineRef}
              style={{ height: 36, background: "rgba(0,0,0,0.4)", borderTop: "1px solid rgba(255,255,255,0.07)", position: "relative", cursor: draggingHandle ? "grabbing" : "pointer", flexShrink: 0, userSelect: "none" }}
              onMouseDown={onTimelineMouseDown}
              onMouseMove={onTimelineMouseMove}
              onMouseUp={onTimelineMouseUp}
              onMouseLeave={onTimelineMouseUp}
            >
              {/* Inactive region left */}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${trim.start * 100}%`, background: "rgba(0,0,0,0.5)" }} />
              {/* Active region */}
              <div style={{ position: "absolute", left: `${trim.start * 100}%`, top: 0, bottom: 0, width: `${(trim.end - trim.start) * 100}%`, background: "rgba(103,232,249,0.08)", border: "1px solid rgba(103,232,249,0.3)" }} />
              {/* Inactive region right */}
              <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${(1 - trim.end) * 100}%`, background: "rgba(0,0,0,0.5)" }} />
              {/* Trim start handle */}
              <div style={{ position: "absolute", left: `${trim.start * 100}%`, top: 0, bottom: 0, width: 6, background: "#67e8f9", cursor: "ew-resize", transform: "translateX(-50%)" }} />
              {/* Trim end handle */}
              <div style={{ position: "absolute", left: `${trim.end * 100}%`, top: 0, bottom: 0, width: 6, background: "#67e8f9", cursor: "ew-resize", transform: "translateX(-50%)" }} />
              {/* Playhead */}
              {duration > 0 && (
                <div style={{ position: "absolute", left: `${(currentTime / duration) * 100}%`, top: 0, bottom: 0, width: 2, background: "#7c3aed", cursor: "ew-resize", transform: "translateX(-50%)" }} />
              )}
              {/* Time labels */}
              <div style={{ position: "absolute", bottom: 2, left: `${trim.start * 100}%`, fontSize: 8, color: "#67e8f9", paddingLeft: 4 }}>
                {(trim.start * duration).toFixed(1)}s
              </div>
              <div style={{ position: "absolute", bottom: 2, right: `${(1 - trim.end) * 100}%`, fontSize: 8, color: "#67e8f9", paddingRight: 4 }}>
                {(trim.end * duration).toFixed(1)}s
              </div>
            </div>
          )}

          {/* Video controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, flexWrap: "wrap" }}>
            {/* Transport */}
            <button style={S.toolBtn(false)} onClick={() => { if (videoRef.current && duration > 0) videoRef.current.currentTime = Math.max(trim.start * duration, currentTime - 5); }}>«5</button>
            <button style={S.toolBtn(playing)} onClick={togglePlay}>{playing ? "⏸" : "▷"}</button>
            <button style={S.toolBtn(false)} onClick={() => { if (videoRef.current && duration > 0) videoRef.current.currentTime = Math.min(trim.end * duration, currentTime + 5); }}>»5</button>
            <button style={S.toolBtn(false)} onClick={() => { if (videoRef.current && duration > 0) { videoRef.current.currentTime = trim.start * duration; setPlaying(false); videoRef.current.pause(); } }}>◼</button>

            {/* Time display */}
            {duration > 0 && (
              <span style={{ fontSize: 10, color: "#475569", minWidth: 80 }}>
                {currentTime.toFixed(1)}s / {(trim.end - trim.start).toFixed(1)}s
              </span>
            )}

            <div style={{ flex: 1 }} />

            {/* Volume */}
            <span style={{ fontSize: 10, color: "#475569" }}>🔊</span>
            <input type="range" min={0} max={1} step={0.05} value={volume}
              onChange={e => { const v=parseFloat(e.target.value); setVolume(v); if (videoRef.current) videoRef.current.volume = v; }}
              style={{ width: 60, accentColor: "#67e8f9" }} />

            {/* Speed */}
            {([0.5, 1, 1.5, 2] as const).map(s => (
              <button key={s} style={{ ...S.toolBtn(speed === s), width: "auto", padding: "0 6px", fontSize: 10 }}
                onClick={() => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s; }}>
                {s}×
              </button>
            ))}

            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />

            {/* Export + share */}
            {!videoExporting
              ? <button style={S.actionBtn} onClick={exportVideo}>⬇ Export MP4</button>
              : <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 80, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${exportProgress * 100}%`, background: "#67e8f9", transition: "width 250ms" }} />
                  </div>
                  <span style={{ fontSize: 9, color: "#67e8f9" }}>{Math.round(exportProgress * 100)}%</span>
                </div>
            }
            <button style={S.actionBtn} onClick={shareVideo}>↗ Share</button>
            <button style={S.primaryBtn} onClick={sendVideoToScreen}>→ Send to Screen</button>
          </div>
        </>
      )}
    </div>
  );
}
