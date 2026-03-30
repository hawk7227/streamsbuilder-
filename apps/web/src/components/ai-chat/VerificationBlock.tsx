"use client";

import React from "react";

interface VerificationBlockProps {
  text: string;
}

function extractSection(label: string, text: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}:([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, "i");
  return (text.match(regex)?.[1] ?? "").trim();
}

function Section({ label, body, tone }: { label: string; body: string; tone: string }) {
  if (!body) return null;

  return (
    <section className={`rounded-2xl border px-4 py-3 ${tone}`}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">{label}</div>
      <div className="whitespace-pre-wrap text-sm leading-6 text-white/90">{body}</div>
    </section>
  );
}

export function VerificationBlock({ text }: VerificationBlockProps) {
  const verified = extractSection("VERIFIED", text);
  const notVerified = extractSection("NOT VERIFIED", text);
  const requiresRuntime = extractSection("REQUIRES RUNTIME", text);
  const risks = extractSection("RISKS", text);

  if (!verified && !notVerified && !requiresRuntime && !risks) return null;

  return (
    <div className="mt-4 grid gap-3">
      <Section label="Verified" body={verified} tone="border-emerald-400/20 bg-emerald-500/10" />
      <Section label="Not Verified" body={notVerified} tone="border-amber-400/20 bg-amber-500/10" />
      <Section label="Requires Runtime" body={requiresRuntime} tone="border-sky-400/20 bg-sky-500/10" />
      <Section label="Risks" body={risks} tone="border-rose-400/20 bg-rose-500/10" />
    </div>
  );
}
