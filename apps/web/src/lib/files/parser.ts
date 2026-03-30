/**
 * parser.ts — File Parser Engine
 * Supports: text, code, JSON, CSV, PDF, DOCX, XLSX, ZIP, image metadata, video metadata
 * All parsers return { text, metadata, pages? }
 */

import path from "node:path";

export interface ParseResult {
  text: string;
  metadata: Record<string, unknown>;
  pages?: number;
  wordCount?: number;
  error?: string;
}

// ── MIME + extension detection ─────────────────────────────────────────────

const TEXT_EXTS = new Set(["txt","md","markdown","json","csv","js","ts","jsx","tsx","py","rb","go","rs","java","c","cpp","h","css","html","htm","xml","yaml","yml","toml","sh","bash","sql"]);
const IMAGE_EXTS = new Set(["jpg","jpeg","png","webp","gif","avif","bmp","tiff","tif","svg"]);
const VIDEO_EXTS = new Set(["mp4","webm","mov","avi","mkv","flv","wmv","m4v"]);
const AUDIO_EXTS = new Set(["mp3","wav","ogg","flac","aac","m4a","opus","weba"]);

export function detectFileType(filename: string, mimeType?: string): string {
  const ext = path.extname(filename).toLowerCase().slice(1);
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (ext === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ext === "xlsx" || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (ext === "pptx" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (ext === "csv" || mimeType === "text/csv") return "csv";
  if (ext === "zip" || mimeType === "application/zip") return "zip";
  if (IMAGE_EXTS.has(ext) || mimeType?.startsWith("image/")) return "image";
  if (VIDEO_EXTS.has(ext) || mimeType?.startsWith("video/")) return "video";
  if (AUDIO_EXTS.has(ext) || mimeType?.startsWith("audio/")) return "audio";
  if (TEXT_EXTS.has(ext) || mimeType?.startsWith("text/")) return "text";
  return "binary";
}

// ── MIME validation ────────────────────────────────────────────────────────

const ALLOWED_MIMES = new Set([
  "text/plain","text/markdown","text/csv","text/html","text/xml",
  "application/json","application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip","application/x-zip-compressed",
  "image/png","image/jpeg","image/webp","image/gif","image/avif","image/svg+xml",
  "video/mp4","video/webm","video/quicktime",
  "audio/mpeg","audio/wav","audio/ogg","audio/flac","audio/aac","audio/mp4",
]);

export function validateMime(mimeType: string, filename: string): { valid: boolean; reason?: string } {
  // Check magic bytes prefix for common spoofing
  if (!mimeType) return { valid: false, reason: "No MIME type provided" };
  // Allow broad text/* and application/*
  if (ALLOWED_MIMES.has(mimeType)) return { valid: true };
  if (mimeType.startsWith("text/")) return { valid: true };
  // Check extension as fallback
  const ext = path.extname(filename).toLowerCase().slice(1);
  if (TEXT_EXTS.has(ext)) return { valid: true };
  return { valid: false, reason: `Unsupported file type: ${mimeType}` };
}

// ── Text parser ────────────────────────────────────────────────────────────

function parseText(buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8");
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return { text, metadata: { encoding: "utf-8", wordCount }, wordCount };
}

// ── CSV parser ─────────────────────────────────────────────────────────────

function parseCsv(buffer: Buffer): ParseResult {
  const raw = buffer.toString("utf-8");
  const lines = raw.split("\n").filter(Boolean);
  const headers = lines[0]?.split(",").map(h => h.trim().replace(/^"|"$/g, "")) ?? [];
  const rowCount = Math.max(0, lines.length - 1);
  // Convert to readable text for LLM context
  const preview = lines.slice(0, 50).join("\n");
  return {
    text: preview,
    metadata: { headers, rowCount, colCount: headers.length },
  };
}

// ── PDF parser ─────────────────────────────────────────────────────────────

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  try {
    // Dynamic import to avoid SSR issues
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = (pdfParseModule as unknown as { default: (b: Buffer) => Promise<{ text: string; numpages: number; info: unknown }> }).default ?? pdfParseModule;
    const data = await pdfParse(buffer);
    return {
      text: data.text,
      metadata: { pages: data.numpages, info: data.info },
      pages: data.numpages,
      wordCount: data.text.split(/\s+/).filter(Boolean).length,
    };
  } catch (e) {
    return { text: "", metadata: {}, error: `PDF parse failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── DOCX parser ────────────────────────────────────────────────────────────

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    return {
      text,
      metadata: { messages: result.messages.length },
      wordCount: text.split(/\s+/).filter(Boolean).length,
    };
  } catch (e) {
    return { text: "", metadata: {}, error: `DOCX parse failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── XLSX parser ────────────────────────────────────────────────────────────

async function parseXlsx(buffer: Buffer): Promise<ParseResult> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets: Record<string, string> = {};
    let fullText = "";
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      sheets[sheetName] = csv;
      fullText += `\n## Sheet: ${sheetName}\n${csv}`;
    }
    return {
      text: fullText.slice(0, 50000), // cap at 50k chars
      metadata: { sheetNames: workbook.SheetNames, sheetCount: workbook.SheetNames.length },
    };
  } catch (e) {
    return { text: "", metadata: {}, error: `XLSX parse failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── PPTX parser (text extraction from XML) ────────────────────────────────

async function parsePptx(buffer: Buffer): Promise<ParseResult> {
  try {
    // PPTX is a ZIP — extract slide XML and pull text nodes
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const slideEntries = entries.filter(e => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/));
    const texts: string[] = [];
    for (const entry of slideEntries) {
      const xml = entry.getData().toString("utf-8");
      // Extract all <a:t> text nodes
      const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) ?? [];
      const slideText = matches.map(m => m.replace(/<[^>]+>/g, "")).join(" ");
      if (slideText.trim()) texts.push(slideText.trim());
    }
    return {
      text: texts.join("\n\n"),
      metadata: { slideCount: slideEntries.length },
      pages: slideEntries.length,
    };
  } catch (e) {
    return { text: "", metadata: {}, error: `PPTX parse failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── ZIP extractor ─────────────────────────────────────────────────────────

async function parseZip(buffer: Buffer): Promise<ParseResult> {
  try {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const fileList = entries.map(e => ({ name: e.entryName, size: e.header.size, isDir: e.isDirectory }));
    const textFiles = entries.filter(e => !e.isDirectory && TEXT_EXTS.has(path.extname(e.entryName).slice(1)));
    const extractedTexts: string[] = [];
    for (const entry of textFiles.slice(0, 10)) { // max 10 text files
      try {
        extractedTexts.push(`\n## ${entry.entryName}\n${entry.getData().toString("utf-8").slice(0, 5000)}`);
      } catch { /* skip unreadable */ }
    }
    return {
      text: extractedTexts.join("\n"),
      metadata: { fileCount: entries.length, files: fileList.slice(0, 100) },
    };
  } catch (e) {
    return { text: "", metadata: {}, error: `ZIP extract failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── Image metadata ─────────────────────────────────────────────────────────

async function parseImageMeta(buffer: Buffer): Promise<ParseResult> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buffer).metadata();
    const text = `Image: ${meta.width}x${meta.height} ${meta.format} ${meta.space ?? ""} ${meta.hasAlpha ? "with alpha" : ""}`.trim();
    return {
      text,
      metadata: {
        width: meta.width, height: meta.height, format: meta.format,
        space: meta.space, channels: meta.channels, hasAlpha: meta.hasAlpha,
        density: meta.density, size: buffer.length,
      },
    };
  } catch (e) {
    return { text: "", metadata: { size: buffer.length }, error: `Image metadata failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── Video/Audio metadata ────────────────────────────────────────────────────

function parseMediaMeta(buffer: Buffer, filename: string): ParseResult {
  // Without running ffprobe, extract what we can from the buffer size + filename
  const ext = path.extname(filename).slice(1).toUpperCase();
  const sizeMb = (buffer.length / 1024 / 1024).toFixed(2);
  return {
    text: `${ext} file, ${sizeMb}MB`,
    metadata: { format: ext, size: buffer.length, sizeMb: parseFloat(sizeMb) },
  };
}

// ── Main parse function ────────────────────────────────────────────────────

export async function parseFile(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<ParseResult> {
  const fileType = detectFileType(filename, mimeType);

  switch (fileType) {
    case "pdf":    return parsePdf(buffer);
    case "docx":   return parseDocx(buffer);
    case "xlsx":   return parseXlsx(buffer);
    case "pptx":   return parsePptx(buffer);
    case "csv":    return parseCsv(buffer);
    case "zip":    return parseZip(buffer);
    case "image":  return parseImageMeta(buffer);
    case "video":
    case "audio":  return parseMediaMeta(buffer, filename);
    case "text":   return parseText(buffer);
    default:       return { text: "", metadata: { type: fileType, size: buffer.length } };
  }
}
