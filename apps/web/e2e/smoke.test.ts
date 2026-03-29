import { test, expect } from "@playwright/test";

/**
 * Smoke tests — run against preview and production after every deploy.
 * Fast, no auth required for public routes.
 * Admin routes tested with ADMIN_SECRET from environment.
 */

const ADMIN_SECRET = process.env["ADMIN_SECRET"] ?? "";

test.describe("Public routes", () => {
  test("/ redirects to /chat", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/chat/);
  });

  test("/chat loads composer", async ({ page }) => {
    await page.goto("/chat");
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  });

  test("/health returns 200", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

test.describe("Admin routes", () => {
  test.skip(!ADMIN_SECRET, "ADMIN_SECRET not set — skipping admin smoke tests");

  test("/api/system-status returns 200 with valid secret", async ({ request }) => {
    const res = await request.get("/api/system-status", {
      headers: { "x-admin-secret": ADMIN_SECRET },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { status: string };
    expect(["ok", "degraded"]).toContain(body.status);
  });

  test("/system-status page loads", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-admin-secret": ADMIN_SECRET });
    await page.goto("/system-status");
    await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  });

  test("/api/system-status returns 401 without secret", async ({ request }) => {
    const res = await request.get("/api/system-status");
    expect(res.status()).toBe(401);
  });
});

test.describe("API routes", () => {
  test("POST /api/bot validates schema", async ({ request }) => {
    const res = await request.post("/api/bot", {
      data: { invalid: true },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid request");
  });
});
