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
    const { userId, customerId } = await req.json();

    if (!userId || !customerId) {
      return jsonResponse(400, { error: "userId and customerId required" });
    }

    const connection = await getConnectionByUserId(userId);
    if (!connection?.AccessToken) {
      return jsonResponse(404, { error: "GoCardless connection not found for current environment" });
    }

    const { supabase } = getSupabaseAdminClient();

    const { data: customer, error: customerError } = await supabase
      .from("Customers")
      .select("id, UserId, GoCardlessMandateId")
      .eq("id", customerId)
      .eq("UserId", userId)
      .maybeSingle();

    if (customerError || !customer) {
      return jsonResponse(404, { error: "Customer not found" });
    }

    const mandateId = customer.GoCardlessMandateId;
    if (!mandateId) {
      return jsonResponse(400, { error: "Customer has no mandate ID" });
    }

    const record = await gocardlessRequest(connection.AccessToken, `/mandates/${mandateId}`);
    const mandate = record?.mandates || record?.mandate || null;

    if (!mandate) {
      return jsonResponse(400, { error: "No mandate data in response" });
    }

    const { error: updateError } = await supabase
      .from("Customers")
      .update({
        GoCardlessMandateStatus: mandate.status,
        GoCardlessMandateLastEventAt: new Date().toISOString(),
      })
      .eq("id", customerId);

    if (updateError) throw updateError;

    return jsonResponse(200, {
      success: true,
      mandateStatus: mandate.status,
      mandateId: mandate.id,
      reference: mandate.reference,
      nextPossibleChargeDate: mandate.next_possible_charge_date,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to sync mandate status",
    });
  }
});
