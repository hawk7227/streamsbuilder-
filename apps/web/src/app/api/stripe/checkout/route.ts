import { NextResponse } from "next/server";
import type { PlanKey } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";
import { getStripePriceId, type BillingInterval } from "@/lib/stripe/prices";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const planKey = body?.planKey as PlanKey | undefined;
  const billing = body?.billing as BillingInterval | undefined;

  if (!planKey || !billing) {
    return NextResponse.json(
      { error: "Missing plan or billing interval" },
      { status: 400 }
    );
  }

  if (planKey === "free" || planKey === "enterprise") {
    return NextResponse.json(
      { error: "Checkout not available for this plan" },
      { status: 400 }
    );
  }

  const priceId = getStripePriceId(planKey, billing);

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const stripe = getStripe();
  let customerId = profile?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: profile?.full_name ?? undefined,
      metadata: {
        user_id: user.id,
      },
    });

    customerId = customer.id;

    await supabase
      .from("profiles")
      .update({
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    allow_promotion_codes: true,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancel`,
    client_reference_id: user.id,
    metadata: {
      user_id: user.id,
      plan_key: planKey,
      billing,
      price_id: priceId,
    },
  });

  return NextResponse.json({ url: session.url });
}
