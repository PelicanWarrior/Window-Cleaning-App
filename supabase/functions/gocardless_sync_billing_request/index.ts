import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getConnectionByUserId,
  getSupabaseAdminClient,
  gocardlessRequest,
  jsonResponse,
} from "../_shared/gocardless.ts";

function extractMandateId(record: any) {
  // GoCardless billing_requests API returns mandate link as mandate_request_mandate
  return (
    record?.links?.mandate_request_mandate ||
    record?.links?.mandate ||
    record?.resources?.mandate?.id ||
    record?.mandate?.id ||
    null
  );
}

function extractPaymentId(record: any) {
  // GoCardless billing_requests API returns payment link as payment_request_payment
  return (
    record?.links?.payment_request_payment ||
    record?.links?.payment ||
    record?.resources?.payment?.id ||
    record?.payment?.id ||
    null
  );
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
    const billingRequestId = body?.billingRequestId;

    if (!userId || !billingRequestId) {
      return jsonResponse(400, { error: "Missing userId or billingRequestId" });
    }

    const connection = await getConnectionByUserId(userId);
    if (!connection?.AccessToken) {
      return jsonResponse(400, { error: "GoCardless is not connected for this user" });
    }

    const record = await gocardlessRequest(connection.AccessToken, `/billing_requests/${billingRequestId}`);
    const billingRequest = record?.billing_requests;
    if (!billingRequest?.id) {
      throw new Error("Unable to load billing request");
    }

    const { supabase } = getSupabaseAdminClient();
    let mandateId = extractMandateId(billingRequest);
    const paymentId = extractPaymentId(billingRequest);
    let mandateStatus = "pending_submission";
    let customerUpdatesFromCreditor: string | null = null;

    // Debug: log full billing request structure
    console.log("BILLING_REQUEST_STATUS:", billingRequest?.status);
    console.log("EXTRACTED_MANDATE_ID:", mandateId);
    console.log("BILLING_REQUEST_LINKS:", JSON.stringify(billingRequest?.links));

    // If billing request has no mandate yet, look up mandates by GoCardless customer ID
    if (!mandateId && billingRequest?.links?.customer) {
      const gcCustomerId = billingRequest.links.customer;
      console.log("LOOKING_UP_MANDATES_FOR_CUSTOMER:", gcCustomerId);
      try {
        const mandatesRecord = await gocardlessRequest(connection.AccessToken, `/mandates?customer=${gcCustomerId}`);
        console.log("MANDATES_BY_CUSTOMER:", JSON.stringify(mandatesRecord?.mandates));
        const allMandates: any[] = mandatesRecord?.mandates || [];
        const ranked = allMandates
          .filter((m: any) => !["cancelled", "failed", "expired"].includes(m.status))
          .sort((a: any, b: any) => {
            const order: Record<string, number> = { active: 0, submitted: 1, pending_submission: 2, created: 3 };
            return (order[a.status] ?? 9) - (order[b.status] ?? 9);
          });
        if (ranked.length > 0) {
          mandateId = ranked[0].id;
          mandateStatus = ranked[0].status;
          console.log("FOUND_MANDATE:", mandateId, mandateStatus);
        } else {
          // Customer ID may differ — fetch all mandates for the creditor as fallback
          console.log("NO_MANDATES_FOR_CUSTOMER - trying creditor lookup");
          const creditorId = billingRequest?.links?.creditor;
          if (creditorId) {
            const allMandatesRecord = await gocardlessRequest(connection.AccessToken, `/mandates?creditor=${creditorId}`);
            const creditorMandates: any[] = allMandatesRecord?.mandates || [];
            console.log("ALL_CREDITOR_MANDATES:", JSON.stringify(creditorMandates.map((m: any) => ({ id: m.id, status: m.status, customer: m.links?.customer }))));
            const activeCreditor = creditorMandates.filter((m: any) => !["cancelled", "failed", "expired"].includes(m.status));
            if (activeCreditor.length > 0) {
              // Sort: active first, then pending_submission, submitted, etc.
              activeCreditor.sort((a: any, b: any) => {
                const order: Record<string, number> = { active: 0, submitted: 1, pending_submission: 2, created: 3 };
                return (order[a.status] ?? 9) - (order[b.status] ?? 9);
              });
              mandateId = activeCreditor[0].id;
              mandateStatus = activeCreditor[0].status;
              // Also update the customer ID if it differs
              if (activeCreditor[0].links?.customer) {
                customerUpdatesFromCreditor = activeCreditor[0].links.customer;
              }
              console.log("FOUND_CREDITOR_MANDATE:", mandateId, mandateStatus);
            }
          }
        }
      } catch (e) {
        console.log("MANDATE_LOOKUP_ERROR:", String(e));
      }
    }

    // If we have a mandate ID from the billing request, fetch its actual status
    if (mandateId && !mandateStatus.includes("active")) {
      try {
        const mandateRecord = await gocardlessRequest(connection.AccessToken, `/mandates/${mandateId}`);
        console.log("MANDATE_STATUS_FROM_ID:", mandateRecord?.mandates?.status);
        mandateStatus = mandateRecord?.mandates?.status || mandateStatus;
      } catch (e) {
        console.log("MANDATE_STATUS_FETCH_ERROR:", e);
      }
    }

    const customerUpdates: Record<string, unknown> = {
      GoCardlessBillingRequestId: billingRequest.id,
    };

    if (billingRequest?.links?.customer) customerUpdates.GoCardlessCustomerId = billingRequest.links.customer;
    // If mandate was found via creditor lookup on a different customer, save that customer ID too
    if (customerUpdatesFromCreditor) customerUpdates.GoCardlessCustomerId = customerUpdatesFromCreditor;
    if (billingRequest?.links?.customer_billing_detail) customerUpdates.GoCardlessCustomerBillingDetailId = billingRequest.links.customer_billing_detail;
    if (mandateId) {
      customerUpdates.GoCardlessMandateId = mandateId;
      customerUpdates.GoCardlessMandateStatus = mandateStatus;
    } else if (billingRequest?.status === "fulfilled") {
      customerUpdates.GoCardlessMandateStatus = "pending_submission";
    }

    const invoiceUpdates: Record<string, unknown> = {
      GoCardlessBillingRequestId: billingRequest.id,
      GoCardlessPaymentStatus: billingRequest?.status === "fulfilled" ? "customer_authorised" : billingRequest?.status || "pending",
    };

    if (paymentId) invoiceUpdates.GoCardlessPaymentId = paymentId;

    const [{ data: matchedCustomer }, { data: matchedInvoice }] = await Promise.all([
      supabase.from("Customers").select("id").eq("GoCardlessBillingRequestId", billingRequest.id).maybeSingle(),
      supabase.from("CustomerInvoices").select("id").eq("GoCardlessBillingRequestId", billingRequest.id).maybeSingle(),
    ]);

    if (matchedCustomer?.id) {
      const { error } = await supabase.from("Customers").update(customerUpdates).eq("id", matchedCustomer.id);
      if (error) throw error;
    }

    if (matchedInvoice?.id) {
      const { error } = await supabase.from("CustomerInvoices").update(invoiceUpdates).eq("id", matchedInvoice.id);
      if (error) throw error;
    }

    return jsonResponse(200, {
      ok: true,
      billingRequestStatus: billingRequest?.status || null,
      mandateId,
      mandateStatus,
      paymentId,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to sync GoCardless billing request",
    });
  }
});
