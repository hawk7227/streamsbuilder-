import { NextResponse } from "next/server";
import Stripe from "stripe";
import { DEFAULT_PLAN_KEY } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { getPlanKeyFromPriceId } from "@/lib/stripe/prices";

export const runtime = "nodejs";

const webhookEvents = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const setProfileUpdates = async (
  updates: Record<string, unknown>,
  where: { id?: string; stripe_customer_id?: string }
) => {
  const supabase = createAdminClient();
  const query = supabase.from("profiles").update({
    ...updates,
    updated_at: new Date().toISOString(),
  });

  if (where.id) {
    await query.eq("id", where.id);
    return;
  }

  if (where.stripe_customer_id) {
    await query.eq("stripe_customer_id", where.stripe_customer_id);
  }
};

const handleCheckoutSessionCompleted = async (
  session: Stripe.Checkout.Session
) => {
  const userId = session.metadata?.user_id;
  if (!userId) {
    return;
  }

  const updates: Record<string, unknown> = {
    stripe_customer_id: session.customer ?? null,
    stripe_subscription_id: session.subscription ?? null,
    stripe_price_id: session.metadata?.price_id ?? null,
  };

  if (session.metadata?.plan_key) {
    updates.plan_id = session.metadata.plan_key;
  }

  if (session.metadata?.billing) {
    updates.plan_interval = session.metadata.billing;
  }

  await setProfileUpdates(updates, { id: userId });
};

const handleSubscriptionUpdate = async (
  subscription: Stripe.Subscription
) => {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const mapping = priceId ? getPlanKeyFromPriceId(priceId) : null;
  const isCanceled = subscription.status === "canceled";
  const isExpired = subscription.status === "incomplete_expired";

  const nextPlanKey =
    mapping?.planKey ?? (isCanceled || isExpired ? DEFAULT_PLAN_KEY : null);

  const currentPeriodEnd =
    "current_period_end" in subscription &&
    typeof (subscription as { current_period_end?: number }).current_period_end ===
      "number"
      ? (subscription as { current_period_end: number }).current_period_end
      : null;

  const updates: Record<string, unknown> = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    plan_status: subscription.status,
    plan_interval: mapping?.billing ?? null,
    plan_current_period_end: currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null,
  };

  if (nextPlanKey) {
    updates.plan_id = nextPlanKey;
  }

  if (isCanceled || isExpired) {
    updates.plan_id = DEFAULT_PLAN_KEY;
  }

  await setProfileUpdates(updates, { stripe_customer_id: customerId });
};

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    console.error("[stripe:webhook] Missing signature or secret", {
      hasSignature: Boolean(signature),
      hasSecret: Boolean(webhookSecret),
    });
    return NextResponse.json({ error: "Missing webhook signature" }, { status: 400 });
  }

  const stripe = getStripe();
  const body = Buffer.from(await request.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error("[stripe:webhook] Invalid signature", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (!webhookEvents.has(event.type)) {
    console.info("[stripe:webhook] Ignored event", { type: event.type });
    return NextResponse.json({ received: true });
  }

  switch (event.type) {
    case "checkout.session.completed":
      console.info("[stripe:webhook] Handling checkout.session.completed");
      await handleCheckoutSessionCompleted(
        event.data.object as Stripe.Checkout.Session
      );
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      console.info("[stripe:webhook] Handling subscription event", {
        type: event.type,
      });
      await handleSubscriptionUpdate(
        event.data.object as Stripe.Subscription
      );
      break;
    default:
      break;
  }

  console.info("[stripe:webhook] Processed event", { type: event.type });
  return NextResponse.json({ received: true });
}
