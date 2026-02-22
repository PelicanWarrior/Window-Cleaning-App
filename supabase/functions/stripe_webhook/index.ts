// Supabase Edge Function: stripe_webhook
// Handles Stripe webhook events to update Users.AccountLevel and subscription status.
// Required secrets:
// - STRIPE_SECRET_KEY
// - STRIPE_WEBHOOK_SECRET
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const supabaseUrl = Deno.env.get("FUNCTION_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("FUNCTION_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// Manual signature verification using Web Crypto API
async function verifyStripeSignature(
  body: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const secretBytes = encoder.encode(secret);

  // Parse signature header: "t=<timestamp>,v1=<signature>"
  const parts = signatureHeader.split(",");
  let timestamp = "";
  let signature = "";

  for (const part of parts) {
    const [label, value] = part.trim().split("=");
    if (label === "t") timestamp = value;
    if (label === "v1") signature = value;
  }

  if (!timestamp || !signature) {
    console.error("[stripe_webhook] Missing timestamp or signature in header");
    return false;
  }

  // Create the signed content: "<timestamp>.<body>"
  const signedContent = `${timestamp}.${body}`;
  const messageBytes = encoder.encode(signedContent);

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const computedSignature = await crypto.subtle.sign("HMAC", key, messageBytes);
  const computedSignatureHex = Array.from(new Uint8Array(computedSignature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedSignatureHex === signature;
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
  db: { schema: 'public' },
});

async function updateUserByIdOrCustomerId(
  userId: string | undefined,
  customerId: string | undefined,
  updates: Record<string, unknown>,
) {
  console.log("[stripe_webhook] updateUserByIdOrCustomerId called", { userId, customerId, updates });
  
  if (userId) {
    const url = `${supabaseUrl}/rest/v1/Users?id=eq.${userId}`;
    console.log("[stripe_webhook] Updating user by ID:", url);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(updates),
    });
    const result = response.ok ? { success: true } : await response.json();
    console.log("[stripe_webhook] Update result:", { status: response.status, ok: response.ok, result });
    return { error: response.ok ? null : result };
  }
  if (customerId) {
    const url = `${supabaseUrl}/rest/v1/Users?StripeCustomerId=eq.${customerId}`;
    console.log("[stripe_webhook] Updating user by customerId:", url);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(updates),
    });
    const result = response.ok ? { success: true } : await response.json();
    console.log("[stripe_webhook] Update result:", { status: response.status, ok: response.ok, result });
    return { error: response.ok ? null : result };
  }
  console.error("[stripe_webhook] Neither userId nor customerId provided");
  return { error: { message: "Missing user id and customer id" } } as const;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "stripe-signature, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return new Response("Missing webhook configuration", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const bodyString = await req.text();

  // Verify the signature
  const isValid = await verifyStripeSignature(bodyString, signature, webhookSecret);
  if (!isValid) {
    console.error("[stripe_webhook] Invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: Stripe.Event;
  try {
    event = JSON.parse(bodyString) as Stripe.Event;
  } catch (err) {
    console.error("[stripe_webhook] JSON parse error:", err);
    return new Response(`Failed to parse event: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        console.log("[stripe_webhook] checkout.session.completed event received");
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("[stripe_webhook] Session mode:", session.mode);
        if (session.mode !== "subscription") break;

        const userId = session.metadata?.user_id;
        const accountLevelId = Number(session.metadata?.account_level_id || 0);
        const subscriptionId = session.subscription as string | null;
        const customerId = session.customer as string | null;

        console.log("[stripe_webhook] Metadata:", { userId, accountLevelId, subscriptionId, customerId });

        const updates: Record<string, unknown> = {
          StripeCustomerId: customerId || null,
          StripeSubscriptionId: subscriptionId || null,
          StripeSubscriptionStatus: "active",
        };

        if (accountLevelId) updates.AccountLevel = accountLevelId;

        console.log("[stripe_webhook] Updates to apply:", JSON.stringify(updates));
        const result = await updateUserByIdOrCustomerId(userId, customerId || undefined, updates);
        if (result.error) {
          console.error("[stripe_webhook] Error updating user:", JSON.stringify(result.error));
        } else {
          console.log("[stripe_webhook] Successfully updated user");
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const status = subscription.status;
        const userId = subscription.metadata?.user_id;
        const accountLevelId = Number(subscription.metadata?.account_level_id || 0);
        const customerId = subscription.customer as string | null;

        const updates: Record<string, unknown> = {
          StripeCustomerId: customerId || null,
          StripeSubscriptionId: subscription.id,
          StripeSubscriptionStatus: status,
        };

        if (["active", "trialing"].includes(status) && accountLevelId) {
          updates.AccountLevel = accountLevelId;
        } else if (["canceled", "unpaid", "past_due", "incomplete_expired"].includes(status)) {
          updates.AccountLevel = 1;
        }

        await updateUserByIdOrCustomerId(userId, customerId || undefined, updates);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;
        const customerId = subscription.customer as string | null;

        const updates: Record<string, unknown> = {
          StripeCustomerId: customerId || null,
          StripeSubscriptionId: subscription.id,
          StripeSubscriptionStatus: "canceled",
          AccountLevel: 1,
        };

        await updateUserByIdOrCustomerId(userId, customerId || undefined, updates);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    return new Response(`Webhook handler error: ${err.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
