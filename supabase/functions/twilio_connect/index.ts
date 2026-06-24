import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getSupabaseAdminClient, jsonResponse } from "../_shared/gocardless.ts";

type RequestBody = {
  userId?: number | string;
  country?: string;
  billingRatePencePerSegment?: number;
};

const TWILIO_MASTER_ACCOUNT_SID = (Deno.env.get("TWILIO_MASTER_ACCOUNT_SID") || Deno.env.get("TWILIO_ACCOUNT_SID") || "").trim();
const TWILIO_MASTER_AUTH_TOKEN = (Deno.env.get("TWILIO_MASTER_AUTH_TOKEN") || Deno.env.get("TWILIO_AUTH_TOKEN") || "").trim();

const COUNTRY_CODE_MAP: Record<string, string> = {
  "United Kingdom": "GB",
  "United States": "US",
  Ireland: "IE",
  Germany: "DE",
  France: "FR",
  Spain: "ES",
  Italy: "IT",
  Canada: "CA",
  Australia: "AU",
  "New Zealand": "NZ",
};

function getCountryCode(country: string | undefined) {
  const normalized = String(country || "United Kingdom").trim();
  if (/^[A-Za-z]{2}$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  return COUNTRY_CODE_MAP[normalized] || "GB";
}

function buildAuthHeader(accountSid: string, authToken: string) {
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

async function twilioRequest(url: string, accountSid: string, authToken: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", buildAuthHeader(accountSid, authToken));
  headers.set("Accept", "application/json");

  return fetch(url, {
    ...init,
    headers,
  });
}

async function readTwilioResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  return payload as Record<string, any>;
}

async function createSubaccount(userId: string | number) {
  const response = await twilioRequest(
    `https://api.twilio.com/2010-04-01/Accounts.json`,
    TWILIO_MASTER_ACCOUNT_SID,
    TWILIO_MASTER_AUTH_TOKEN,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams({
        FriendlyName: `Pelican user ${userId}`,
      }),
    },
  );

  const payload = await readTwilioResponse(response);
  if (!response.ok) {
    const message = payload?.message || payload?.detail || `Twilio subaccount creation failed (${response.status})`;
    throw new Error(message);
  }

  if (!payload?.sid || !payload?.auth_token) {
    throw new Error("Twilio subaccount creation did not return credentials");
  }

  return {
    sid: String(payload.sid),
    authToken: String(payload.auth_token),
    friendlyName: String(payload.friendly_name || `Pelican user ${userId}`),
  };
}

async function findAvailableNumber(accountSid: string, authToken: string, countryCode: string) {
  const resourceTypes = ["Local", "Mobile"];

  for (const resourceType of resourceTypes) {
    const response = await twilioRequest(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/AvailablePhoneNumbers/${encodeURIComponent(countryCode)}/${resourceType}.json?SmsEnabled=true&PageSize=1`,
      accountSid,
      authToken,
    );

    const payload = await readTwilioResponse(response);
    if (!response.ok) {
      continue;
    }

    const availablePhoneNumber = payload?.available_phone_numbers?.[0]?.phone_number;
    if (availablePhoneNumber) {
      return String(availablePhoneNumber);
    }
  }

  throw new Error(`No SMS-capable Twilio numbers are available for ${countryCode}`);
}

async function purchaseNumber(accountSid: string, authToken: string, phoneNumber: string) {
  const response = await twilioRequest(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers.json`,
    accountSid,
    authToken,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams({
        PhoneNumber: phoneNumber,
      }),
    },
  );

  const payload = await readTwilioResponse(response);
  if (!response.ok) {
    const message = payload?.message || payload?.detail || `Twilio number purchase failed (${response.status})`;
    throw new Error(message);
  }

  const fromNumber = payload?.phone_number || payload?.friendly_name || phoneNumber;
  return String(fromNumber);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    if (!TWILIO_MASTER_ACCOUNT_SID || !TWILIO_MASTER_AUTH_TOKEN) {
      return jsonResponse(500, {
        error: "Twilio master credentials are not configured on the server",
      });
    }

    const body = (await req.json()) as RequestBody;
    const userId = body?.userId;
    const billingRate = Number.isFinite(Number(body?.billingRatePencePerSegment))
      ? Math.max(1, Math.round(Number(body?.billingRatePencePerSegment)))
      : 5;
    const countryCode = getCountryCode(body?.country);

    if (!userId) return jsonResponse(400, { error: "Missing userId" });

    const subaccount = await createSubaccount(userId);
    const availableNumber = await findAvailableNumber(subaccount.sid, subaccount.authToken, countryCode);
    const fromNumber = await purchaseNumber(subaccount.sid, subaccount.authToken, availableNumber);

    const { supabase } = getSupabaseAdminClient();

    const { error: connectionError } = await supabase
      .from("TwilioConnections")
      .upsert(
        {
          UserId: userId,
          AccountSid: subaccount.sid,
          AuthToken: subaccount.authToken,
          FromNumber: fromNumber,
          BillingRatePencePerSegment: billingRate,
          ConnectedAt: new Date().toISOString(),
          DisconnectedAt: null,
          LastError: null,
          UpdatedAt: new Date().toISOString(),
        },
        { onConflict: "UserId" },
      );

    if (connectionError) throw connectionError;

    const { error: walletError } = await supabase
      .from("TwilioWallets")
      .upsert(
        {
          UserId: userId,
          BalancePence: 0,
          Currency: "GBP",
          UpdatedAt: new Date().toISOString(),
        },
        { onConflict: "UserId" },
      );

    if (walletError) throw walletError;

    const { error: userError } = await supabase
      .from("Users")
      .update({
        TwilioConnected: true,
        TwilioPhoneNumber: fromNumber,
        TwilioConnectionStatus: "connected",
        TwilioLastSyncAt: new Date().toISOString(),
      })
      .eq("id", userId);

    if (userError) throw userError;

    return jsonResponse(200, {
      ok: true,
      connected: true,
      accountSid: subaccount.sid,
      accountFriendlyName: subaccount.friendlyName,
      fromNumber,
      countryCode,
      billingRatePencePerSegment: billingRate,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to provision Twilio",
    });
  }
});
