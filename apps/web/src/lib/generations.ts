export type GenerationType = "video" | "image" | "script" | "voice";

export interface GenerationRecord {
  id: string;
  type: GenerationType;
  prompt: string;
  title: string | null;
  status: string;
  aspect_ratio: string | null;
  duration: string | null;
  quality: string | null;
  style: string | null;
  output_url: string | null;
  external_id: string | null;
  favorited: boolean;
  progress: number | null;
  is_preview?: boolean | null;
  created_at: string;
}

interface GenerationListResponse {
  data: GenerationRecord[];
  error?: string;
}

interface GenerationCreateResponse {
  data?: GenerationRecord;
  error?: string;
}

export async function listGenerations(params: {
  type?: GenerationType;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.type) {
    searchParams.set("type", params.type);
  }
  if (params.limit) {
    searchParams.set("limit", params.limit.toString());
  }

  const response = await fetch(
    `/api/generations?${searchParams.toString()}`,
    {
      method: "GET",
    }
  );
  const payload = (await response.json()) as GenerationListResponse;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Failed to load generations");
  }

  return payload.data ?? [];
}

export async function createGeneration(payload: {
  type: GenerationType;
  prompt: string;
  title?: string;
  status?: string;
  aspectRatio?: string;
  duration?: string;
  quality?: string;
  style?: string;
  outputUrl?: string;
  externalId?: string;
  isPreview?: boolean;
}) {
  const response = await fetch("/api/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as GenerationCreateResponse;

  if (!response.ok) {
    throw new Error(data?.error ?? "Failed to create generation");
  }

  if (!data?.data) {
    throw new Error("No generation returned");
  }

  return data.data;
}

export async function updateGeneration(
  id: string,
  updates: { favorited?: boolean }
) {
  const response = await fetch(`/api/generations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error ?? "Failed to update generation");
  }

  return payload.data as GenerationRecord;
}

export async function deleteGeneration(id: string) {
  const response = await fetch(`/api/generations/${id}`, {
    method: "DELETE",
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error ?? "Failed to delete generation");
  }

  return payload as { success: boolean };
}
