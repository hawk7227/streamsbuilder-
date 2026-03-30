import { POST as AssistantPost } from '@/app/api/ai-assistant/route';

export async function POST(request: Request) {
  return AssistantPost(request);
}
