import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  buildAppUrl,
  corsHeaders,
  getConnectionByUserId,
  getSupabaseAdminClient,
  gocardlessRequest,
  jsonResponse,
  mapCountryToCountryCode,
  mapCountryToCurrency,
  resolveAppBaseUrl,
  splitCustomerName,
  toMinorUnitAmount,
} from "../_shared/gocardless.ts";

function buildCustomerDetailsPayload(customer: Record<string, any>, user: Record<string, any>) {
  const names = splitCustomerName(customer?.CustomerName);
  const countryCode = mapCountryToCountryCode(user?.SettingsCountry);
  const city = customer?.Address3 || customer?.Address2 || customer?.Address || customer?.Town || "Unknown";

  return {
    customer: {
      email: customer?.EmailAddress || undefined,
      given_name: names.given_name,
      family_name: names.family_name || undefined,
    },
    customer_billing_detail: {
      address_line1: customer?.Address || undefined,
      address_line2: customer?.Address2 || undefined,
      address_line3: customer?.Address3 || undefined,
      city,
      postal_code: customer?.Postcode || undefined,
      country_code: countryCode,
    },
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
    const invoiceId = body?.invoiceId || null;

    if (!userId || !customerId) {
      return jsonResponse(400, { error: "Missing userId or customerId" });
    }

    const connection = await getConnectionByUserId(userId);
    if (!connection?.AccessToken) {
      return jsonResponse(400, { error: "GoCardless is not connected for this user" });
    }

    const { supabase } = getSupabaseAdminClient();
    const appBaseUrl = resolveAppBaseUrl(req);

    const [{ data: user, error: userError }, { data: customer, error: customerError }] = await Promise.all([
      supabase.from("Users").select("id, SettingsCountry, GoCardlessConnected").eq("id", userId).single(),
      supabase.from("Customers").select("*").eq("id", customerId).single(),
    ]);

    if (userError || !user) {
      return jsonResponse(404, { error: "User not found" });
    }

    if (customerError || !customer) {
      return jsonResponse(404, { error: "Customer not found" });
    }

    const currency = mapCountryToCurrency(user.SettingsCountry);
    const returnUrlBase = {
      gocardless: "flow_return",
      customer_id: customerId,
      invoice_id: invoiceId,
    };
    const exitUrlBase = {
      gocardless: "flow_exit",
      customer_id: customerId,
      invoice_id: invoiceId,
    };

    const billingRequestBody: Record<string, any> = {
      billing_requests: {
        mandate_request: {
          currency,
        },
      },
    };

    let invoiceRow: Record<string, any> | null = null;
    if (invoiceId) {
      const { data: invoice, error: invoiceError } = await supabase
        .from("CustomerInvoices")
        .select("id, InvoiceID, CustomerID, InvoiceDate")
        .eq("id", invoiceId)
        .single();

      if (invoiceError || !invoice) {
        return jsonResponse(404, { error: "Invoice not found" });
      }

      const { data: items, error: itemsError } = await supabase
        .from("CustomerInvoiceJobs")
        .select("Service, Price")
        .eq("InvoiceID", invoice.id);

      if (itemsError) {
        return jsonResponse(500, { error: itemsError.message || "Unable to load invoice items" });
      }

      const total = (items || []).reduce((sum, item) => sum + (Number(item.Price) || 0), 0);
      const description = `Invoice ${invoice.InvoiceID || invoice.id}`;
      billingRequestBody.billing_requests.payment_request = {
        amount: toMinorUnitAmount(total),
        currency,
        description,
      };
      invoiceRow = invoice;
    }

    const billingRequestResponse = await gocardlessRequest(connection.AccessToken, "/billing_requests", {
      method: "POST",
      body: billingRequestBody,
    });

    const billingRequest = billingRequestResponse?.billing_requests;
    if (!billingRequest?.id) {
      throw new Error("GoCardless did not return a billing request id");
    }

    const customerDetails = buildCustomerDetailsPayload(customer, user);
    const hasAnyCustomerData = Boolean(
      customerDetails.customer.email ||
      customerDetails.customer.given_name ||
      customerDetails.customer.family_name ||
      customerDetails.customer_billing_detail.address_line1 ||
      customerDetails.customer_billing_detail.city ||
      customerDetails.customer_billing_detail.postal_code
    );

    if (hasAnyCustomerData) {
      try {
        await gocardlessRequest(connection.AccessToken, `/billing_requests/${billingRequest.id}/actions/collect_customer_details`, {
          method: "POST",
          body: { data: customerDetails },
        });
      } catch (collectError) {
        console.warn("[gocardless_create_flow] Unable to prefill customer details", collectError);
      }
    }

    const flowResponse = await gocardlessRequest(connection.AccessToken, "/billing_request_flows", {
      method: "POST",
      body: {
        billing_request_flows: {
          redirect_uri: buildAppUrl(appBaseUrl, {
            ...returnUrlBase,
            billing_request_id: billingRequest.id,
          }),
          exit_uri: buildAppUrl(appBaseUrl, {
            ...exitUrlBase,
            billing_request_id: billingRequest.id,
          }),
          links: {
            billing_request: billingRequest.id,
          },
        },
      },
    });

    const flow = flowResponse?.billing_request_flows;
    if (!flow?.authorisation_url) {
      throw new Error("GoCardless did not return an authorisation url");
    }

    const customerUpdates: Record<string, any> = {
      GoCardlessBillingRequestId: billingRequest.id,
      GoCardlessBillingRequestFlowId: flow.id || null,
    };

    const invoiceUpdates: Record<string, any> = invoiceRow ? {
      GoCardlessBillingRequestId: billingRequest.id,
      GoCardlessBillingRequestFlowId: flow.id || null,
      GoCardlessPaymentStatus: "pending_customer_action",
      GoCardlessRequestedAt: new Date().toISOString(),
    } : {};

    const updates: Promise<any>[] = [
      supabase.from("Customers").update(customerUpdates).eq("id", customerId),
    ];

    if (invoiceRow) {
      updates.push(
        supabase.from("CustomerInvoices").update(invoiceUpdates).eq("id", invoiceRow.id),
      );
    }

    await Promise.all(updates);

    return jsonResponse(200, {
      url: flow.authorisation_url,
      billingRequestId: billingRequest.id,
      billingRequestFlowId: flow.id || null,
      mode: invoiceId ? "invoice_payment_and_mandate" : "mandate_setup",
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to create GoCardless flow",
    });
  }
});
