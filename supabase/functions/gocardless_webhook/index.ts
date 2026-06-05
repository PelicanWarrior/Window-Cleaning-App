import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getGoCardlessEnvironment,
  getGoCardlessWebhookSecret,
  getSupabaseAdminClient,
  gocardlessRequest,
  markUserGoCardlessStatus,
  verifyWebhookSignature,
} from "../_shared/gocardless.ts";

async function getInvoiceTotal(
  supabase: ReturnType<typeof getSupabaseAdminClient>["supabase"],
  invoiceId: number,
) {
  const { data: items, error } = await supabase
    .from("CustomerInvoiceJobs")
    .select("Price")
    .eq("InvoiceID", invoiceId);

  if (error) throw error;
  return (items || []).reduce((sum, item: any) => sum + (Number(item?.Price) || 0), 0);
}

async function deductCustomerOutstanding(
  supabase: ReturnType<typeof getSupabaseAdminClient>["supabase"],
  customerId: number,
  amount: number,
) {
  if (!customerId || !Number.isFinite(amount) || amount <= 0) return;

  const { data: customer, error: customerError } = await supabase
    .from("Customers")
    .select("id, Outstanding")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) throw customerError;
  if (!customer?.id) return;

  const currentOutstanding = Number(customer.Outstanding) || 0;
  const nextOutstanding = Math.max(0, Number((currentOutstanding - amount).toFixed(2)));

  const { error: updateError } = await supabase
    .from("Customers")
    .update({ Outstanding: nextOutstanding })
    .eq("id", customerId);

  if (updateError) throw updateError;
}

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
    const environment = getGoCardlessEnvironment();
    const { supabase } = getSupabaseAdminClient();

    for (const event of events) {
      if (await hasProcessedEvent(supabase, event?.id || null)) {
        continue;
      }

      const organisationId = event?.links?.organisation || null;
      const { data: connection } = await supabase
        .from("GoCardlessConnections")
        .select("UserId, OrganisationId, AccessToken, Environment, DisconnectedAt")
        .eq("OrganisationId", organisationId)
        .eq("Environment", environment.mode)
        .is("DisconnectedAt", null)
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
          const paymentAction = String(event.action || "").toLowerCase();
          if (paymentAction === "paid_out") {
            const payoutTimestamp = event.created_at || new Date().toISOString();
            const { data: updatedInvoices, error: updateError } = await supabase
              .from("CustomerInvoices")
              .update({
                GoCardlessPaymentStatus: "paid_out",
                GoCardlessPaymentConfirmedAt: payoutTimestamp,
              })
              .eq("GoCardlessPaymentId", paymentId)
              .neq("GoCardlessPaymentStatus", "paid_out")
              .select("id, CustomerID");

            if (updateError) throw updateError;

            for (const invoice of updatedInvoices || []) {
              if (!invoice?.id || !invoice?.CustomerID) continue;
              const invoiceTotal = await getInvoiceTotal(supabase, Number(invoice.id));
              await deductCustomerOutstanding(supabase, Number(invoice.CustomerID), invoiceTotal);
            }
          } else {
            const updates: Record<string, unknown> = {
              GoCardlessPaymentStatus: paymentAction,
            };

            if (paymentAction === "confirmed") {
              updates.GoCardlessPaymentConfirmedAt = event.created_at || new Date().toISOString();
            }

            const { error } = await supabase
              .from("CustomerInvoices")
              .update(updates)
              .eq("GoCardlessPaymentId", paymentId);
            if (error) throw error;
          }
        }
      }

      if (event.resource_type === "subscriptions") {
        const subscriptionId = event?.links?.subscription || null;
        if (subscriptionId) {
          const { error } = await supabase
            .from("Customers")
            .update({
              GoCardlessSubscriptionId: subscriptionId,
              GoCardlessSubscriptionStatus: event.action || null,
              GoCardlessSubscriptionLastEventAt: event.created_at || new Date().toISOString(),
            })
            .eq("GoCardlessSubscriptionId", subscriptionId);
          if (error) throw error;
        }
      }

      if (event.resource_type === "refunds") {
        const refundId = event?.links?.refund || null;
        const paymentId = event?.links?.payment || null;
        const refundAction = String(event.action || "").toLowerCase();

        const invoiceUpdates: Record<string, unknown> = {
          GoCardlessRefundStatus: refundAction || null,
        };
        if (refundId) invoiceUpdates.GoCardlessRefundId = refundId;
        if (["paid", "submitted", "created"].includes(refundAction)) {
          invoiceUpdates.GoCardlessRefundedAt = event.created_at || new Date().toISOString();
        }

        if (refundId) {
          const { error } = await supabase
            .from("CustomerInvoices")
            .update(invoiceUpdates)
            .eq("GoCardlessRefundId", refundId);
          if (error) throw error;
        }

        if (paymentId) {
          const { error } = await supabase
            .from("CustomerInvoices")
            .update(invoiceUpdates)
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
