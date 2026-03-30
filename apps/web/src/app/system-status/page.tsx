import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SystemStatusDashboard } from "@/components/status/SystemStatusDashboard";

export default function SystemStatusPage() {
  const headersList = headers();
  const adminSecret = headersList.get("x-admin-secret")
    ?? process.env.ADMIN_SECRET;

  if (!adminSecret) {
    redirect("/");
  }

  return <SystemStatusDashboard adminSecret={adminSecret} />;
}

export const metadata = {
  title: "System Status — Streams",
  robots: "noindex",
};
