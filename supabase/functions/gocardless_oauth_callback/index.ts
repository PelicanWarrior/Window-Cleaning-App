import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  buildAppUrl,
  exchangeCodeForAccessToken,
  getGoCardlessCallbackUrl,
  getGoCardlessEnvironment,
  getSupabaseAdminClient,
  markUserGoCardlessStatus,
  redirectResponse,
  verifySignedState,
} from "../_shared/gocardless.ts";

type CallbackState = {
  userId: number | string;
  appBaseUrl: string;
  createdAt: number;
};

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const fallbackBaseUrl = "http://localhost:5173";

  try {
    if (!state) {
      throw new Error("Missing GoCardless OAuth state");
    }

    const parsedState = await verifySignedState<CallbackState>(state);
    const appBaseUrl = parsedState?.appBaseUrl || fallbackBaseUrl;

    if (!parsedState?.userId) {
      throw new Error("Missing GoCardless OAuth user context");
    }

    if (!parsedState?.createdAt || Date.now() - Number(parsedState.createdAt) > 1000 * 60 * 60) {
      throw new Error("GoCardless OAuth state expired");
    }

    if (error) {
      const redirectUrl = buildAppUrl(appBaseUrl, {
        gocardless: "connect_error",
        message: errorDescription || error,
      });
      return redirectResponse(redirectUrl);
    }

    if (!code) {
      throw new Error("Missing GoCardless OAuth code");
    }

    const callbackUrl = getGoCardlessCallbackUrl();
    const tokenPayload = await exchangeCodeForAccessToken(code, callbackUrl);
    const accessToken = tokenPayload?.access_token;
    const organisationId = tokenPayload?.organisation_id;

    if (!accessToken || !organisationId) {
      throw new Error("GoCardless OAuth response did not include access token and organisation id");
    }

    const { supabase } = getSupabaseAdminClient();
    const environment = getGoCardlessEnvironment();
    const timestamp = new Date().toISOString();

    const { error: connectionError } = await supabase
      .from("GoCardlessConnections")
      .upsert({
        UserId: parsedState.userId,
        OrganisationId: organisationId,
        AccessToken: accessToken,
        Environment: environment.mode,
        ConnectedAt: timestamp,
        DisconnectedAt: null,
        UpdatedAt: timestamp,
        LastError: null,
      }, {
        onConflict: "UserId",
      });

    if (connectionError) throw connectionError;

    await markUserGoCardlessStatus(parsedState.userId, {
      GoCardlessConnected: true,
      GoCardlessOrganisationId: organisationId,
      GoCardlessConnectionStatus: "connected",
    });

    return redirectResponse(buildAppUrl(appBaseUrl, {
      gocardless: "connected",
    }));
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : "Failed to connect GoCardless";
    return redirectResponse(buildAppUrl(fallbackBaseUrl, {
      gocardless: "connect_error",
      message,
    }));
  }
});
