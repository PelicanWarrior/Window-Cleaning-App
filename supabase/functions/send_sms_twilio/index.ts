import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getSupabaseAdminClient, jsonResponse } from "../_shared/gocardless.ts";

type RequestBody = {
  userId?: number | string;
  customerId?: number | string;
  subject?: string;
  body?: string;
};

function normalizePhoneNumber(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.startsWith("+")) return value.replace(/\s+/g, "");
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+44${digits.slice(1)}`;
  }
  if (!digits.startsWith("44") && digits.length >= 10) {
    return `+${digits}`;
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function estimateSegmentCount(message: string) {
  const length = String(message || "").length;
  return Math.max(1, Math.ceil(length / 160));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const userId = body?.userId;
    const customerId = body?.customerId;
    const messageBody = String(body?.body || "").trim();
    const subject = String(body?.subject || "").trim();

    if (!userId) return jsonResponse(400, { error: "Missing userId" });
    if (!customerId) return jsonResponse(400, { error: "Missing customerId" });
    if (!messageBody && !subject) return jsonResponse(400, { error: "Missing message body" });

    const { supabase } = getSupabaseAdminClient();

    const { data: connection, error: connectionError } = await supabase
      .from('TwilioConnections')
      .select('AccountSid, AuthToken, FromNumber, BillingRatePencePerSegment')
      .eq('UserId', userId)
      .is('DisconnectedAt', null)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) return jsonResponse(400, { error: 'Twilio is not connected for this user' });

    const { data: customer, error: customerError } = await supabase
      .from('Customers')
      .select('id, PhoneNumber, CustomerName')
      .eq('id', customerId)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer) return jsonResponse(404, { error: 'Customer not found' });

    const toNumber = normalizePhoneNumber(customer.PhoneNumber || '');
    if (!toNumber) return jsonResponse(400, { error: 'Customer does not have a valid mobile number' });

    const fromNumber = normalizePhoneNumber(connection.FromNumber || '');
    if (!fromNumber) return jsonResponse(400, { error: 'Twilio phone number is missing or invalid' });

    const messageText = messageBody || subject;
    const segmentCount = estimateSegmentCount(messageText);
    const costPence = segmentCount * Math.max(1, Number(connection.BillingRatePencePerSegment) || 5);

    const { data: wallet, error: walletError } = await supabase
      .from('TwilioWallets')
      .select('BalancePence')
      .eq('UserId', userId)
      .maybeSingle();

    if (walletError) throw walletError;

    const currentBalance = Number(wallet?.BalancePence || 0);
    if (currentBalance < costPence) {
      return jsonResponse(400, {
        error: `Insufficient Twilio credits. Required ${costPence}p, available ${currentBalance}p.`,
      });
    }

    const sendResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(connection.AccountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${connection.AccountSid}:${connection.AuthToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: toNumber,
        Body: messageText,
      }),
    });

    const sendPayload = await sendResponse.json().catch(() => ({}));
    if (!sendResponse.ok) {
      const message = sendPayload?.message || sendPayload?.detail || `Twilio send failed (${sendResponse.status})`;
      await supabase.from('TwilioConnections').update({ LastError: message, UpdatedAt: new Date().toISOString() }).eq('UserId', userId);
      return jsonResponse(400, { error: message });
    }

    const remainingBalance = currentBalance - costPence;

    const { error: walletUpdateError } = await supabase
      .from('TwilioWallets')
      .upsert({
        UserId: userId,
        BalancePence: remainingBalance,
        Currency: 'GBP',
        UpdatedAt: new Date().toISOString(),
      }, { onConflict: 'UserId' });

    if (walletUpdateError) throw walletUpdateError;

    const { error: transactionError } = await supabase.from('TwilioWalletTransactions').insert({
      UserId: userId,
      CustomerId: customerId,
      MessageSid: sendPayload?.sid || null,
      EntryType: 'message_charge',
      AmountPence: -costPence,
      BalanceAfterPence: remainingBalance,
      Description: `SMS sent to ${customer.CustomerName || customerId}`,
    });

    if (transactionError) throw transactionError;

    const { error: logError } = await supabase.from('TwilioMessageLogs').insert({
      UserId: userId,
      CustomerId: customerId,
      ToNumber: toNumber,
      FromNumber: fromNumber,
      Body: messageText,
      Status: sendPayload?.status || 'queued',
      TwilioMessageSid: sendPayload?.sid || null,
      SegmentCount: segmentCount,
      CostPence: costPence,
      Provider: 'twilio',
      Payload: sendPayload,
    });

    if (logError) throw logError;

    await supabase
      .from('Users')
      .update({
        TwilioConnected: true,
        TwilioPhoneNumber: fromNumber,
        TwilioConnectionStatus: 'connected',
        TwilioLastSyncAt: new Date().toISOString(),
      })
      .eq('id', userId);

    return jsonResponse(200, {
      ok: true,
      messageSid: sendPayload?.sid || null,
      status: sendPayload?.status || 'queued',
      segmentCount,
      costPence,
      remainingBalancePence: remainingBalance,
      channel: 'Twilio',
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unable to send Twilio message',
    });
  }
});
