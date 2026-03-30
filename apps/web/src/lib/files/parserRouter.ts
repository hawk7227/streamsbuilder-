import { parseFile } from '@/lib/files/parser';
import { classifyFile } from '@/lib/files/fileClassifier';

export interface ParsedArtifact {
  text: string;
  metadata: Record<string, unknown>;
  classification: ReturnType<typeof classifyFile>;
}

export async function parseByType(buffer: Buffer, filename: string, mimeType: string): Promise<ParsedArtifact> {
  const classification = classifyFile(filename, mimeType);
  const parsed = await parseFile(buffer, filename, mimeType);

  return {
    text: parsed.text ?? '',
    metadata: {
      ...parsed.metadata,
      parserKey: classification.parserKey,
      fileKind: classification.kind,
      ingestType: classification.ingestType,
    },
    classification,
  };
}
