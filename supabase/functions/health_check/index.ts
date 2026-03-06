// Supabase Edge Function: health_check
// Simple CORS-enabled health check for client connectivity.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
  const keyMode = stripeSecretKey.startsWith("sk_live_")
    ? "live"
    : stripeSecretKey.startsWith("sk_test_")
      ? "test"
      : stripeSecretKey
        ? "unknown"
        : "missing";
  const webhookSecretMode = webhookSecret.startsWith("whsec_")
    ? "valid"
    : webhookSecret
      ? "invalid"
      : "missing";

  let stripeAccountLivemode: boolean | null = null;
  let stripeAccountId: string | null = null;
  let stripeAccountError: string | null = null;
  let stripeBalanceLivemode: boolean | null = null;
  let stripeBalanceError: string | null = null;

  if (stripeSecretKey) {
    try {
      const stripeResponse = await fetch("https://api.stripe.com/v1/account", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      });

      if (stripeResponse.ok) {
        const stripeAccount = await stripeResponse.json();
        stripeAccountId = stripeAccount?.id || null;
        stripeAccountLivemode = Boolean(stripeAccount?.livemode);
      } else {
        const stripeError = await stripeResponse.json().catch(() => ({}));
        stripeAccountError = stripeError?.error?.message || `Stripe account check failed (${stripeResponse.status})`;
      }
    } catch (error) {
      stripeAccountError = error?.message || "Stripe account check failed";
    }

    try {
      const balanceResponse = await fetch("https://api.stripe.com/v1/balance", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      });

      if (balanceResponse.ok) {
        const stripeBalance = await balanceResponse.json();
        stripeBalanceLivemode = Boolean(stripeBalance?.livemode);
      } else {
        const stripeError = await balanceResponse.json().catch(() => ({}));
        stripeBalanceError = stripeError?.error?.message || `Stripe balance check failed (${balanceResponse.status})`;
      }
    } catch (error) {
      stripeBalanceError = error?.message || "Stripe balance check failed";
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    timestamp: new Date().toISOString(),
    stripe: {
      configured: Boolean(stripeSecretKey),
      keyMode,
      accountId: stripeAccountId,
      accountLivemode: stripeAccountLivemode,
      accountError: stripeAccountError,
      balanceLivemode: stripeBalanceLivemode,
      balanceError: stripeBalanceError,
    },
    webhook: {
      configured: Boolean(webhookSecret),
      secretFormat: webhookSecretMode,
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
});
