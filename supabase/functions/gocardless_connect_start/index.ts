import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  buildAppUrl,
  corsHeaders,
  createSignedState,
  getGoCardlessCallbackUrl,
  getGoCardlessClientConfig,
  getGoCardlessEnvironment,
  getSupabaseAdminClient,
  jsonResponse,
  mapCountryToCountryCode,
  resolveAppBaseUrl,
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
    if (!userId) {
      return jsonResponse(400, { error: "Missing userId" });
    }

    const { supabase } = getSupabaseAdminClient();
    const { data: user, error: userError } = await supabase
      .from("Users")
      .select("id, UserName, CompanyName, email_address, SettingsCountry")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return jsonResponse(404, { error: "User not found" });
    }

    const { clientId } = getGoCardlessClientConfig();
    const environment = getGoCardlessEnvironment();
    const appBaseUrl = resolveAppBaseUrl(req);
    const callbackUrl = getGoCardlessCallbackUrl();

    const state = await createSignedState({
      userId: user.id,
      appBaseUrl,
      createdAt: Date.now(),
    });

    const url = new URL(`${environment.connectBaseUrl}/oauth/authorize`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("scope", "read_write");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("initial_view", "signup");
    url.searchParams.set("state", state);
    if (user.email_address) url.searchParams.set("prefill[email]", user.email_address);
    if (user.UserName) url.searchParams.set("prefill[given_name]", user.UserName);
    if (user.CompanyName) url.searchParams.set("prefill[organisation_name]", user.CompanyName);
    url.searchParams.set("prefill[country_code]", mapCountryToCountryCode(user.SettingsCountry));

    return jsonResponse(200, {
      url: buildAppUrl(url.toString(), {}),
      mode: environment.mode,
    });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : "Unable to start GoCardless connection" });
  }
});
