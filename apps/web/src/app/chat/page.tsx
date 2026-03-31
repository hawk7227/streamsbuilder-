"use client";
export const dynamic = "force-dynamic";

import AIAssistant from "@/components/dashboard/AIAssistant";

export default function ChatPage() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0c10", overflow: "hidden" }}>
      <AIAssistant context={{}} />
    </div>
  );
}
