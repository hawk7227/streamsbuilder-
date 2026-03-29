import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SystemStatusDashboard } from "@/components/status/SystemStatusDashboard";

// Admin-only: requires x-admin-secret header or ADMIN_SECRET env cookie
// In production, gate this behind your auth layer / middleware
export default async function SystemStatusPage() {
  const headersList = await headers();
  const adminSecret = headersList.get("x-admin-secret")
    ?? process.env["ADMIN_SECRET"];

  if (!adminSecret) {
    redirect("/");
  }

  return <SystemStatusDashboard adminSecret={adminSecret} />;
}

export const metadata = {
  title: "System Status — Streams",
  robots: "noindex",
};
