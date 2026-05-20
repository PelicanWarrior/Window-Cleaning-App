import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getConnectionByUserId,
  getSupabaseAdminClient,
  gocardlessRequest,
  jsonResponse,
  toMinorUnitAmount,
} from "../_shared/gocardless.ts";

function isMissingRefundColumnError(message: string) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("column") &&
    (normalized.includes("gocardlessrefundid") ||
      normalized.includes("gocardlessrefundstatus") ||
      normalized.includes("gocardlessrefundedat"))
  );
}

function isLikelyClientRefundError(message: string) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("refund") ||
    normalized.includes("payment") ||
    normalized.includes("invalid") ||
    normalized.includes("missing") ||
    normalized.includes("cannot") ||
    normalized.includes("already") ||
    normalized.includes("not connected")
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
    const invoiceId = body?.invoiceId;
    const requestedAmount = Number(body?.amount || 0);

    if (!userId || !invoiceId) {
      return jsonResponse(400, { error: "Missing userId or invoiceId" });
    }

    const { supabase } = getSupabaseAdminClient();
    const [{ data: invoice, error: invoiceError }, { data: invoiceItems, error: invoiceItemsError }] = await Promise.all([
      supabase
        .from("CustomerInvoices")
        .select("id, CustomerID, GoCardlessPaymentId, GoCardlessPaymentStatus")
        .eq("id", invoiceId)
        .single(),
      supabase
        .from("CustomerInvoiceJobs")
        .select("Price")
        .eq("InvoiceID", invoiceId),
    ]);

    if (invoiceError || !invoice) {
      return jsonResponse(404, { error: "Invoice not found" });
    }

    if (invoiceItemsError) {
      throw invoiceItemsError;
    }

    let connection = await getConnectionByUserId(userId);
    let resolvedConnectionUserId: number | string = userId;

    if (!connection?.AccessToken && invoice?.CustomerID) {
      const { data: customerOwner } = await supabase
        .from("Customers")
        .select("UserId")
        .eq("id", invoice.CustomerID)
        .maybeSingle();

      if (customerOwner?.UserId && String(customerOwner.UserId) !== String(userId)) {
        connection = await getConnectionByUserId(customerOwner.UserId);
        resolvedConnectionUserId = customerOwner.UserId;
      }
    }

    if (!connection?.AccessToken) {
      return jsonResponse(400, {
        error: "GoCardless is not connected for this user",
        requestedUserId: userId,
        resolvedConnectionUserId,
      });
    }

    if (!invoice?.GoCardlessPaymentId) {
      return jsonResponse(400, { error: "Invoice is missing GoCardless payment id" });
    }

    const paymentStatus = String(invoice.GoCardlessPaymentStatus || "").toLowerCase();
    const notRefundableStatuses = new Set([
      "pending_submission",
      "pending_customer_approval",
      "customer_approval_denied",
      "cancelled",
      "failed",
      "charged_back",
    ]);
    if (notRefundableStatuses.has(paymentStatus)) {
      return jsonResponse(400, {
        error: `Payment status ${paymentStatus || "unknown"} cannot be refunded yet`,
      });
    }

    const maxAmount = (invoiceItems || []).reduce((sum, row) => sum + (Number(row.Price) || 0), 0);
    const amount = requestedAmount > 0 ? requestedAmount : maxAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse(400, { error: "Refund amount must be greater than 0" });
    }

    const payload = {
      refunds: {
        amount: toMinorUnitAmount(Math.min(amount, maxAmount)),
        links: {
          payment: invoice.GoCardlessPaymentId,
        },
      },
    };

    const response = await gocardlessRequest(connection.AccessToken, "/refunds", {
      method: "POST",
      body: payload,
      idempotencyKey: `refund-${invoice.id}-${amount}`,
    });

    const refund = response?.refunds;
    if (!refund?.id) {
      throw new Error("GoCardless did not return a refund id");
    }

    const refundUpdates = {
      GoCardlessRefundId: refund.id,
      GoCardlessRefundStatus: refund.status || "submitted",
      GoCardlessRefundedAt: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("CustomerInvoices")
      .update(refundUpdates)
      .eq("id", invoice.id);

    let warning: string | null = null;
    if (updateError) {
      if (isMissingRefundColumnError(updateError.message || "")) {
        // Remote schema can lag behind function deploys; keep refund successful even if local columns are missing.
        const { error: fallbackError } = await supabase
          .from("CustomerInvoices")
          .update({
            GoCardlessPaymentStatus: "refund_submitted",
          })
          .eq("id", invoice.id);

        if (fallbackError) throw fallbackError;
        warning = "Refund created but refund status columns are missing in database";
      } else {
        throw updateError;
      }
    }

    return jsonResponse(200, {
      ok: true,
      refundId: refund.id,
      status: refund.status || null,
      warning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create refund";
    const status = isLikelyClientRefundError(message) ? 400 : 500;
    return jsonResponse(status, { error: message });
  }
});
