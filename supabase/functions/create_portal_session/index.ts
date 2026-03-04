// Supabase Edge Function: create_portal_session
// Creates a Stripe Billing Portal session for an existing customer.
// Required secrets:
// - STRIPE_SECRET_KEY
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function stripeRequest(path: string, body: URLSearchParams) {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "Stripe request failed";
    throw new Error(message);
  }

  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("FUNCTION_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("FUNCTION_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, { error: "Missing Supabase configuration" });
    }

    const body = await req.json();
    const userId = body?.userId;

    if (!userId) {
      return jsonResponse(400, { error: "Missing userId" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: user, error: userError } = await supabase
      .from("Users")
      .select("id, StripeCustomerId")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return jsonResponse(404, { error: "User not found" });
    }

    if (!user.StripeCustomerId) {
      return jsonResponse(400, { error: "User has no Stripe customer" });
    }

    const origin = req.headers.get("origin") || req.headers.get("referer") || "http://localhost:5173";
    const querySeparator = origin.includes("?") ? "&" : "?";
    const returnUrl = `${origin}${querySeparator}billing=return`;

    const params = new URLSearchParams();
    params.append("customer", user.StripeCustomerId);
    params.append("return_url", returnUrl);

    const portalSession = await stripeRequest("billing_portal/sessions", params);

    return jsonResponse(200, { url: portalSession.url });
  } catch (error) {
    return jsonResponse(500, { error: error.message || "Unexpected error" });
  }
});
