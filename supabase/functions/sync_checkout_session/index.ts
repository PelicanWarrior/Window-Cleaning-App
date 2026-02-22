// Supabase Edge Function: sync_checkout_session
// Syncs a Stripe checkout session to Users.AccountLevel.
// Required secrets:
// - STRIPE_SECRET_KEY
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
const supabaseUrl = Deno.env.get("FUNCTION_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("FUNCTION_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

async function updateUserByIdOrCustomerId(
  userId: string | undefined,
  customerId: string | undefined,
  updates: Record<string, unknown>,
) {
  if (userId) {
    const response = await fetch(`${supabaseUrl}/rest/v1/Users?id=eq.${userId}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(updates),
    });
    return { error: response.ok ? null : await response.json() };
  }
  if (customerId) {
    const response = await fetch(`${supabaseUrl}/rest/v1/Users?StripeCustomerId=eq.${customerId}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(updates),
    });
    return { error: response.ok ? null : await response.json() };
  }
  return { error: { message: "Missing user id" } } as const;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  if (!stripeSecretKey || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing sync configuration" });
  }

  try {
    const body = await req.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";

    if (!sessionId) {
      return jsonResponse(400, { error: "Missing sessionId" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const subscriptionFromSession =
      typeof session.subscription === "object" && session.subscription
        ? (session.subscription as Stripe.Subscription)
        : null;

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : subscriptionFromSession?.id || null;

    const subscription =
      !subscriptionFromSession && subscriptionId
        ? await stripe.subscriptions.retrieve(subscriptionId)
        : subscriptionFromSession;

    const userId =
      session.metadata?.user_id || subscription?.metadata?.user_id || undefined;
    const accountLevelId = Number(
      session.metadata?.account_level_id ||
        subscription?.metadata?.account_level_id ||
        0,
    );

    const customerId =
      (typeof session.customer === "string" ? session.customer : null) ||
      (typeof subscription?.customer === "string" ? subscription?.customer : null);

    const updates: Record<string, unknown> = {
      StripeCustomerId: customerId || null,
      StripeSubscriptionId: subscription?.id || subscriptionId || null,
      StripeSubscriptionStatus: subscription?.status || "active",
    };

    if (accountLevelId) {
      updates.AccountLevel = accountLevelId;
    }

    const result = await updateUserByIdOrCustomerId(
      userId,
      customerId || undefined,
      updates,
    );

    if (result.error) {
      return jsonResponse(500, { error: "Failed to update user", details: result.error });
    }

    return jsonResponse(200, {
      ok: true,
      updated: { userId, customerId, accountLevelId },
    });
  } catch (error) {
    return jsonResponse(500, { error: error.message || "Unexpected error" });
  }
});
