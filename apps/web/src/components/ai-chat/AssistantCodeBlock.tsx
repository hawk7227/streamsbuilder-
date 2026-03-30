"use client";

import React, { useMemo, useState } from "react";

interface AssistantCodeBlockProps {
  code: string;
  language?: string;
}

export function AssistantCodeBlock({ code, language }: AssistantCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const label = useMemo(() => language?.toUpperCase() ?? "CODE", [language]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0A0C10] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/20 hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-6 text-white/90"><code>{code}</code></pre>
    </div>
  );
}
