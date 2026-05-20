import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getConnectionByUserId,
  getSupabaseAdminClient,
  gocardlessRequest,
  jsonResponse,
  mapCountryToCurrency,
  toMinorUnitAmount,
} from "../_shared/gocardless.ts";

function resolveEffectiveStartDate(requestedStartDate: string | null, nextPossibleChargeDate: string | null) {
  if (!requestedStartDate) return null;
  if (!nextPossibleChargeDate || requestedStartDate >= nextPossibleChargeDate) return requestedStartDate;

  const requestedParts = requestedStartDate.split("-").map((part) => Number(part));
  const nextPossibleParts = nextPossibleChargeDate.split("-").map((part) => Number(part));
  const desiredDay = requestedParts[2];

  let year = nextPossibleParts[0];
  let month = nextPossibleParts[1];

  const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const formatDate = (y: number, m: number, d: number) => `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;

  let day = Math.min(desiredDay, lastDayOfMonth(year, month));
  let candidate = formatDate(year, month, day);

  if (candidate < nextPossibleChargeDate) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    day = Math.min(desiredDay, lastDayOfMonth(year, month));
    candidate = formatDate(year, month, day);
  }

  return candidate;
}

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
    const amount = Number(body?.amount || 0);
    const rawStartDate = String(body?.startDate || "").trim();
    const interval = Math.max(1, Number(body?.interval || 1));
    const intervalUnit = String(body?.intervalUnit || "monthly").toLowerCase();

    if (!userId || !customerId || !Number.isFinite(amount) || amount <= 0) {
      return jsonResponse(400, { error: "Missing userId, customerId, or valid amount" });
    }

    let startDate: string | null = null;
    if (rawStartDate) {
      const parsed = new Date(rawStartDate);
      if (Number.isNaN(parsed.getTime())) {
        return jsonResponse(400, { error: "Invalid startDate" });
      }
      startDate = parsed.toISOString().slice(0, 10);
    }

    const connection = await getConnectionByUserId(userId);
    if (!connection?.AccessToken) {
      return jsonResponse(400, { error: "GoCardless is not connected for this user" });
    }

    const { supabase } = getSupabaseAdminClient();
    const [{ data: user }, { data: customer, error: customerError }] = await Promise.all([
      supabase.from("Users").select("id, SettingsCountry").eq("id", userId).single(),
      supabase
        .from("Customers")
        .select("id, UserId, CustomerName, GoCardlessMandateId, GoCardlessSubscriptionId")
        .eq("id", customerId)
        .single(),
    ]);

    if (customerError || !customer) {
      return jsonResponse(404, { error: "Customer not found" });
    }

    if (Number(customer.UserId) !== Number(userId)) {
      return jsonResponse(403, { error: "Not allowed" });
    }

    if (!customer.GoCardlessMandateId) {
      return jsonResponse(400, { error: "Customer does not have an active mandate" });
    }

    let nextPossibleChargeDate: string | null = null;
    try {
      const mandateRecord = await gocardlessRequest(connection.AccessToken, `/mandates/${customer.GoCardlessMandateId}`);
      nextPossibleChargeDate = mandateRecord?.mandates?.next_possible_charge_date || null;
    } catch {
      nextPossibleChargeDate = null;
    }

    const effectiveStartDate = resolveEffectiveStartDate(startDate, nextPossibleChargeDate);

    const previousSubscriptionId = customer.GoCardlessSubscriptionId || null;
    if (previousSubscriptionId) {
      await gocardlessRequest(connection.AccessToken, `/subscriptions/${previousSubscriptionId}/actions/cancel`, {
        method: "POST",
        body: {},
        idempotencyKey: `update-subscription-cancel-${customerId}-${previousSubscriptionId}`,
      });
    }

    const payload = {
      subscriptions: {
        amount: toMinorUnitAmount(amount),
        currency: mapCountryToCurrency(user?.SettingsCountry),
        name: `${customer?.CustomerName || "Customer"} recurring clean`,
        interval,
        interval_unit: intervalUnit,
        ...(effectiveStartDate ? { start_date: effectiveStartDate } : {}),
        links: {
          mandate: customer.GoCardlessMandateId,
        },
      },
    };

    const response = await gocardlessRequest(connection.AccessToken, "/subscriptions", {
      method: "POST",
      body: payload,
      idempotencyKey: `update-subscription-create-${customerId}-${amount}-${interval}-${intervalUnit}-${effectiveStartDate || "auto"}`,
    });

    const subscription = response?.subscriptions;
    if (!subscription?.id) {
      throw new Error("GoCardless did not return a subscription id");
    }

    const chargeDay = effectiveStartDate ? Number(effectiveStartDate.split("-")[2]) : null;
    const fullCustomerUpdate = {
      GoCardlessSubscriptionId: subscription.id,
      GoCardlessSubscriptionStatus: subscription.status || "pending_customer_approval",
      GoCardlessSubscriptionAmount: amount,
      GoCardlessSubscriptionChargeDay: Number.isFinite(chargeDay) ? chargeDay : null,
      GoCardlessSubscriptionStartDate: effectiveStartDate,
      GoCardlessSubscriptionLastEventAt: new Date().toISOString(),
    };

    let { error: updateError } = await supabase
      .from("Customers")
      .update(fullCustomerUpdate)
      .eq("id", customerId);

    if (updateError?.message?.toLowerCase().includes("column") && updateError?.message?.includes("GoCardlessSubscription")) {
      const { error: fallbackError } = await supabase
        .from("Customers")
        .update({
          GoCardlessSubscriptionId: subscription.id,
          GoCardlessSubscriptionStatus: subscription.status || "pending_customer_approval",
          GoCardlessSubscriptionLastEventAt: new Date().toISOString(),
        })
        .eq("id", customerId);
      updateError = fallbackError;
    }

    if (updateError) throw updateError;

    return jsonResponse(200, {
      ok: true,
      subscriptionId: subscription.id,
      previousSubscriptionId,
      status: subscription.status || null,
      amount,
      chargeDay: Number.isFinite(chargeDay) ? chargeDay : null,
      startDate: effectiveStartDate,
      requestedStartDate: startDate,
      nextPossibleChargeDate,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to update subscription",
    });
  }
});
