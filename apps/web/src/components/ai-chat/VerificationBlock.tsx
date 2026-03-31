"use client";

import React, { useState } from "react";
import type { BuilderVerifierBotPayload, BuilderVerifierFeatureSummary, UiBadge } from "@/lib/verifier/types";

// ── Badge config ──────────────────────────────────────────────────────────────

const BADGE_CONFIG: Record<UiBadge, { label: string; bg: string; color: string }> = {
  FULLY_VERIFIED:   { label: "FULLY VERIFIED",    bg: "rgba(16,185,129,0.12)",  color: "#10b981" },
  DEGRADED:         { label: "DEGRADED",           bg: "rgba(245,158,11,0.12)",  color: "#f59e0b" },
  GUARD_ONLY:       { label: "GUARD ONLY",         bg: "rgba(234,179,8,0.12)",   color: "#eab308" },
  ROUTE_ONLY:       { label: "ROUTE ONLY",         bg: "rgba(249,115,22,0.12)",  color: "#f97316" },
  CONFIG_MISSING:   { label: "CONFIG MISSING",     bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
  PERMISSION_DENIED:{ label: "PERMISSION DENIED",  bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
  INTEGRITY_FAILED: { label: "INTEGRITY FAILED",   bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
  FAILED:           { label: "FAILED",             bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
};

const LAYERS = ["route","guard","dependency","configuration","connectivity","permission","functional","integrity"] as const;
const LAYER_LABEL: Record<string, string> = { route:"Route", guard:"Guard", dependency:"Dep", configuration:"Config", connectivity:"Connect", permission:"Perm", functional:"Func", integrity:"Integrity" };

// Map BuilderVerifierFeatureSummary fields → pass/fail/na per layer
function layerStatus(feature: BuilderVerifierFeatureSummary, layer: string): "pass"|"fail"|"na" {
  switch (layer) {
    case "route":         return feature.routeExists        ? "pass" : "fail";
    case "guard":         return feature.authGuardWorks      ? "pass" : "fail";
    case "dependency":    return feature.dependencyReady     ? "pass" : "na";
    case "configuration": return feature.configurationReady  ? "pass" : "fail";
    case "connectivity":  return feature.connectivityReady   ? "pass" : "na";
    case "permission":    return feature.permissionsReady    ? "pass" : "fail";
    case "functional":    return feature.functionalProbePassed? "pass" : "na";
    case "integrity":     return feature.integrityProbePassed ? "pass" : "na";
    default: return "na";
  }
}

function Dot({ s }: { s: "pass"|"fail"|"na" }) {
  const bg = s === "pass" ? "#10b981" : s === "fail" ? "#ef4444" : "rgba(255,255,255,0.15)";
  return <span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:bg, flexShrink:0 }} />;
}

// ── Feature row ───────────────────────────────────────────────────────────────

function FeatureRow({ f }: { f: BuilderVerifierFeatureSummary }) {
  const [open, setOpen] = useState(false);
  const cfg = BADGE_CONFIG[f.uiBadge] ?? BADGE_CONFIG.FAILED;

  type ProposalShape = { id: string; category: string; executionMode: string; confidence: number; risk: string };
  const proposals = (f.repairProposals ?? []) as ProposalShape[];

  return (
    <div style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", paddingBottom:10, marginBottom:10 }}>
      {/* Title row */}
      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
        <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 7px", borderRadius:4, background:cfg.bg, color:cfg.color, fontSize:10, fontWeight:700, letterSpacing:"0.08em" }}>
          <span style={{ width:5, height:5, borderRadius:"50%", background:cfg.color, display:"inline-block" }} />
          {cfg.label}
        </span>
        <span style={{ fontSize:13, fontWeight:600, color:"#e5e7eb" }}>{f.featureName}</span>
        <button type="button" onClick={() => setOpen(v => !v)}
          style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", fontSize:10, color:"rgba(255,255,255,0.3)", padding:"0 4px" }}>
          {open ? "▲" : "▼"}
        </button>
      </div>

      {/* Layer dots */}
      <div style={{ display:"flex", gap:8, marginTop:5, flexWrap:"wrap" }}>
        {LAYERS.map(l => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:3 }}>
            <Dot s={layerStatus(f, l)} />
            <span style={{ fontSize:10, color:"rgba(255,255,255,0.38)" }}>{LAYER_LABEL[l]}</span>
          </div>
        ))}
      </div>

      {/* Critical failures */}
      {f.criticalFailures.length > 0 && (
        <div style={{ marginTop:5 }}>
          {f.criticalFailures.map((msg, i) => (
            <div key={i} style={{ display:"flex", gap:6, fontSize:11, color:"#fca5a5", marginTop:2 }}>
              <span style={{ flexShrink:0 }}>✗</span><span>{msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {f.warnings.length > 0 && (
        <div style={{ marginTop:4 }}>
          {f.warnings.map((msg, i) => (
            <div key={i} style={{ display:"flex", gap:6, fontSize:11, color:"#fcd34d", marginTop:2 }}>
              <span style={{ flexShrink:0 }}>⚠</span><span>{msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Repair proposals */}
      {proposals.length > 0 && (
        <div style={{ marginTop:5 }}>
          {proposals.map((p, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"rgba(255,255,255,0.5)", marginTop:2 }}>
              <span style={{ color:"#818cf8" }}>→</span>
              <span>Repair: <strong style={{ color:"#a5b4fc" }}>{p.category}</strong></span>
              <span style={{ padding:"1px 5px", borderRadius:3, fontSize:9, fontWeight:700,
                background: p.executionMode === "auto_apply" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                color:      p.executionMode === "auto_apply" ? "#10b981" : "#f59e0b" }}>
                {p.executionMode === "auto_apply" ? "AUTO" : p.executionMode === "approval_required" ? "APPROVAL" : "MANUAL"}
              </span>
              <span style={{ color:"rgba(255,255,255,0.25)" }}>{Math.round(p.confidence * 100)}% confidence</span>
            </div>
          ))}
        </div>
      )}

      {/* Expanded probe table */}
      {open && f.probes.length > 0 && (
        <div style={{ marginTop:8, background:"rgba(0,0,0,0.2)", borderRadius:6, padding:"8px 10px", overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
            <thead>
              <tr style={{ color:"rgba(255,255,255,0.3)", textAlign:"left" }}>
                {["Status","Probe","Level","Category","ms","Detail"].map(h => (
                  <th key={h} style={{ paddingRight:8, paddingBottom:4, fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f.probes.map(p => (
                <tr key={p.probeId} style={{ borderTop:"1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ paddingRight:8, paddingTop:3, paddingBottom:3 }}>
                    <span style={{ fontSize:9, fontWeight:700,
                      color: p.status === "pass" ? "#10b981" : p.status === "fail" ? "#ef4444" : p.status === "warning" ? "#f59e0b" : "rgba(255,255,255,0.2)" }}>
                      {p.status === "pass" ? "PASS" : p.status === "fail" ? "FAIL" : p.status === "warning" ? "WARN" : "N/A"}
                    </span>
                  </td>
                  <td style={{ paddingRight:8, paddingTop:3, color:"rgba(255,255,255,0.7)", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.probeName}</td>
                  <td style={{ paddingRight:8, paddingTop:3, color:"rgba(255,255,255,0.38)" }}>{p.level}</td>
                  <td style={{ paddingRight:8, paddingTop:3, color:"rgba(255,255,255,0.38)" }}>{p.category}</td>
                  <td style={{ paddingRight:8, paddingTop:3, color:"rgba(255,255,255,0.3)" }}>{p.durationMs}</td>
                  <td style={{ paddingTop:3, color:"rgba(255,255,255,0.38)", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {p.actual?.errorMessage ?? (p.actual?.httpStatus ? `HTTP ${p.actual.httpStatus}` : (p.evidence[0]?.label ?? ""))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Legacy text renderer ──────────────────────────────────────────────────────

function LegacyBlock({ text }: { text: string }) {
  function extract(label: string): string {
    const re = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}:([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, "i");
    return (text.match(re)?.[1] ?? "").trim();
  }
  const sections: [string, string, string][] = [
    ["VERIFIED", extract("VERIFIED"), "rgba(16,185,129,0.2)"],
    ["NOT VERIFIED", extract("NOT VERIFIED"), "rgba(245,158,11,0.2)"],
    ["REQUIRES RUNTIME", extract("REQUIRES RUNTIME"), "rgba(99,102,241,0.2)"],
    ["RISKS", extract("RISKS"), "rgba(239,68,68,0.2)"],
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:8 }}>
      {sections.filter(([,body]) => body).map(([label, body, border]) => (
        <div key={label} style={{ borderRadius:8, border:`1px solid ${border}`, padding:"10px 14px" }}>
          <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.12em", color:"rgba(255,255,255,0.5)", margin:"0 0 4px" }}>{label}</p>
          <pre style={{ fontSize:12, color:"rgba(255,255,255,0.8)", whiteSpace:"pre-wrap", margin:0 }}>{body}</pre>
        </div>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface VerificationBlockProps {
  payload?: BuilderVerifierBotPayload;
  text?: string;
}

export function VerificationBlock({ payload, text }: VerificationBlockProps) {
  if (payload) {
    const ok = payload.overallStatus === "pass";
    return (
      <div style={{ borderRadius:10, border:`1px solid ${ok ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`, background:"rgba(0,0,0,0.22)", padding:"12px 16px", marginTop:8 }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, flexWrap:"wrap", gap:6 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.15em", color:"rgba(255,255,255,0.3)" }}>STREAMS VERIFICATION</span>
            <span style={{ fontSize:9, color:"rgba(255,255,255,0.18)", fontFamily:"monospace" }}>{payload.runId}</span>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {payload.summary.fullyVerified  > 0 && <span style={{ fontSize:10, color:"#10b981" }}>● {payload.summary.fullyVerified} VERIFIED</span>}
            {payload.summary.degraded       > 0 && <span style={{ fontSize:10, color:"#f59e0b" }}>● {payload.summary.degraded} DEGRADED</span>}
            {payload.summary.failed         > 0 && <span style={{ fontSize:10, color:"#ef4444" }}>● {payload.summary.failed} FAILED</span>}
            {payload.summary.guardOnly      > 0 && <span style={{ fontSize:10, color:"#eab308" }}>● {payload.summary.guardOnly} GUARD ONLY</span>}
            {payload.summary.routeOnly      > 0 && <span style={{ fontSize:10, color:"#f97316" }}>● {payload.summary.routeOnly} ROUTE ONLY</span>}
          </div>
        </div>

        {/* Feature rows */}
        {payload.features.map(f => <FeatureRow key={f.featureId} f={f} />)}

        {/* Footer */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:6, background: ok ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)" }}>
          <span style={{ fontSize:12, fontWeight:700, color: ok ? "#10b981" : "#ef4444" }}>
            {ok ? "✓ ALL FEATURES VERIFIED" : `✗ ${payload.summary.failed + payload.summary.guardOnly + payload.summary.routeOnly} feature(s) need attention`}
          </span>
          <span style={{ fontSize:10, color:"rgba(255,255,255,0.22)", marginLeft:"auto" }}>
            {payload.environment} · {new Date(payload.finishedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  }

  if (text) return <LegacyBlock text={text} />;
  return null;
}
