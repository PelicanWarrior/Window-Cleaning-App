import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getConnectionByUserId,
  getSupabaseAdminClient,
  gocardlessRequest,
  jsonResponse,
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
    const limit = Math.max(1, Math.min(200, Number(body?.limit || 50)));

    if (!userId) {
      return jsonResponse(400, { error: "Missing userId" });
    }

    const connection = await getConnectionByUserId(userId);
    if (!connection?.AccessToken) {
      return jsonResponse(400, { error: "GoCardless is not connected for this user" });
    }

    const { supabase } = getSupabaseAdminClient();

    const { data: customers, error: customersError } = await supabase
      .from("Customers")
      .select("id")
      .eq("UserId", userId);

    if (customersError) throw customersError;

    const customerIds = (customers || []).map((c: any) => c.id).filter(Boolean);
    if (customerIds.length === 0) {
      return jsonResponse(200, {
        ok: true,
        scanned: 0,
        updated: 0,
        skipped: 0,
        errors: [],
      });
    }

    const { data: invoices, error: invoicesError } = await supabase
      .from("CustomerInvoices")
      .select("id, InvoiceID, CustomerID, GoCardlessPaymentId, GoCardlessPaymentStatus, GoCardlessPaymentConfirmedAt")
      .in("CustomerID", customerIds)
      .not("GoCardlessPaymentId", "is", null)
      .order("id", { ascending: false })
      .limit(limit);

    if (invoicesError) throw invoicesError;

    const rows = invoices || [];
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ invoiceId: number; paymentId: string; error: string }> = [];

    for (const invoice of rows) {
      const paymentId = invoice?.GoCardlessPaymentId;
      if (!paymentId) {
        skipped += 1;
        continue;
      }

      try {
        const response = await gocardlessRequest(connection.AccessToken, `/payments/${paymentId}`);
        const payment = response?.payments;
        const status = String(payment?.status || "").toLowerCase() || null;
        const previousStatus = String(invoice.GoCardlessPaymentStatus || "").toLowerCase();

        if (!status) {
          skipped += 1;
          continue;
        }

        if (status === "paid_out" && previousStatus !== "paid_out") {
          const payoutUpdates: Record<string, unknown> = {
            GoCardlessPaymentStatus: "paid_out",
          };
          if (!invoice.GoCardlessPaymentConfirmedAt) {
            payoutUpdates.GoCardlessPaymentConfirmedAt = new Date().toISOString();
          }

          const { data: updatedInvoice, error: updateError } = await supabase
            .from("CustomerInvoices")
            .update(payoutUpdates)
            .eq("id", invoice.id)
            .neq("GoCardlessPaymentStatus", "paid_out")
            .select("id, CustomerID")
            .maybeSingle();

          if (updateError) throw updateError;

          if (updatedInvoice?.id && updatedInvoice?.CustomerID) {
            const invoiceTotal = await getInvoiceTotal(supabase, invoice.id);
            await deductCustomerOutstanding(supabase, Number(updatedInvoice.CustomerID), invoiceTotal);
            updated += 1;
          } else {
            skipped += 1;
          }

          continue;
        }

        const updates: Record<string, unknown> = {};
        if (status !== previousStatus) {
          updates.GoCardlessPaymentStatus = status;
        }

        if (
          ["confirmed", "paid_out"].includes(status) &&
          !invoice.GoCardlessPaymentConfirmedAt
        ) {
          updates.GoCardlessPaymentConfirmedAt = new Date().toISOString();
        }

        if (Object.keys(updates).length === 0) {
          skipped += 1;
          continue;
        }

        const { error: updateError } = await supabase
          .from("CustomerInvoices")
          .update(updates)
          .eq("id", invoice.id);

        if (updateError) throw updateError;
        updated += 1;
      } catch (error) {
        errors.push({
          invoiceId: invoice.id,
          paymentId,
          error: error instanceof Error ? error.message : "Payment sync failed",
        });
      }
    }

    return jsonResponse(200, {
      ok: true,
      scanned: rows.length,
      updated,
      skipped,
      errors,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to sync GoCardless payments",
    });
  }
});
