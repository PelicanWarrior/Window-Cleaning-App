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

function buildCustomerAddress(customer: Record<string, any>) {
  const parts = [
    customer?.Address,
    customer?.Address2,
    customer?.Address3,
    customer?.Town,
    customer?.Postcode,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return parts.join(", ");
}

function buildPaymentDescription(customer: Record<string, any>, invoice: Record<string, any>) {
  const address = buildCustomerAddress(customer);
  const invoiceLabel = `Invoice ${invoice?.InvoiceID || invoice?.id}`;
  const description = address ? `${invoiceLabel} - ${address}` : invoiceLabel;

  // Keep descriptions concise for downstream display and provider limits.
  return description.slice(0, 140);
}

async function tryRecoverMandateFromDuplicateCustomer(
  supabase: ReturnType<typeof getSupabaseAdminClient>["supabase"],
  customer: Record<string, any>,
) {
  if (!customer?.id || !customer?.UserId) return null;

  const email = String(customer?.EmailAddress || "").trim();
  const name = String(customer?.CustomerName || "").trim();
  if (!email && !name) return null;

  let query = supabase
    .from("Customers")
    .select("id, GoCardlessCustomerId, GoCardlessCustomerBillingDetailId, GoCardlessMandateId, GoCardlessMandateStatus")
    .eq("UserId", customer.UserId)
    .neq("id", customer.id)
    .not("GoCardlessMandateId", "is", null)
    .limit(1);

  if (email) {
    query = query.eq("EmailAddress", email);
  } else {
    query = query.eq("CustomerName", name);
  }

  const { data: candidates, error } = await query;
  if (error || !Array.isArray(candidates) || candidates.length === 0) return null;

  const candidate = candidates[0];
  const mandateId = candidate?.GoCardlessMandateId;
  if (!mandateId) return null;

  const updates: Record<string, unknown> = {
    GoCardlessMandateId: mandateId,
    GoCardlessMandateStatus: candidate?.GoCardlessMandateStatus || "pending_submission",
  };

  if (candidate?.GoCardlessCustomerId) {
    updates.GoCardlessCustomerId = candidate.GoCardlessCustomerId;
  }

  if (candidate?.GoCardlessCustomerBillingDetailId) {
    updates.GoCardlessCustomerBillingDetailId = candidate.GoCardlessCustomerBillingDetailId;
  }

  const { error: updateError } = await supabase
    .from("Customers")
    .update(updates)
    .eq("id", customer.id);

  if (updateError) return null;

  return {
    ...customer,
    ...updates,
  };
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
    const invoiceId = body?.invoiceId;
    const successPlus = body?.successPlus !== false;

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
      supabase
        .from("Customers")
        .select("id, UserId, CustomerName, EmailAddress, GoCardlessCustomerId, GoCardlessCustomerBillingDetailId, GoCardlessMandateId, GoCardlessMandateStatus, Address, Address2, Address3, Town, Postcode")
        .eq("id", customerId)
        .single(),
      supabase.from("CustomerInvoices").select("id, InvoiceID, CustomerID").eq("id", invoiceId).single(),
      supabase.from("CustomerInvoiceJobs").select("Price").eq("InvoiceID", invoiceId),
    ]);

    if (invoiceError || !invoice) {
      return jsonResponse(404, { error: "Invoice not found" });
    }

    if (itemsError) {
      return jsonResponse(500, { error: itemsError.message || "Unable to load invoice items" });
    }

    let effectiveCustomer = customer;
    if (!effectiveCustomer?.GoCardlessMandateId) {
      const recovered = await tryRecoverMandateFromDuplicateCustomer(supabase, effectiveCustomer || {});
      if (recovered?.GoCardlessMandateId) {
        effectiveCustomer = recovered;
      }
    }

    if (!effectiveCustomer?.GoCardlessMandateId) {
      return jsonResponse(400, { error: "Customer does not have an active GoCardless mandate yet" });
    }

    const blockedMandateStatuses = new Set(["cancelled", "failed", "expired"]);
    if (blockedMandateStatuses.has(String(effectiveCustomer.GoCardlessMandateStatus || "").toLowerCase())) {
      return jsonResponse(400, { error: `Customer mandate is ${effectiveCustomer.GoCardlessMandateStatus}` });
    }

    const total = (invoiceItems || []).reduce((sum, item) => sum + (Number(item.Price) || 0), 0);
    const payload = {
      payments: {
        amount: toMinorUnitAmount(total),
        currency: mapCountryToCurrency(user?.SettingsCountry),
        description: buildPaymentDescription(effectiveCustomer || {}, invoice),
        retry_if_possible: successPlus,
        links: {
          mandate: effectiveCustomer.GoCardlessMandateId,
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
