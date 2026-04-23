import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getGoCardlessWebhookSecret,
  getSupabaseAdminClient,
  gocardlessRequest,
  markUserGoCardlessStatus,
  verifyWebhookSignature,
} from "../_shared/gocardless.ts";

async function hasProcessedEvent(supabase: ReturnType<typeof getSupabaseAdminClient>["supabase"], eventId: string | null) {
  if (!eventId) return false;
  const { data, error } = await supabase
    .from("GoCardlessWebhookEvents")
    .select("EventId")
    .eq("EventId", eventId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.EventId);
}

async function recordEvent(supabase: ReturnType<typeof getSupabaseAdminClient>["supabase"], event: any) {
  const { error } = await supabase
    .from("GoCardlessWebhookEvents")
    .insert({
      EventId: event?.id || crypto.randomUUID(),
      OrganisationId: event?.links?.organisation || null,
      ResourceType: event?.resource_type || null,
      Action: event?.action || null,
      Payload: event,
      ProcessedAt: new Date().toISOString(),
    });

  if (error) throw error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const body = await req.text();
  const signature = req.headers.get("Webhook-Signature") || "";

  try {
    const secret = getGoCardlessWebhookSecret();
    const isValid = await verifyWebhookSignature(body, signature, secret);
    if (!isValid) {
      return new Response("Invalid signature", { status: 498, headers: corsHeaders });
    }

    const payload = JSON.parse(body);
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const { supabase } = getSupabaseAdminClient();

    for (const event of events) {
      if (await hasProcessedEvent(supabase, event?.id || null)) {
        continue;
      }

      const organisationId = event?.links?.organisation || null;
      const { data: connection } = await supabase
        .from("GoCardlessConnections")
        .select("UserId, OrganisationId, AccessToken")
        .eq("OrganisationId", organisationId)
        .maybeSingle();

      if (!connection?.UserId) {
        await recordEvent(supabase, event);
        continue;
      }

      if (event.resource_type === "organisations" && event.action === "disconnected") {
        await supabase
          .from("GoCardlessConnections")
          .update({
            DisconnectedAt: new Date().toISOString(),
            UpdatedAt: new Date().toISOString(),
          })
          .eq("OrganisationId", organisationId);

        await markUserGoCardlessStatus(connection.UserId, {
          GoCardlessConnected: false,
          GoCardlessConnectionStatus: "disconnected",
        });

        await recordEvent(supabase, event);
        continue;
      }

      if (event.resource_type === "mandates") {
        const mandateId = event?.links?.mandate || null;
        const newMandateId = event?.links?.new_mandate || null;
        const updates: Record<string, unknown> = {
          GoCardlessMandateStatus: event.action,
          GoCardlessMandateLastEventAt: event.created_at || new Date().toISOString(),
        };
        if (newMandateId) {
          updates.GoCardlessMandateId = newMandateId;
        }

        const filterMandateId = newMandateId || mandateId;
        if (filterMandateId) {
          const { error } = await supabase
            .from("Customers")
            .update(updates)
            .eq("GoCardlessMandateId", filterMandateId);
          if (error) throw error;
        }
      }

      if (event.resource_type === "payments") {
        const paymentId = event?.links?.payment || null;
        if (paymentId) {
          const { error } = await supabase
            .from("CustomerInvoices")
            .update({
              GoCardlessPaymentStatus: event.action,
            })
            .eq("GoCardlessPaymentId", paymentId);
          if (error) throw error;
        }
      }

      if (event.resource_type === "billing_requests" && connection?.AccessToken) {
        const billingRequestId = event?.links?.billing_request || event?.id || null;
        if (billingRequestId && ["fulfilled", "completed"].includes(String(event.action || "").toLowerCase())) {
          try {
            const record = await gocardlessRequest(connection.AccessToken, `/billing_requests/${billingRequestId}`);
            const billingRequest = record?.billing_requests;
            const mandateId = billingRequest?.links?.mandate || billingRequest?.resources?.mandate?.id || null;
            const paymentId = billingRequest?.links?.payment || billingRequest?.resources?.payment?.id || null;

            const { data: customer } = await supabase
              .from("Customers")
              .select("id")
              .eq("GoCardlessBillingRequestId", billingRequestId)
              .maybeSingle();
            if (customer?.id) {
              const customerUpdate: Record<string, unknown> = {
                GoCardlessCustomerId: billingRequest?.links?.customer || null,
                GoCardlessCustomerBillingDetailId: billingRequest?.links?.customer_billing_detail || null,
                GoCardlessMandateStatus: mandateId ? "pending_submission" : "fulfilled",
              };
              if (mandateId) customerUpdate.GoCardlessMandateId = mandateId;
              await supabase.from("Customers").update(customerUpdate).eq("id", customer.id);
            }

            const { data: invoice } = await supabase
              .from("CustomerInvoices")
              .select("id")
              .eq("GoCardlessBillingRequestId", billingRequestId)
              .maybeSingle();
            if (invoice?.id) {
              const invoiceUpdate: Record<string, unknown> = {
                GoCardlessPaymentStatus: paymentId ? "customer_authorised" : "fulfilled",
              };
              if (paymentId) invoiceUpdate.GoCardlessPaymentId = paymentId;
              await supabase.from("CustomerInvoices").update(invoiceUpdate).eq("id", invoice.id);
            }
          } catch (syncError) {
            console.error("[gocardless_webhook] Failed to sync fulfilled billing request", syncError);
          }
        }
      }

      await recordEvent(supabase, event);
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("[gocardless_webhook]", error);
    return new Response(error instanceof Error ? error.message : "Webhook error", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
