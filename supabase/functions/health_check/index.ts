// Supabase Edge Function: health_check
// Simple CORS-enabled health check for client connectivity.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true, timestamp: new Date().toISOString() }), {
    status: 200,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
});
