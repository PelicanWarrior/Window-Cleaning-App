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
    const invoiceId = body?.invoiceId;

    if (!userId || !customerId || !invoiceId) {
      return jsonResponse(400, { error: "Missing userId, customerId or invoiceId" });
    }

    const connection = await getConnectionByUserId(userId);
    if (!connection?.AccessToken) {
      return jsonResponse(400, { error: "GoCardless is not connected for this user" });
    }

    const { supabase } = getSupabaseAdminClient();
    const [{ data: user }, { data: customer }, { data: invoice, error: invoiceError }, { data: invoiceItems, error: itemsError }] = await Promise.all([
      supabase.from("Users").select("id, SettingsCountry").eq("id", userId).single(),
      supabase.from("Customers").select("id, GoCardlessMandateId, GoCardlessMandateStatus").eq("id", customerId).single(),
      supabase.from("CustomerInvoices").select("id, InvoiceID, CustomerID").eq("id", invoiceId).single(),
      supabase.from("CustomerInvoiceJobs").select("Price").eq("InvoiceID", invoiceId),
    ]);

    if (invoiceError || !invoice) {
      return jsonResponse(404, { error: "Invoice not found" });
    }

    if (itemsError) {
      return jsonResponse(500, { error: itemsError.message || "Unable to load invoice items" });
    }

    if (!customer?.GoCardlessMandateId) {
      return jsonResponse(400, { error: "Customer does not have an active GoCardless mandate yet" });
    }

    const blockedMandateStatuses = new Set(["cancelled", "failed", "expired"]);
    if (blockedMandateStatuses.has(String(customer.GoCardlessMandateStatus || "").toLowerCase())) {
      return jsonResponse(400, { error: `Customer mandate is ${customer.GoCardlessMandateStatus}` });
    }

    const total = (invoiceItems || []).reduce((sum, item) => sum + (Number(item.Price) || 0), 0);
    const payload = {
      payments: {
        amount: toMinorUnitAmount(total),
        currency: mapCountryToCurrency(user?.SettingsCountry),
        links: {
          mandate: customer.GoCardlessMandateId,
        },
        metadata: {
          invoice_id: String(invoice.id),
          customer_id: String(customerId),
          invoice_number: String(invoice.InvoiceID || invoice.id),
        },
      },
    };

    const paymentResponse = await gocardlessRequest(connection.AccessToken, "/payments", {
      method: "POST",
      body: payload,
      idempotencyKey: `invoice-${invoice.id}`,
    });

    const payment = paymentResponse?.payments;
    if (!payment?.id) {
      throw new Error("GoCardless did not return a payment id");
    }

    const { error: updateError } = await supabase
      .from("CustomerInvoices")
      .update({
        GoCardlessPaymentId: payment.id,
        GoCardlessPaymentStatus: payment.status || "submitted",
        GoCardlessRequestedAt: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    if (updateError) throw updateError;

    return jsonResponse(200, {
      ok: true,
      paymentId: payment.id,
      status: payment.status || "submitted",
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to collect GoCardless payment",
    });
  }
});
