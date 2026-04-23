import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/gocardless.ts"

const gocardlessBaseUrl = Deno.env.get("GOCARDLESS_ENV") === "live"
  ? "https://api.gocardless.com"
  : "https://sandbox.gocardless.com"

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: corsHeaders,
      })
    }

    const { userId, customerId } = await req.json()

    if (!userId || !customerId) {
      return new Response(
        JSON.stringify({ error: "userId and customerId required" }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Import admin client
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.38.4")
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    )

    // Get customer record
    const { data: customer, error: custErr } = await supabase
      .from("Customers")
      .select("GoCardlessMandateId, GoCardlessCustomerId")
      .eq("id", customerId)
      .eq("UserId", userId)
      .single()

    if (custErr || !customer) {
      return new Response(
        JSON.stringify({ error: "Customer not found" }),
        { status: 404, headers: corsHeaders }
      )
    }

    const mandateId = customer.GoCardlessMandateId
    if (!mandateId) {
      return new Response(
        JSON.stringify({ error: "Customer has no mandate ID" }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Get connection for this user
    const { data: connection, error: connErr } = await supabase
      .from("GoCardlessConnections")
      .select("AccessToken")
      .eq("UserId", userId)
      .single()

    if (connErr || !connection) {
      return new Response(
        JSON.stringify({ error: "GoCardless connection not found" }),
        { status: 404, headers: corsHeaders }
      )
    }

    // Fetch mandate details from GoCardless
    const mandateRes = await fetch(
      `${gocardlessBaseUrl}/mandates/${mandateId}`,
      {
        headers: {
          Authorization: `Bearer ${connection.AccessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!mandateRes.ok) {
      const errorBody = await mandateRes.text()
      return new Response(
        JSON.stringify({ 
          error: "Failed to fetch mandate from GoCardless",
          details: errorBody
        }),
        { status: mandateRes.status, headers: corsHeaders }
      )
    }

    const mandateData = await mandateRes.json()
    const mandate = mandateData.mandates ? mandateData.mandates[0] : mandateData.mandate

    if (!mandate) {
      return new Response(
        JSON.stringify({ error: "No mandate data in response" }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Update customer record with latest mandate status
    const { error: updateErr } = await supabase
      .from("Customers")
      .update({
        GoCardlessMandateStatus: mandate.status,
        GoCardlessMandateLastEventAt: new Date().toISOString(),
      })
      .eq("id", customerId)

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: "Failed to update customer", details: updateErr.message }),
        { status: 500, headers: corsHeaders }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        mandateStatus: mandate.status,
        mandateId: mandate.id,
        reference: mandate.reference,
        nextPossibleChargeDate: mandate.next_possible_charge_date,
      }),
      { status: 200, headers: corsHeaders }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    )
  }
})
