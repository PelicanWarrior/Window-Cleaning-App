import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("FUNCTION_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("FUNCTION_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase configuration" });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return jsonResponse(401, { error: "Missing authorization token" });
  }

  try {
    const body = await req.json();
    const ownerUserId = Number(body?.ownerUserId || 0);
    const username = String(body?.username || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "").trim();

    if (!ownerUserId || !username || !email || !password) {
      return jsonResponse(400, { error: "ownerUserId, username, email, and password are required" });
    }

    if (password.length < 8) {
      return jsonResponse(400, { error: "Password must be at least 8 characters" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "public" },
    });

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      db: { schema: "public" },
    });

    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData?.user?.email) {
      return jsonResponse(401, { error: "Invalid auth token" });
    }

    const requestorEmail = authData.user.email.trim().toLowerCase();

    const { data: ownerUser, error: ownerError } = await adminClient
      .from("Users")
      .select("id, UserName, email_address, ParentUserId, CompanyName, AccountLevel, RouteWeeks, CustomerSort")
      .eq("id", ownerUserId)
      .single();

    if (ownerError || !ownerUser) {
      return jsonResponse(404, { error: "Owner user not found" });
    }

    if (ownerUser.ParentUserId) {
      return jsonResponse(403, { error: "Only owner accounts can create team members" });
    }

    const ownerEmail = String(ownerUser.email_address || "").trim().toLowerCase();
    if (!ownerEmail || ownerEmail !== requestorEmail) {
      return jsonResponse(403, { error: "Only the owner can create team members" });
    }

    const { data: existingUsername } = await adminClient
      .from("Users")
      .select("id")
      .eq("UserName", username)
      .maybeSingle();

    if (existingUsername?.id) {
      return jsonResponse(409, { error: "Username already exists" });
    }

    const { data: existingEmail } = await adminClient
      .from("Users")
      .select("id")
      .ilike("email_address", email)
      .maybeSingle();

    if (existingEmail?.id) {
      return jsonResponse(409, { error: "Email is already in use" });
    }

    const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        parent_user_id: ownerUserId,
        team_role: "cleaner",
      },
    });

    if (createAuthError || !createdAuth?.user?.id) {
      return jsonResponse(500, { error: createAuthError?.message || "Unable to create auth user" });
    }

    const { data: insertedUser, error: insertError } = await adminClient
      .from("Users")
      .insert({
        UserName: username,
        email_address: email,
        admin: false,
        ParentUserId: ownerUserId,
        TeamRole: "cleaner",
        CompanyName: ownerUser.CompanyName || "",
        AccountLevel: ownerUser.AccountLevel || 1,
        RouteWeeks: ownerUser.RouteWeeks || 4,
        CustomerSort: ownerUser.CustomerSort || "Route",
      })
      .select("id, UserName, email_address, ParentUserId, TeamRole")
      .single();

    if (insertError || !insertedUser) {
      await adminClient.auth.admin.deleteUser(createdAuth.user.id);
      return jsonResponse(500, { error: insertError?.message || "Unable to create team member profile" });
    }

    return jsonResponse(200, { ok: true, member: insertedUser });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error"
    return jsonResponse(500, { error: message });
  }
});
