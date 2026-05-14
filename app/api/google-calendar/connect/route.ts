import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleCalendarAuthorizeUrl } from "@/lib/googleCalendar";

export async function GET() {
  try {
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
