import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeGoogleCodeForToken, fetchGoogleUserInfo } from "@/lib/googleCalendar";

function integrationsRedirect(key: "success" | "error", value: string) {
  const redirectUrl = new URL("/athlete/integrations", process.env.NEXT_PUBLIC_APP_URL!);
  redirectUrl.searchParams.set(key, value);
  return NextResponse.redirect(redirectUrl);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return integrationsRedirect("error", `Google Calendar: ${searchParams.get("error_description") || error}`);
    }

    if (!code || !state) {
      return integrationsRedirect("error", "Missing code or state from Google Calendar");
    }

    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return integrationsRedirect("error", "Authentication required");
    }

    if (state !== user.id) {
      return integrationsRedirect("error", "Invalid Google Calendar state parameter");
    }

    const tokenResponse = await exchangeGoogleCodeForToken(code);

    if (!tokenResponse.refresh_token) {
      return integrationsRedirect(
        "error",
        "Google did not return a refresh token. Disconnect and reconnect Google Calendar, then approve offline access.",
      );
    }

    const profile = await fetchGoogleUserInfo(tokenResponse.access_token);
    const scopes = tokenResponse.scope?.split(" ") ?? [];

    const { error: upsertError } = await supabase
      .from("athlete_integrations")
      .upsert(
        {
          user_id: user.id,
          provider: "google_calendar",
          provider_athlete_id: null,
          provider_account_id: profile.id,
          provider_username: profile.email,
          provider_firstname: profile.given_name ?? profile.name ?? null,
          provider_lastname: profile.family_name ?? null,
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          expires_at: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString(),
          scopes,
          is_active: true,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" },
      );

    if (upsertError) {
      console.error("Error storing Google Calendar integration:", upsertError);
      return integrationsRedirect("error", "Failed to store Google Calendar integration");
    }

    return integrationsRedirect("success", "Google Calendar connected successfully");
  } catch (error) {
    console.error("Error in Google Calendar callback:", error);
    return integrationsRedirect("error", "Failed to connect Google Calendar");
  }
}
