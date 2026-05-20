import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getConnectionByUserId,
  getSupabaseAdminClient,
  gocardlessRequest,
  jsonResponse,
} from "../_shared/gocardless.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const body = await req.json();
    const userId = body?.userId;
    const customerId = body?.customerId;

    if (!userId || !customerId) {
      return jsonResponse(400, { error: "Missing userId or customerId" });
    }

    const connection = await getConnectionByUserId(userId);
    if (!connection?.AccessToken) {
      return jsonResponse(400, { error: "GoCardless is not connected for this user" });
    }

    const { supabase } = getSupabaseAdminClient();
    const { data: customer, error: customerError } = await supabase
      .from("Customers")
      .select("id, UserId, GoCardlessSubscriptionId")
      .eq("id", customerId)
      .single();

    if (customerError || !customer) {
      return jsonResponse(404, { error: "Customer not found" });
    }

    if (Number(customer.UserId) !== Number(userId)) {
      return jsonResponse(403, { error: "Not allowed" });
    }

    const subscriptionId = customer.GoCardlessSubscriptionId;
    if (!subscriptionId) {
      return jsonResponse(400, { error: "Customer has no active GoCardless subscription" });
    }

    await gocardlessRequest(connection.AccessToken, `/subscriptions/${subscriptionId}/actions/cancel`, {
      method: "POST",
      body: {},
      idempotencyKey: `cancel-subscription-${customerId}-${subscriptionId}`,
    });

    let { error: updateError } = await supabase
      .from("Customers")
      .update({
        GoCardlessSubscriptionId: null,
        GoCardlessSubscriptionStatus: "cancelled",
        GoCardlessSubscriptionAmount: null,
        GoCardlessSubscriptionChargeDay: null,
        GoCardlessSubscriptionStartDate: null,
        GoCardlessSubscriptionLastEventAt: new Date().toISOString(),
      })
      .eq("id", customerId);

    if (updateError?.message?.toLowerCase().includes("column") && updateError?.message?.includes("GoCardlessSubscription")) {
      const { error: fallbackError } = await supabase
        .from("Customers")
        .update({
          GoCardlessSubscriptionId: null,
          GoCardlessSubscriptionStatus: "cancelled",
          GoCardlessSubscriptionLastEventAt: new Date().toISOString(),
        })
        .eq("id", customerId);
      updateError = fallbackError;
    }

    if (updateError) throw updateError;

    return jsonResponse(200, {
      ok: true,
      cancelled: true,
      previousSubscriptionId: subscriptionId,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to cancel subscription",
    });
  }
});
