import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleCalendarAuthorizeUrl } from "@/lib/googleCalendar";

export async function GET() {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      const redirectUrl = new URL("/athlete/integrations", process.env.NEXT_PUBLIC_APP_URL!);
      redirectUrl.searchParams.set("error", "Google Calendar is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
      return NextResponse.redirect(redirectUrl);
    }

    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    return NextResponse.redirect(getGoogleCalendarAuthorizeUrl(user.id));
  } catch (error) {
    console.error("Error in Google Calendar connect:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
