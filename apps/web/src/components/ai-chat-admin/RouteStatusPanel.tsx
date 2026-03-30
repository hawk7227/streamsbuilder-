"use client";

import React, { useEffect, useState } from 'react';

interface RouteHealth {
  path: string;
  status: string;
  lastChecked: string;
  detail?: string;
}

export function RouteStatusPanel() {
  const [data, setData] = useState<RouteHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/operator/route-status', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) { const e = await r.json().catch(() => ({ error: 'Unknown' })) as { error?: string }; throw new Error(e.error ?? 'Failed'); }
        return r.json() as Promise<{ data?: RouteHealth[] }>;
      })
      .then((json) => setData(json.data ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load route status'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 text-white">
      <h3 className="text-sm font-semibold text-white/90">Route status</h3>
      <div className="mt-3 grid gap-2">
        {loading && <div className="text-sm text-white/50">Loading…</div>}
        {error && <div className="text-sm text-red-400/80">{error}</div>}
        {data.map((item) => (
          <div key={item.path} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{item.path}</div>
              <div className="text-xs text-white/45">{item.detail || 'No detail'}</div>
            </div>
            <div className={item.status === 'healthy' ? 'text-emerald-300' : 'text-amber-300'}>{item.status}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
