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
  const names = splitCustomerName(customer?.CustomerName || customer?.Name);
  const countryCode = mapCountryToCountryCode(
    customer?.Country ||
    customer?.CountryName ||
    user?.SettingsCountry,
  );

  const email =
    customer?.EmailAddress ||
    customer?.email_address ||
    customer?.Email ||
    customer?.email ||
    undefined;

  const rawPhoneNumber =
    customer?.PhoneNumber ||
    customer?.Phone ||
    customer?.Mobile ||
    customer?.Telephone ||
    undefined;

  const normalizePhoneNumber = (raw: string | undefined) => {
    if (!raw) return undefined;
    const compact = String(raw).trim().replace(/[\s().-]/g, "");
    if (!compact) return undefined;

    if (/^\+[1-9]\d{7,14}$/.test(compact)) {
      return compact;
    }

    if (/^0\d{9,10}$/.test(compact)) {
      return `+44${compact.slice(1)}`;
    }

    if (/^\d{7,15}$/.test(compact)) {
      return `+${compact}`;
    }

    return undefined;
  };

  const phoneNumber = normalizePhoneNumber(rawPhoneNumber);

  const addressLine1 =
    customer?.Address ||
    customer?.Address1 ||
    customer?.address_line1 ||
    undefined;

  const addressLine2 =
    customer?.Address2 ||
    customer?.address_line2 ||
    undefined;

  const addressLine3 =
    customer?.Address3 ||
    customer?.address_line3 ||
    undefined;

  const city =
    customer?.Town ||
    customer?.City ||
    customer?.County ||
    addressLine3 ||
    addressLine2 ||
    addressLine1 ||
    "Unknown";

  const postalCode =
    customer?.Postcode ||
    customer?.PostalCode ||
    customer?.postcode ||
    customer?.postal_code ||
    undefined;

  return {
    customer: {
      email,
      phone_number: phoneNumber,
      given_name: names.given_name,
      family_name: names.family_name || undefined,
    },
    customer_billing_detail: {
      address_line1: addressLine1,
      address_line2: addressLine2,
      address_line3: addressLine3,
      city,
      postal_code: postalCode,
      country_code: countryCode,
    },
  };
}

async function prefillCustomerDetails(
  accessToken: string,
  billingRequestId: string,
  customerDetails: Record<string, any>,
) {
  const payloadVariants: Array<{ label: string; payload: Record<string, any> }> = [
    { label: "data", payload: { data: customerDetails } },
    { label: "collect_customer_details", payload: { collect_customer_details: customerDetails } },
    { label: "direct", payload: customerDetails },
  ];

  let lastError: unknown = null;

  const wasFieldApplied = (response: any, details: Record<string, any>) => {
    const actions: any[] = response?.billing_requests?.actions || [];
    const collectAction = actions.find((action) => action?.type === "collect_customer_details");
    const incompleteCustomer = collectAction?.collect_customer_details?.incomplete_fields?.customer || [];
    const incompleteBilling = collectAction?.collect_customer_details?.incomplete_fields?.customer_billing_detail || [];

    const expectsEmail = Boolean(details?.customer?.email);
    const expectsAddressLine1 = Boolean(details?.customer_billing_detail?.address_line1);
    const expectsCity = Boolean(details?.customer_billing_detail?.city);
    const expectsPostalCode = Boolean(details?.customer_billing_detail?.postal_code);
    const expectsCountryCode = Boolean(details?.customer_billing_detail?.country_code);

    const emailApplied = !expectsEmail || !incompleteCustomer.includes("email");
    const addressLine1Applied = !expectsAddressLine1 || !incompleteBilling.includes("address_line1");
    const cityApplied = !expectsCity || !incompleteBilling.includes("city");
    const postalCodeApplied = !expectsPostalCode || !incompleteBilling.includes("postal_code");
    const countryCodeApplied = !expectsCountryCode || !incompleteBilling.includes("country_code");

    return emailApplied && addressLine1Applied && cityApplied && postalCodeApplied && countryCodeApplied;
  };

  for (const variant of payloadVariants) {
    try {
      const response = await gocardlessRequest(accessToken, `/billing_requests/${billingRequestId}/actions/collect_customer_details`, {
        method: "POST",
        body: variant.payload,
      });

      if (!wasFieldApplied(response, customerDetails)) {
        lastError = new Error(`GoCardless accepted '${variant.label}' payload but did not apply prefilled customer details`);
        continue;
      }

      return {
        ok: true,
        variant: variant.label,
        response,
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    variant: null,
    error: lastError instanceof Error ? lastError.message : "Unable to prefill customer details",
  };
}

async function ensureGoCardlessCustomerLinks(
  accessToken: string,
  customerDetails: Record<string, any>,
  existing: { customerId?: string | null; customerBillingDetailId?: string | null },
) {
  let customerId = existing.customerId || null;
  let customerBillingDetailId = existing.customerBillingDetailId || null;

  const hasCustomerIdentity = Boolean(
    customerDetails?.customer?.email ||
    customerDetails?.customer?.phone_number ||
    customerDetails?.customer?.given_name ||
    customerDetails?.customer?.family_name,
  );

  const hasBillingAddress = Boolean(
    customerDetails?.customer_billing_detail?.address_line1 ||
    customerDetails?.customer_billing_detail?.city ||
    customerDetails?.customer_billing_detail?.postal_code ||
    customerDetails?.customer_billing_detail?.country_code,
  );

  const diagnostics: Record<string, unknown> = {
    usedExistingCustomerId: Boolean(customerId),
    usedExistingCustomerBillingDetailId: Boolean(customerBillingDetailId),
    createCustomerError: null,
    createCustomerBillingDetailError: null,
  };

  if (!customerId && hasCustomerIdentity) {
    try {
      const customerResponse = await gocardlessRequest(accessToken, "/customers", {
        method: "POST",
        body: {
          customers: {
            email: customerDetails.customer.email || undefined,
            phone_number: customerDetails.customer.phone_number || undefined,
            given_name: customerDetails.customer.given_name || undefined,
            family_name: customerDetails.customer.family_name || undefined,
          },
        },
      });
      customerId = customerResponse?.customers?.id || null;
    } catch (error) {
      diagnostics.createCustomerError = error instanceof Error ? error.message : "Unable to create GoCardless customer";
      // Fall back to action-based prefill flow.
    }
  }

  if (customerId && !customerBillingDetailId && hasBillingAddress) {
    try {
      const billingDetailResponse = await gocardlessRequest(accessToken, "/customer_billing_details", {
        method: "POST",
        body: {
          customer_billing_details: {
            address_line1: customerDetails.customer_billing_detail.address_line1 || undefined,
            address_line2: customerDetails.customer_billing_detail.address_line2 || undefined,
            address_line3: customerDetails.customer_billing_detail.address_line3 || undefined,
            city: customerDetails.customer_billing_detail.city || undefined,
            postal_code: customerDetails.customer_billing_detail.postal_code || undefined,
            country_code: customerDetails.customer_billing_detail.country_code || undefined,
            links: {
              customer: customerId,
            },
          },
        },
      });
      customerBillingDetailId = billingDetailResponse?.customer_billing_details?.id || null;
    } catch (error) {
      diagnostics.createCustomerBillingDetailError = error instanceof Error
        ? error.message
        : "Unable to create GoCardless customer billing detail";
      // Fall back to action-based prefill flow.
    }
  }

  return {
    customerId,
    customerBillingDetailId,
    diagnostics,
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
    const amount = body?.amount;
    const openBankingOnly = Boolean(body?.openBankingOnly);
    const prefillBankDetails = body?.prefillBankDetails && typeof body.prefillBankDetails === "object"
      ? body.prefillBankDetails
      : null;
    const debugPrefill = Boolean(body?.debugPrefill);

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

    const billingRequestsPayload: Record<string, any> = {
      mandate_request: {
        currency,
        // Protect+ style verification to reduce bank detail and payer risk.
        verify: "recommended",
      },
      metadata: {
        app_flow: invoiceId ? "invoice_collect" : "mandate_setup",
      },
    };

    const billingRequestBody: Record<string, any> = {
      billing_requests: billingRequestsPayload,
    };

    let invoiceRow: Record<string, any> | null = null;
    const amountValue = Number(amount);
    const hasStandaloneAmount = Number.isFinite(amountValue) && amountValue > 0;
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
      billingRequestsPayload.payment_request = {
        amount: toMinorUnitAmount(total),
        currency,
        description,
      };

      // Combined Open Banking + Direct Debit flow is enabled by default.
      billingRequestsPayload.fallback_enabled = !openBankingOnly;

      if (openBankingOnly) {
        delete billingRequestsPayload.mandate_request;
      }

      invoiceRow = invoice;
    } else if (hasStandaloneAmount) {
      billingRequestsPayload.payment_request = {
        amount: toMinorUnitAmount(amountValue),
        currency,
        description: `Service for ${customer?.CustomerName || customer?.Name || "customer"}`,
      };
      billingRequestsPayload.fallback_enabled = !openBankingOnly;

      if (openBankingOnly) {
        delete billingRequestsPayload.mandate_request;
      }
    }

    if (prefillBankDetails && billingRequestsPayload.mandate_request) {
      billingRequestsPayload.mandate_request.bank_account = {
        account_holder_name: prefillBankDetails.account_holder_name,
        account_number: prefillBankDetails.account_number,
        branch_code: prefillBankDetails.branch_code,
        country_code: prefillBankDetails.country_code || mapCountryToCountryCode(user?.SettingsCountry),
      };
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

    const linkedGoCardlessDetails = await ensureGoCardlessCustomerLinks(
      connection.AccessToken,
      customerDetails,
      {
        customerId: customer?.GoCardlessCustomerId || null,
        customerBillingDetailId: customer?.GoCardlessCustomerBillingDetailId || null,
      },
    );

    const hasLinkedCustomerDetails = Boolean(
      linkedGoCardlessDetails.customerId && linkedGoCardlessDetails.customerBillingDetailId,
    );

    if (linkedGoCardlessDetails.customerId || linkedGoCardlessDetails.customerBillingDetailId) {
      billingRequestsPayload.links = {
        ...(billingRequestsPayload.links || {}),
      };
      if (linkedGoCardlessDetails.customerId) {
        billingRequestsPayload.links.customer = linkedGoCardlessDetails.customerId;
      }
      if (linkedGoCardlessDetails.customerBillingDetailId) {
        billingRequestsPayload.links.customer_billing_detail = linkedGoCardlessDetails.customerBillingDetailId;
      }
    }
    const hasAnyCustomerData = Boolean(
      customerDetails.customer.email ||
      customerDetails.customer.given_name ||
      customerDetails.customer.family_name ||
      customerDetails.customer_billing_detail.address_line1 ||
      customerDetails.customer_billing_detail.city ||
      customerDetails.customer_billing_detail.postal_code
    );

    let prefillDiagnostics: Record<string, unknown> = {
      attempted: false,
      ok: false,
    };

    if (hasAnyCustomerData && !hasLinkedCustomerDetails) {
      prefillDiagnostics.attempted = true;
      try {
        const prefillResult = await prefillCustomerDetails(connection.AccessToken, billingRequest.id, customerDetails);
        prefillDiagnostics = {
          attempted: true,
          ...prefillResult,
        };
      } catch (collectError) {
        console.warn("[gocardless_create_flow] Unable to prefill customer details", collectError instanceof Error ? collectError.message : collectError);
      }
    } else if (hasLinkedCustomerDetails) {
      prefillDiagnostics = {
        attempted: false,
        ok: true,
        skipped: "linked_customer_details",
      };
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
      ...(linkedGoCardlessDetails.customerId
        ? { GoCardlessCustomerId: linkedGoCardlessDetails.customerId }
        : {}),
      ...(linkedGoCardlessDetails.customerBillingDetailId
        ? { GoCardlessCustomerBillingDetailId: linkedGoCardlessDetails.customerBillingDetailId }
        : {}),
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

    const result: Record<string, unknown> = {
      url: flow.authorisation_url,
      billingRequestId: billingRequest.id,
      billingRequestFlowId: flow.id || null,
      mode: invoiceId
        ? (openBankingOnly ? "invoice_open_banking" : "invoice_payment_and_mandate")
        : (hasStandaloneAmount
          ? (openBankingOnly ? "amount_open_banking" : "amount_payment_and_mandate")
          : "mandate_setup"),
    };

    if (debugPrefill) {
      result.prefillDiagnostics = prefillDiagnostics;
      result.prefillCustomerDetails = customerDetails;
      result.linkedGoCardlessDetails = linkedGoCardlessDetails;
      result.usedLinkedCustomerDetails = hasLinkedCustomerDetails;
    }

    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to create GoCardless flow",
    });
  }
});
