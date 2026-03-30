export type FileKind =
  | 'text'
  | 'code'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'csv'
  | 'json'
  | 'archive'
  | 'image'
  | 'video'
  | 'audio'
  | 'unknown';

export interface FileClassification {
  kind: FileKind;
  ingestType: 'knowledge' | 'asset' | 'voice_dataset';
  duplicateStrategy: 'copy-record' | 'clone-storage-object' | 'save-edited';
  parserKey: string;
}

const EXT_MAP: Record<string, FileClassification> = {
  txt: { kind: 'text', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'plainText' },
  md: { kind: 'text', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'plainText' },
  json: { kind: 'json', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'json' },
  csv: { kind: 'csv', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'csv' },
  js: { kind: 'code', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'code' },
  ts: { kind: 'code', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'code' },
  jsx: { kind: 'code', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'code' },
  tsx: { kind: 'code', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'code' },
  py: { kind: 'code', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'code' },
  sql: { kind: 'code', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'code' },
  pdf: { kind: 'pdf', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'pdf' },
  doc: { kind: 'docx', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'docx' },
  docx: { kind: 'docx', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'docx' },
  xls: { kind: 'xlsx', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'xlsx' },
  xlsx: { kind: 'xlsx', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'xlsx' },
  ppt: { kind: 'pptx', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'pptx' },
  pptx: { kind: 'pptx', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'pptx' },
  zip: { kind: 'archive', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'archive' },
  png: { kind: 'image', ingestType: 'asset', duplicateStrategy: 'clone-storage-object', parserKey: 'image' },
  jpg: { kind: 'image', ingestType: 'asset', duplicateStrategy: 'clone-storage-object', parserKey: 'image' },
  jpeg: { kind: 'image', ingestType: 'asset', duplicateStrategy: 'clone-storage-object', parserKey: 'image' },
  webp: { kind: 'image', ingestType: 'asset', duplicateStrategy: 'clone-storage-object', parserKey: 'image' },
  gif: { kind: 'image', ingestType: 'asset', duplicateStrategy: 'clone-storage-object', parserKey: 'image' },
  mp4: { kind: 'video', ingestType: 'asset', duplicateStrategy: 'clone-storage-object', parserKey: 'video' },
  mov: { kind: 'video', ingestType: 'asset', duplicateStrategy: 'clone-storage-object', parserKey: 'video' },
  webm: { kind: 'video', ingestType: 'asset', duplicateStrategy: 'clone-storage-object', parserKey: 'video' },
  wav: { kind: 'audio', ingestType: 'voice_dataset', duplicateStrategy: 'clone-storage-object', parserKey: 'audio' },
  mp3: { kind: 'audio', ingestType: 'voice_dataset', duplicateStrategy: 'clone-storage-object', parserKey: 'audio' },
  m4a: { kind: 'audio', ingestType: 'voice_dataset', duplicateStrategy: 'clone-storage-object', parserKey: 'audio' },
  flac: { kind: 'audio', ingestType: 'voice_dataset', duplicateStrategy: 'clone-storage-object', parserKey: 'audio' },
  aac: { kind: 'audio', ingestType: 'voice_dataset', duplicateStrategy: 'clone-storage-object', parserKey: 'audio' },
};

export function classifyFile(filename: string, mimeType = ''): FileClassification {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (EXT_MAP[ext]) return EXT_MAP[ext];

  if (mimeType.startsWith('image/')) return { kind: 'image', ingestType: 'asset', duplicateStrategy: 'clone-storage-object', parserKey: 'image' };
  if (mimeType.startsWith('video/')) return { kind: 'video', ingestType: 'asset', duplicateStrategy: 'clone-storage-object', parserKey: 'video' };
  if (mimeType.startsWith('audio/')) return { kind: 'audio', ingestType: 'voice_dataset', duplicateStrategy: 'clone-storage-object', parserKey: 'audio' };
  return { kind: 'unknown', ingestType: 'knowledge', duplicateStrategy: 'copy-record', parserKey: 'generic' };
}
