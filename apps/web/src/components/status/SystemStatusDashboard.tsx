"use client";

import { useState, useEffect, useCallback } from "react";
import { getSystemStatus } from "@/lib/api-client";
import type { SystemStatus } from "@streams/contracts";

const REFRESH_INTERVAL_MS = 15_000;

interface SystemStatusDashboardProps {
  adminSecret: string;
}

export function SystemStatusDashboard({ adminSecret }: SystemStatusDashboardProps) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetch_ = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getSystemStatus(adminSecret);
      setStatus(data);
      setError(null);
      setLastFetched(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setRefreshing(false);
    }
  }, [adminSecret]);

  // Initial fetch + auto-refresh
  useEffect(() => {
    void fetch_();
    const id = setInterval(() => void fetch_(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetch_]);

  const overall = status?.status ?? (error ? "down" : "unknown");

  return (
    <div style={styles.page}>
      {/* Header — fail-red when any service is down */}
      <div style={{ ...styles.header, background: headerBg(overall) }}>
        <div style={styles.headerContent}>
          <div style={styles.headerLeft}>
            <div
              style={{ ...styles.statusDot, background: statusDotColor(overall) }}
              aria-hidden="true"
            />
            <div>
              <h1 style={styles.title}>System Status</h1>
              <div style={{ ...styles.overallBadge, ...overallBadgeStyle(overall) }}>
                {overall.toUpperCase()}
              </div>
            </div>
          </div>
          <div style={styles.headerRight}>
            <button
              type="button"
              onClick={() => void fetch_()}
              disabled={refreshing}
              style={{ ...styles.refreshButton, opacity: refreshing ? 0.5 : 1 }}
              aria-label="Refresh"
            >
              {refreshing ? "…" : "↺ Refresh"}
            </button>
            {lastFetched && (
              <div style={styles.lastFetched}>
                Updated {lastFetched.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={styles.body}>
        {error && (
          <div style={styles.errorBanner} role="alert">
            <strong>Status check failed:</strong> {error}
          </div>
        )}

        {status && (
          <>
            {/* Services */}
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Services</h2>
              <div style={styles.serviceGrid}>
                {Object.entries(status.services).map(([name, svc]) => (
                  <div
                    key={name}
                    style={{
                      ...styles.serviceCard,
                      borderColor: svc === "ok"
                        ? "var(--color-ok-border)"
                        : svc === "degraded"
                        ? "var(--color-warn-border)"
                        : "var(--color-err-border)",
                    }}
                  >
                    <div style={styles.serviceHeader}>
                      <span style={styles.serviceName}>{name}</span>
                      <span style={{ ...styles.serviceBadge, ...serviceBadgeStyle(svc) }}>
                        {svc}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Queue depths */}
            {Object.keys(status.queues).length > 0 && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Queues</h2>
                <div style={styles.table}>
                  <div style={styles.tableHeader}>
                    <span>Queue</span>
                    <span>Active</span>
                    <span>Waiting</span>
                    <span>Failed</span>
                  </div>
                  {Object.entries(status.queues).map(([name, q]) => (
                    <div key={name} style={styles.tableRow}>
                      <span style={styles.queueName}>{name}</span>
                      <span style={styles.queueCell}>{q.active}</span>
                      <span style={styles.queueCell}>{q.waiting}</span>
                      <span style={{
                        ...styles.queueCell,
                        color: q.failed > 0 ? "var(--color-err-text)" : "inherit",
                        fontWeight: q.failed > 0 ? 500 : 400,
                      }}>
                        {q.failed}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Build report */}
            {status.buildReport && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Build Report</h2>
                <div style={styles.buildCard}>
                  <div style={styles.buildMeta}>
                    <span style={styles.buildMetaLabel}>Commit</span>
                    <span style={styles.buildMetaMono}>{status.buildReport.commit.slice(0, 8)}</span>
                    <span style={styles.buildMetaLabel}>Branch</span>
                    <span style={styles.buildMetaMono}>{status.buildReport.branch}</span>
                    <span style={styles.buildMetaLabel}>Built at</span>
                    <span>{new Date(status.buildReport.builtAt).toLocaleString()}</span>
                    <span style={styles.buildMetaLabel}>CI</span>
                    <span>{status.buildReport.ci ? "Yes" : "No"}</span>
                  </div>
                  <div style={styles.ciChecks}>
                    {Object.entries(status.buildReport.checks).map(([check, passed]) => (
                      <div
                        key={check}
                        style={{
                          ...styles.ciCheck,
                          background: passed ? "var(--color-ok-bg)" : "var(--color-err-bg)",
                          borderColor: passed ? "var(--color-ok-border)" : "var(--color-err-border)",
                          color: passed ? "var(--color-ok-text)" : "var(--color-err-text)",
                        }}
                      >
                        {passed ? "✓" : "✕"} {check}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Meta */}
            <section style={styles.section}>
              <div style={styles.meta}>
                <span style={styles.metaLabel}>Version</span>
                <span style={styles.metaMono}>{status.version}</span>
                <span style={styles.metaLabel}>Auto-refresh</span>
                <span>Every {REFRESH_INTERVAL_MS / 1000}s</span>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Overall = SystemStatus["status"] | "unknown";

function headerBg(status: Overall): string {
  switch (status) {
    case "ok":       return "var(--color-ok-bg)";
    case "degraded": return "var(--color-warn-bg)";
    case "down":     return "var(--color-err-bg)";
    default:         return "var(--color-bg-secondary)";
  }
}

function statusDotColor(status: Overall): string {
  switch (status) {
    case "ok":       return "var(--color-ok-text)";
    case "degraded": return "var(--color-warn-text)";
    case "down":     return "var(--color-err-text)";
    default:         return "var(--color-text-tertiary)";
  }
}

function overallBadgeStyle(status: Overall): React.CSSProperties {
  switch (status) {
    case "ok":       return { background: "var(--color-ok-bg)", color: "var(--color-ok-text)", borderColor: "var(--color-ok-border)" };
    case "degraded": return { background: "var(--color-warn-bg)", color: "var(--color-warn-text)", borderColor: "var(--color-warn-border)" };
    case "down":     return { background: "var(--color-err-bg)", color: "var(--color-err-text)", borderColor: "var(--color-err-border)" };
    default:         return { background: "var(--color-bg-tertiary)", color: "var(--color-text-secondary)", borderColor: "var(--color-border)" };
  }
}

function serviceBadgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case "ok":       return { background: "var(--color-ok-bg)", color: "var(--color-ok-text)" };
    case "degraded": return { background: "var(--color-warn-bg)", color: "var(--color-warn-text)" };
    case "down":     return { background: "var(--color-err-bg)", color: "var(--color-err-text)" };
    default:         return { background: "var(--color-bg-tertiary)", color: "var(--color-text-secondary)" };
  }
}

const styles = {
  page: { minHeight: "100vh", background: "var(--color-bg)" },
  header: {
    padding: "var(--spacing-8) var(--spacing-6)",
    borderBottom: "1px solid var(--color-border)",
    transition: "background var(--motion-slow) var(--motion-easing)",
  },
  headerContent: {
    maxWidth: "960px",
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--spacing-4)",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-4)",
  },
  statusDot: {
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    flexShrink: 0,
    transition: "background var(--motion-slow) var(--motion-easing)",
  },
  title: {
    fontSize: "var(--font-size-lg)",
    fontWeight: 500,
    color: "var(--color-text-primary)",
    marginBottom: "var(--spacing-1)",
  },
  overallBadge: {
    display: "inline-block",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: "var(--radius-full)",
    border: "1px solid",
    letterSpacing: "0.06em",
  },
  headerRight: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-end",
    gap: "var(--spacing-1)",
  },
  refreshButton: {
    padding: "var(--spacing-2) var(--spacing-4)",
    borderRadius: "var(--radius-full)",
    border: "1px solid var(--color-border-strong)",
    background: "var(--color-surface)",
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-primary)",
    cursor: "pointer",
    transition: "var(--transition-fast)",
  },
  lastFetched: {
    fontSize: "var(--font-size-xs)",
    color: "var(--color-text-tertiary)",
  },
  body: {
    maxWidth: "960px",
    margin: "0 auto",
    padding: "var(--spacing-8) var(--spacing-6)",
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--spacing-10)",
  },
  errorBanner: {
    padding: "var(--spacing-4)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-err-bg)",
    border: "1px solid var(--color-err-border)",
    color: "var(--color-err-text)",
    fontSize: "var(--font-size-sm)",
  },
  section: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--spacing-4)",
  },
  sectionTitle: {
    fontSize: "var(--font-size-sm)",
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  serviceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "var(--spacing-3)",
  },
  serviceCard: {
    padding: "var(--spacing-4)",
    borderRadius: "var(--radius-md)",
    border: "1px solid",
    background: "var(--color-surface)",
  },
  serviceHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  serviceName: {
    fontSize: "var(--font-size-sm)",
    fontWeight: 500,
    color: "var(--color-text-primary)",
    textTransform: "capitalize" as const,
  },
  serviceBadge: {
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    padding: "2px 8px",
    borderRadius: "var(--radius-full)",
  },
  table: {
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    overflow: "hidden",
    fontSize: "var(--font-size-sm)",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 80px 80px 80px",
    padding: "var(--spacing-3) var(--spacing-4)",
    background: "var(--color-bg-secondary)",
    color: "var(--color-text-secondary)",
    fontWeight: 500,
    fontSize: "var(--font-size-xs)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "1fr 80px 80px 80px",
    padding: "var(--spacing-3) var(--spacing-4)",
    borderTop: "1px solid var(--color-border)",
    color: "var(--color-text-primary)",
  },
  queueName: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
  },
  queueCell: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
  },
  buildCard: {
    padding: "var(--spacing-5)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--spacing-5)",
  },
  buildMeta: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "var(--spacing-2) var(--spacing-4)",
    alignItems: "baseline",
    fontSize: "var(--font-size-sm)",
  },
  buildMetaLabel: {
    color: "var(--color-text-secondary)",
    fontWeight: 500,
    fontSize: "var(--font-size-xs)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  buildMetaMono: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
  },
  ciChecks: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "var(--spacing-2)",
  },
  ciCheck: {
    padding: "var(--spacing-1) var(--spacing-3)",
    borderRadius: "var(--radius-full)",
    border: "1px solid",
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
  },
  meta: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "var(--spacing-2) var(--spacing-4)",
    fontSize: "var(--font-size-sm)",
  },
  metaLabel: {
    color: "var(--color-text-secondary)",
    fontWeight: 500,
    fontSize: "var(--font-size-xs)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  metaMono: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
  },
} as const;
