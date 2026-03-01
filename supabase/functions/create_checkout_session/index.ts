// Supabase Edge Function: create_checkout_session
// Creates a Stripe Checkout Session for subscriptions.
// Required secrets:
// - STRIPE_SECRET_KEY
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// Optional secrets:
// - STRIPE_CURRENCY (default: gbp)

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

async function stripeGet(path: string, params?: URLSearchParams) {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  const query = params && params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`https://api.stripe.com/v1/${path}${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
    },
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
    const stripeCurrency = (Deno.env.get("STRIPE_CURRENCY") || "gbp").toLowerCase();

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, { error: "Missing Supabase configuration" });
    }

    const body = await req.json();
    const userId = body?.userId;
    const accountLevelId = body?.accountLevelId;
    const userEmailRaw = body?.userEmail;
    const userNameRaw = body?.userName;
    const debug = body?.debug === true;

    // Log incoming request
    console.log("[create_checkout_session] Received request:", {
      userId,
      accountLevelId,
      userEmail: userEmailRaw,
      userName: userNameRaw,
      debug,
    });

    if (!userId || !accountLevelId) {
      return jsonResponse(400, { error: "Missing userId or accountLevelId" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
      db: { schema: 'public' },
    });

    const userEmail = typeof userEmailRaw === "string" ? userEmailRaw.trim() : null;
    const userName = typeof userNameRaw === "string" ? userNameRaw.trim() : null;

    let user = null as {
      id: unknown;
      email_address: string | null;
      StripeCustomerId: string | null;
      StripeSubscriptionId?: string | null;
      StripeSubscriptionStatus?: string | null;
    } | null;
    const debugInfo: Record<string, unknown> = {
      lookup: {
        userId,
        userEmail,
        userName,
      },
      matched: {
        byId: false,
        byIdNumber: false,
        byEmail: false,
        byUserName: false,
      },
    };

    // Try to find user by ID using PostgREST API with proper table name
    try {
      console.log("[user_lookup] Attempting lookup by ID:", userId);
      const response = await fetch(`${supabaseUrl}/rest/v1/Users?id=eq.${userId}&limit=1`, {
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      const users = await response.json();
      
      if (!response.ok) {
        console.log("[user_lookup] ID lookup error:", users);
        if (debug) debugInfo["idError"] = JSON.stringify(users);
      } else if (users && users.length > 0) {
        const foundUser = users[0];
        console.log("[user_lookup] Found user by ID:", foundUser.id);
        user = {
          id: foundUser.id,
          email_address: foundUser.email_address || foundUser.email || null,
          StripeCustomerId: foundUser.StripeCustomerId || null,
          StripeSubscriptionId: foundUser.StripeSubscriptionId || null,
          StripeSubscriptionStatus: foundUser.StripeSubscriptionStatus || null,
        };
        debugInfo.matched.byId = true;
      }
    } catch (e) {
      console.log("[user_lookup] ID lookup exception:", String(e));
      if (debug) debugInfo["idException"] = String(e);
    }

    // Try numeric ID
    if (!user && typeof userId === "string" && /^[0-9]+$/.test(userId)) {
      try {
        const { data: userByIdNumber, error: userByIdNumberError } = await supabase
          .from("Users")
          .select("*")
          .eq("id", Number(userId))
          .single();

        if (!userByIdNumberError && userByIdNumber) {
          user = {
            id: userByIdNumber.id,
            email_address: userByIdNumber.email_address || userByIdNumber.email || null,
            StripeCustomerId: userByIdNumber.StripeCustomerId || null,
            StripeSubscriptionId: userByIdNumber.StripeSubscriptionId || null,
            StripeSubscriptionStatus: userByIdNumber.StripeSubscriptionStatus || null,
          };
          debugInfo.matched.byIdNumber = true;
        }
      } catch (e) {
        if (debug) debugInfo["idNumberException"] = String(e);
      }
    }

    // Try email lookup
    if (!user && userEmail) {
      try {
        const { data: userByEmail, error: userByEmailError } = await supabase
          .from("Users")
          .select("*")
          .ilike("email_address", userEmail)
          .single();

        if (!userByEmailError && userByEmail) {
          user = {
            id: userByEmail.id,
            email_address: userByEmail.email_address || userByEmail.email || null,
            StripeCustomerId: userByEmail.StripeCustomerId || null,
            StripeSubscriptionId: userByEmail.StripeSubscriptionId || null,
            StripeSubscriptionStatus: userByEmail.StripeSubscriptionStatus || null,
          };
          debugInfo.matched.byEmail = true;
        } else if (userByEmailError && debug) {
          debugInfo["emailError"] = userByEmailError.message;
        }
      } catch (e) {
        if (debug) debugInfo["emailException"] = String(e);
      }
    }

    // Try username lookup
    if (!user && userName) {
      try {
        const { data: userByName, error: userByNameError } = await supabase
          .from("Users")
          .select("*")
          .ilike("UserName", userName)
          .single();

        if (!userByNameError && userByName) {
          user = {
            id: userByName.id,
            email_address: userByName.email_address || userByName.email || null,
            StripeCustomerId: userByName.StripeCustomerId || null,
            StripeSubscriptionId: userByName.StripeSubscriptionId || null,
            StripeSubscriptionStatus: userByName.StripeSubscriptionStatus || null,
          };
          debugInfo.matched.byUserName = true;
        } else if (userByNameError && debug) {
          debugInfo["userNameError"] = userByNameError.message;
        }
      } catch (e) {
        if (debug) debugInfo["userNameException"] = String(e);
      }
    }

    if (!user) {
      console.log("[create_checkout_session] User not found after all lookups:", {
        attempted: { byId: true, byEmail: !!userEmail, byUserName: !!userName },
        matched: debugInfo.matched,
      });
      return jsonResponse(404, { error: "User not found. Check that user exists in Users table.", ...(debug ? { debug: debugInfo } : {}) });
    }

    console.log("[create_checkout_session] User found:", { userId: user.id });

    console.log("[create_checkout_session] Looking up UserLevel with id:", accountLevelId);
    
    const levelResponse = await fetch(`${supabaseUrl}/rest/v1/UserLevel?id=eq.${accountLevelId}&select=id,LevelName,MonthlyAmount,StripeProductId&limit=1`, {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    const levels = await levelResponse.json();
    const level = levels && levels.length > 0 ? levels[0] : null;
    const levelError = !levelResponse.ok ? levels : null;

    if (levelError) {
      console.log("[create_checkout_session] UserLevel lookup error:", levelError);
      return jsonResponse(404, { error: "Account level not found", levelError: levelError.message, ...(debug ? { debug: { ...debugInfo, accountLevelId, levelError: levelError.message } } : {}) });
    }

    if (!level) {
      console.log("[create_checkout_session] No UserLevel data returned for id:", accountLevelId);
      return jsonResponse(404, { error: "Account level not found", ...(debug ? { debug: { ...debugInfo, accountLevelId, noData: true } } : {}) });
    }

    const monthlyAmount = parseFloat(level.MonthlyAmount) || 0;
    if (monthlyAmount <= 0) {
      return jsonResponse(400, { error: "This plan is free and does not require checkout" });
    }

    const resolvedUserId = String(user.id);
    let stripeCustomerId = user.StripeCustomerId as string | null;
    if (!stripeCustomerId) {
      const params = new URLSearchParams();
      if (user.email_address) params.append("email", user.email_address);
      params.append("metadata[user_id]", resolvedUserId);
      const customer = await stripeRequest("customers", params);
      stripeCustomerId = customer.id;

      await fetch(`${supabaseUrl}/rest/v1/Users?id=eq.${resolvedUserId}`, {
        method: 'PATCH',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ StripeCustomerId: stripeCustomerId }),
      });
    }

    let stripeProductId = level.StripeProductId as string | null;
    if (!stripeProductId) {
      const productParams = new URLSearchParams();
      productParams.append("name", `${level.LevelName} Plan`);
      productParams.append("metadata[level_id]", String(level.id));
      const product = await stripeRequest("products", productParams);
      stripeProductId = product.id;
      
      await fetch(`${supabaseUrl}/rest/v1/UserLevel?id=eq.${level.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          StripeProductId: stripeProductId,
        }),
      });
    }

    // Reuse an existing active monthly price when possible, otherwise create one.
    const targetUnitAmount = Math.round(monthlyAmount * 100);
    const existingPricesParams = new URLSearchParams();
    existingPricesParams.append("product", stripeProductId);
    existingPricesParams.append("active", "true");
    existingPricesParams.append("limit", "100");

    const existingPrices = await stripeGet("prices", existingPricesParams);
    const matchingExistingPrice = (existingPrices?.data || []).find((candidate: {
      id?: string;
      unit_amount?: number;
      currency?: string;
      recurring?: { interval?: string };
      type?: string;
    }) => {
      const unitAmountMatches = candidate?.unit_amount === targetUnitAmount;
      const currencyMatches = (candidate?.currency || "").toLowerCase() === stripeCurrency;
      const intervalMatches = (candidate?.recurring?.interval || "") === "month";
      const isRecurring = (candidate?.type || "") === "recurring";
      return unitAmountMatches && currencyMatches && intervalMatches && isRecurring;
    });

    let stripePriceId = matchingExistingPrice?.id || null;
    if (!stripePriceId) {
      const priceParams = new URLSearchParams();
      priceParams.append("unit_amount", String(targetUnitAmount));
      priceParams.append("currency", stripeCurrency);
      priceParams.append("recurring[interval]", "month");
      priceParams.append("product", stripeProductId);
      const price = await stripeRequest("prices", priceParams);
      stripePriceId = price.id;
    }

    const updatableStatuses = new Set(["trialing", "active", "past_due", "unpaid"]);
    let existingSubscriptionId =
      user.StripeSubscriptionId && updatableStatuses.has((user.StripeSubscriptionStatus || "").toLowerCase())
        ? user.StripeSubscriptionId
        : null;

    if (!existingSubscriptionId && stripeCustomerId) {
      const listParams = new URLSearchParams();
      listParams.append("customer", stripeCustomerId);
      listParams.append("status", "all");
      listParams.append("limit", "20");

      const subscriptionList = await stripeGet("subscriptions", listParams);
      const found = (subscriptionList?.data || []).find((sub: { status?: string }) =>
        updatableStatuses.has((sub?.status || "").toLowerCase())
      );
      existingSubscriptionId = found?.id || null;
    }

    const origin = req.headers.get("origin") || req.headers.get("referer") || "http://localhost:5173";

    if (existingSubscriptionId) {
      const subscription = await stripeGet(`subscriptions/${existingSubscriptionId}`, new URLSearchParams([
        ["expand[]", "items.data.price"],
      ]));

      const subscriptionItem = subscription?.items?.data?.[0];
      if (!subscriptionItem?.id) {
        throw new Error("Unable to update existing subscription: no subscription item found");
      }

      const currentPriceId = subscriptionItem?.price?.id || null;
      if (currentPriceId === stripePriceId) {
        return jsonResponse(200, {
          alreadyOnPlan: true,
          message: "You are already on this plan.",
        });
      }

      const portalParams = new URLSearchParams();
      portalParams.append("customer", stripeCustomerId);
      portalParams.append("return_url", origin);
      portalParams.append("flow_data[type]", "subscription_update_confirm");
      portalParams.append("flow_data[subscription_update_confirm][subscription]", subscription.id);
      portalParams.append("flow_data[subscription_update_confirm][items][0][id]", subscriptionItem.id);
      portalParams.append("flow_data[subscription_update_confirm][items][0][price]", stripePriceId);
      try {
        const portalSession = await stripeRequest("billing_portal/sessions", portalParams);

        return jsonResponse(200, {
          url: portalSession.url,
          requiresConfirmation: true,
        });
      } catch (portalError) {
        const portalMessage = String(portalError?.message || "");
        const portalUpdatesDisabled = portalMessage.toLowerCase().includes("subscription update feature in the portal configuration is disabled");

        if (!portalUpdatesDisabled) {
          throw portalError;
        }

        const updateParams = new URLSearchParams();
        updateParams.append("items[0][id]", subscriptionItem.id);
        updateParams.append("items[0][price]", stripePriceId);
        updateParams.append("proration_behavior", "always_invoice");
        updateParams.append("cancel_at_period_end", "false");
        updateParams.append("metadata[user_id]", resolvedUserId);
        updateParams.append("metadata[account_level_id]", String(level.id));

        const updatedSubscription = await stripeRequest(`subscriptions/${subscription.id}`, updateParams);

        await fetch(`${supabaseUrl}/rest/v1/Users?id=eq.${resolvedUserId}`, {
          method: 'PATCH',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            StripeCustomerId: stripeCustomerId,
            StripeSubscriptionId: updatedSubscription.id,
            StripeSubscriptionStatus: updatedSubscription.status,
          }),
        });

        return jsonResponse(200, {
          updated: true,
          subscriptionId: updatedSubscription.id,
          status: updatedSubscription.status,
          prorated: true,
          confirmationFallback: "portal_subscription_updates_disabled",
        });
      }
    }

    const successUrl = `${origin}?checkout=success&session_id={CHECKOUT_SESSION_ID}&user_id=${resolvedUserId}`;
    const cancelUrl = `${origin}?checkout=cancelled`;

    const sessionParams = new URLSearchParams();
    sessionParams.append("mode", "subscription");
    sessionParams.append("customer", stripeCustomerId);
    sessionParams.append("line_items[0][price]", stripePriceId);
    sessionParams.append("line_items[0][quantity]", "1");
    sessionParams.append("success_url", successUrl);
    sessionParams.append("cancel_url", cancelUrl);
    sessionParams.append("metadata[user_id]", resolvedUserId);
    sessionParams.append("metadata[account_level_id]", String(level.id));
    sessionParams.append("subscription_data[metadata][user_id]", resolvedUserId);
    sessionParams.append("subscription_data[metadata][account_level_id]", String(level.id));

    const session = await stripeRequest("checkout/sessions", sessionParams);

    return jsonResponse(200, { url: session.url });
  } catch (error) {
    return jsonResponse(500, { error: error.message || "Unexpected error" });
  }
});
