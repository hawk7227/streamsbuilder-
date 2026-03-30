"use client";

import React from "react";
import type { EnforcementLedgerEntry } from "@/lib/enforcement/types";

interface AssistantSessionViewProps {
  conversationId?: string;
  mode?: string;
  routeHealth: "ok" | "degraded" | "error";
  ledgerEntries: EnforcementLedgerEntry[];
}

export function AssistantSessionView({ conversationId, mode, routeHealth, ledgerEntries }: AssistantSessionViewProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#0A0C10] p-6 text-white shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Operator view</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Assistant session</h2>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${routeHealth === "ok" ? "bg-emerald-500/15 text-emerald-300" : routeHealth === "degraded" ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300"}`}>
          {routeHealth}
        </div>
      </div>
      <dl className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <dt className="text-[10px] uppercase tracking-[0.18em] text-white/40">Conversation</dt>
          <dd className="mt-2 text-sm text-white/85">{conversationId ?? "No active conversation ID"}</dd>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <dt className="text-[10px] uppercase tracking-[0.18em] text-white/40">Current mode</dt>
          <dd className="mt-2 text-sm text-white/85">{mode ?? "Unknown"}</dd>
        </div>
      </dl>
      <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-white/40">Latest validations</div>
        <div className="grid gap-3">
          {ledgerEntries.map((entry, index) => (
            <div key={`${entry.timestamp}-${index}`} className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white/85">{entry.category} · {entry.mode ?? "n/a"}</div>
                <div className={`rounded-full px-2 py-1 text-[10px] font-semibold ${entry.passed ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>{entry.passed ? "pass" : "fail"}</div>
              </div>
              <div className="mt-3 text-xs text-white/50">{entry.timestamp}</div>
              <div className="mt-3 grid gap-2">
                {entry.issues.length === 0 ? <div className="text-sm text-white/70">No issues.</div> : entry.issues.map((issue, issueIndex) => (
                  <div key={issueIndex} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
                    <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">{issue.severity}</span>
                    {issue.message}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
