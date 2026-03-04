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

async function stripeGet(path: string, params?: URLSearchParams) {
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

async function findAccountLevelIdByStripeRefs(
  stripePriceId: string | null,
  stripeProductId: string | null,
): Promise<number | null> {
  if (stripePriceId) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/UserLevel?StripePriceId=eq.${encodeURIComponent(stripePriceId)}&select=id&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (response.ok) {
      const rows = await response.json();
      if (rows?.length) {
        const levelId = Number(rows[0].id || 0);
        if (levelId) return levelId;
      }
    }
  }

  if (stripeProductId) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/UserLevel?StripeProductId=eq.${encodeURIComponent(stripeProductId)}&select=id&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (response.ok) {
      const rows = await response.json();
      if (rows?.length) {
        const levelId = Number(rows[0].id || 0);
        if (levelId) return levelId;
      }
    }
  }

  return null;
}

async function resolveAccountLevelIdFromSubscription(
  subscription: Stripe.Subscription | null | undefined,
): Promise<number | null> {
  if (!subscription?.items?.data?.length) return null;

  for (const item of subscription.items.data) {
    const stripePriceId = item?.price?.id || null;
    const rawProduct = item?.price?.product;
    const stripeProductId = typeof rawProduct === "string"
      ? rawProduct
      : rawProduct?.id || null;

    const levelId = await findAccountLevelIdByStripeRefs(stripePriceId, stripeProductId);
    if (levelId) return levelId;
  }

  return null;
}

async function updateUserByIdOrCustomerId(
  userId: string | undefined,
  customerId: string | undefined,
  subscriptionId: string | undefined,
  updates: Record<string, unknown>,
) {
  async function patchUser(filterQuery: string) {
    const response = await fetch(`${supabaseUrl}/rest/v1/Users?${filterQuery}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(updates),
    });

    let payload: unknown = null;
    if (response.status !== 204) {
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      return { ok: false as const, updatedRows: 0, error: payload || { status: response.status } };
    }

    const rows = Array.isArray(payload) ? payload : [];
    return { ok: true as const, updatedRows: rows.length, error: null };
  }

  const attempts = [
    userId ? `id=eq.${encodeURIComponent(userId)}` : null,
    customerId ? `StripeCustomerId=eq.${encodeURIComponent(customerId)}` : null,
    subscriptionId ? `StripeSubscriptionId=eq.${encodeURIComponent(subscriptionId)}` : null,
  ].filter(Boolean) as string[];

  if (!attempts.length) {
    return { error: { message: "Missing user id, customer id, and subscription id" } } as const;
  }

  let lastError: unknown = null;
  for (const filter of attempts) {
    const result = await patchUser(filter);
    if (!result.ok) {
      lastError = result.error;
      continue;
    }

    if (result.updatedRows > 0) {
      return { error: null };
    }
  }

  return { error: lastError || { message: "No matching user row found" } };
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
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    const bodyAccountLevelId = Number(body?.accountLevelId || 0) || null;
    const bodyUserId =
      typeof body?.userId === "string"
        ? body.userId.trim()
        : typeof body?.userId === "number"
          ? String(body.userId)
          : "";

    let userId: string | undefined = bodyUserId || undefined;
    let customerId: string | null = null;
    let subscriptionId: string | null = null;
    let subscription: Stripe.Subscription | null = null;
    let accountLevelId: number | null = null;

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });

      const subscriptionFromSession =
        typeof session.subscription === "object" && session.subscription
          ? (session.subscription as Stripe.Subscription)
          : null;

      subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : subscriptionFromSession?.id || null;

      subscription =
        !subscriptionFromSession && subscriptionId
          ? await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] })
          : subscriptionFromSession;

      userId = userId || session.metadata?.user_id || subscription?.metadata?.user_id || undefined;
      const metadataAccountLevelId = Number(
        session.metadata?.account_level_id ||
          subscription?.metadata?.account_level_id ||
          0,
      );
      const derivedAccountLevelId = await resolveAccountLevelIdFromSubscription(subscription);
      accountLevelId = derivedAccountLevelId || metadataAccountLevelId;

      customerId =
        (typeof session.customer === "string" ? session.customer : null) ||
        (typeof subscription?.customer === "string" ? subscription?.customer : null);
    } else {
      if (!userId) {
        return jsonResponse(400, { error: "Missing sessionId or userId" });
      }

      const userLookupResponse = await fetch(
        `${supabaseUrl}/rest/v1/Users?id=eq.${encodeURIComponent(userId)}&select=id,StripeCustomerId,StripeSubscriptionId&limit=1`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      const userRows = await userLookupResponse.json();
      if (!userLookupResponse.ok) {
        return jsonResponse(500, { error: "Failed to look up user", details: userRows });
      }

      const dbUser = Array.isArray(userRows) && userRows.length ? userRows[0] : null;
      if (!dbUser) {
        return jsonResponse(404, { error: "User not found" });
      }

      userId = String(dbUser.id || userId);
      customerId = typeof dbUser.StripeCustomerId === "string" ? dbUser.StripeCustomerId : null;
      subscriptionId = typeof dbUser.StripeSubscriptionId === "string" ? dbUser.StripeSubscriptionId : null;

      if (subscriptionId) {
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
        } catch {
          subscription = null;
        }
      }

      if (!subscription && customerId) {
        const listParams = new URLSearchParams();
        listParams.append("customer", customerId);
        listParams.append("status", "all");
        listParams.append("limit", "20");

        const subscriptionList = await stripeGet("subscriptions", listParams);
        const preferredStatuses = ["active", "trialing", "past_due", "unpaid", "incomplete", "canceled", "incomplete_expired"];
        const found = (subscriptionList?.data || []).find((sub: { status?: string }) =>
          preferredStatuses.includes((sub?.status || "").toLowerCase())
        );

        if (found?.id) {
          subscriptionId = found.id;
          subscription = await stripe.subscriptions.retrieve(found.id, { expand: ["items.data.price"] });
        }
      }

      if (!subscription) {
        return jsonResponse(400, { error: "Unable to resolve Stripe subscription for user" });
      }

      if (!customerId && typeof subscription.customer === "string") {
        customerId = subscription.customer;
      }

      if (!subscriptionId) {
        subscriptionId = subscription.id;
      }

      const metadataAccountLevelId = Number(subscription.metadata?.account_level_id || 0);
      const derivedAccountLevelId = await resolveAccountLevelIdFromSubscription(subscription);
      accountLevelId = derivedAccountLevelId || metadataAccountLevelId;
    }

    const subscriptionStatus = subscription?.status || "active";
    const updates: Record<string, unknown> = {
      StripeCustomerId: customerId || null,
      StripeSubscriptionId: subscription?.id || subscriptionId || null,
      StripeSubscriptionStatus: subscriptionStatus,
    };

    if (["active", "trialing"].includes(subscriptionStatus) && accountLevelId) {
      updates.AccountLevel = accountLevelId;
    } else if (["canceled", "unpaid", "past_due", "incomplete_expired"].includes(subscriptionStatus)) {
      updates.AccountLevel = 1;
    } else if (accountLevelId) {
      updates.AccountLevel = accountLevelId;
    }

    if (bodyAccountLevelId) {
      updates.AccountLevel = bodyAccountLevelId;
    }

    const result = await updateUserByIdOrCustomerId(
      userId,
      customerId || undefined,
      subscription?.id || subscriptionId || undefined,
      updates,
    );

    if (result.error) {
      return jsonResponse(500, { error: "Failed to update user", details: result.error });
    }

    return jsonResponse(200, {
      ok: true,
      updated: {
        userId,
        customerId,
        subscriptionId,
        accountLevelId: bodyAccountLevelId || accountLevelId,
      },
    });
  } catch (error) {
    return jsonResponse(500, { error: error.message || "Unexpected error" });
  }
});
