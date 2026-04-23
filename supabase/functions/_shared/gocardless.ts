import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

export function redirectResponse(url: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      ...corsHeaders,
    },
  });
}

export function normalizeBaseUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl.trim());
    const normalizedPath = parsed.pathname && parsed.pathname !== "/"
      ? parsed.pathname.replace(/\/+$/, "")
      : "";
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return null;
  }
}

export function resolveAppBaseUrl(req: Request): string {
  const configuredBaseUrl = normalizeBaseUrl(Deno.env.get("APP_BASE_URL"));
  if (configuredBaseUrl) return configuredBaseUrl;

  const originHeader = normalizeBaseUrl(req.headers.get("origin"));
  if (originHeader) return originHeader;

  const refererHeader = normalizeBaseUrl(req.headers.get("referer"));
  if (refererHeader) return refererHeader;

  return "http://localhost:5173";
}

export function buildAppUrl(baseUrl: string, params: Record<string, string | number | null | undefined>) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function getGoCardlessEnvironment() {
  const raw = (Deno.env.get("GOCARDLESS_ENV") || "sandbox").trim().toLowerCase();
  const isLive = raw === "live" || raw === "production";

  return {
    mode: isLive ? "live" : "sandbox",
    apiBaseUrl: isLive ? "https://api.gocardless.com" : "https://api-sandbox.gocardless.com",
    connectBaseUrl: isLive ? "https://connect.gocardless.com" : "https://connect-sandbox.gocardless.com",
  } as const;
}

export function getSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get("FUNCTION_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("FUNCTION_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase configuration");
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    supabase: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "public" },
    }),
  };
}

export function getGoCardlessClientConfig() {
  const clientId = Deno.env.get("GOCARDLESS_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOCARDLESS_CLIENT_SECRET") || "";

  if (!clientId || !clientSecret) {
    throw new Error("Missing GoCardless OAuth configuration");
  }

  return { clientId, clientSecret };
}

export function getGoCardlessWebhookSecret() {
  const secret = Deno.env.get("GOCARDLESS_WEBHOOK_ENDPOINT_SECRET") || "";
  if (!secret) {
    throw new Error("Missing GOCARDLESS_WEBHOOK_ENDPOINT_SECRET");
  }
  return secret;
}

export async function gocardlessRequest(
  accessToken: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    idempotencyKey?: string;
  } = {},
) {
  const environment = getGoCardlessEnvironment();
  const url = `${environment.apiBaseUrl}${path}`;
  const method = options.method || (options.body ? "POST" : "GET");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "GoCardless-Version": "2015-07-06",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text || null;
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `GoCardless request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

export async function exchangeCodeForAccessToken(code: string, redirectUri: string) {
  const { clientId, clientSecret } = getGoCardlessClientConfig();
  const environment = getGoCardlessEnvironment();
  const response = await fetch(`${environment.connectBaseUrl}/oauth/access_token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code,
    }),
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text || null;
  }

  if (!response.ok) {
    const message = payload?.error_description || payload?.error || `Failed to exchange GoCardless code (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

export function getGoCardlessCallbackUrl() {
  const supabaseUrl = Deno.env.get("FUNCTION_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL for GoCardless callback");
  }
  return `${supabaseUrl}/functions/v1/gocardless_oauth_callback`;
}

function encodeBase64Url(input: Uint8Array) {
  const raw = btoa(String.fromCharCode(...input));
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const raw = atob(`${normalized}${padding}`);
  return new Uint8Array([...raw].map((char) => char.charCodeAt(0)));
}

async function hmacSha256Hex(secret: string, content: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(content));
  return Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSignedState(payload: Record<string, unknown>) {
  const secret = Deno.env.get("GOCARDLESS_STATE_SECRET") || Deno.env.get("GOCARDLESS_CLIENT_SECRET") || "";
  if (!secret) {
    throw new Error("Missing GoCardless state secret");
  }

  const encoder = new TextEncoder();
  const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacSha256Hex(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifySignedState<T>(rawState: string): Promise<T> {
  const secret = Deno.env.get("GOCARDLESS_STATE_SECRET") || Deno.env.get("GOCARDLESS_CLIENT_SECRET") || "";
  if (!secret) {
    throw new Error("Missing GoCardless state secret");
  }

  const [encodedPayload, signature] = rawState.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid GoCardless state");
  }

  const expected = await hmacSha256Hex(secret, encodedPayload);
  if (expected !== signature) {
    throw new Error("Invalid GoCardless state signature");
  }

  const decoder = new TextDecoder();
  const payload = JSON.parse(decoder.decode(decodeBase64Url(encodedPayload)));
  return payload as T;
}

export async function verifyWebhookSignature(body: string, signatureHeader: string, secret: string) {
  const expected = await hmacSha256Hex(secret, body);
  return expected === signatureHeader;
}

export function mapCountryToCurrency(country: string | null | undefined) {
  switch ((country || "United Kingdom").trim()) {
    case "Ireland":
    case "Germany":
    case "France":
    case "Spain":
    case "Italy":
      return "EUR";
    case "United States":
      return "USD";
    case "Canada":
      return "CAD";
    case "Australia":
      return "AUD";
    case "New Zealand":
      return "NZD";
    default:
      return "GBP";
  }
}

export function mapCountryToCountryCode(country: string | null | undefined) {
  switch ((country || "United Kingdom").trim()) {
    case "United States":
      return "US";
    case "Ireland":
      return "IE";
    case "Germany":
      return "DE";
    case "France":
      return "FR";
    case "Spain":
      return "ES";
    case "Italy":
      return "IT";
    case "Canada":
      return "CA";
    case "Australia":
      return "AU";
    case "New Zealand":
      return "NZ";
    default:
      return "GB";
  }
}

export function splitCustomerName(rawName: string | null | undefined) {
  const trimmed = (rawName || "").trim();
  if (!trimmed) {
    return { given_name: "Customer", family_name: "" };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { given_name: parts[0], family_name: "" };
  }

  return {
    given_name: parts[0],
    family_name: parts.slice(1).join(" "),
  };
}

export function toMinorUnitAmount(value: number) {
  return Math.max(0, Math.round((Number(value) || 0) * 100));
}

export async function getConnectionByUserId(userId: number | string) {
  const { supabase } = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("GoCardlessConnections")
    .select("UserId, OrganisationId, AccessToken, Environment, DisconnectedAt")
    .eq("UserId", userId)
    .is("DisconnectedAt", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function markUserGoCardlessStatus(userId: number | string, updates: Record<string, unknown>) {
  const { supabase } = getSupabaseAdminClient();
  const { error } = await supabase
    .from("Users")
    .update({
      ...updates,
      GoCardlessLastSyncAt: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) throw error;
}
