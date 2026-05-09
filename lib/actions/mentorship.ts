"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function requestMentorship(coachUserId: string) {
  const supabase = await createClient();

  try {
    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Auth error:", userError);
      return { success: false, error: "Not authenticated" };
    }

    console.log("User authenticated:", user.id);

    // Check if user is an athlete
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "athlete")
      .maybeSingle();

    if (roleError) {
      console.error("Role check error:", roleError);
      return { success: false, error: "Failed to check role" };
    }

    if (!roleData) {
      console.error("User is not an athlete");
      return { success: false, error: "Only athletes can request mentorship" };
    }

    console.log("User is an athlete");

    // Check for existing link
    const { data: existingLink } = await supabase
      .from("coach_athlete_links")
      .select("id, status")
      .eq("athlete_user_id", user.id)
      .eq("coach_user_id", coachUserId)
      .maybeSingle();

    let linkId: string;

    if (existingLink) {
      // Update existing link to pending
      const { data: updatedLink, error: updateError } = await supabase
        .from("coach_athlete_links")
        .update({ status: "pending" })
        .eq("id", existingLink.id)
        .select("id")
        .single();

      if (updateError) {
        return { success: false, error: "Failed to update mentorship request" };
      }

      linkId = updatedLink.id;
    } else {
      // Create new pending link
      const { data: newLink, error: insertError } = await supabase
        .from("coach_athlete_links")
        .insert({
          athlete_user_id: user.id,
          coach_user_id: coachUserId,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError) {
        return { success: false, error: "Failed to create mentorship request" };
      }

      linkId = newLink.id;
    }

    // Get athlete profile for notification
    const { data: athleteProfile } = await supabase
      .from("athlete_profiles")
      .select("full_name, date_of_birth, tags, selected_event_id, races!athlete_profiles_selected_event_id_fkey(id, name)")
      .eq("user_id", user.id)
      .maybeSingle();

    const athleteName = athleteProfile?.full_name || "An athlete";

    // Create notification for coach
    console.log("Creating notification with:", {
      coach_id: coachUserId,
      athlete_id: user.id,
      type: "mentorship_request",
      message: `${athleteName} wants to train with you`,
      link_id: linkId,
    });

    const { data: notifData, error: notifError } = await supabase
      .from("notifications")
      .insert({
        coach_id: coachUserId,
        athlete_id: user.id,
        type: "mentorship_request",
        message: `${athleteName} wants to train with you`,
        link_id: linkId,
        read: false,
      })
      .select();

    if (notifError) {
      console.error("Failed to create notification:", notifError);
      return { success: false, error: `Failed to create notification: ${notifError.message}` };
    } else {
      console.log("Notification created successfully:", notifData);
    }

    console.log("Request mentorship completed, returning success");
    revalidatePath("/coaches/[userId]");

    return { success: true, linkId };
  } catch (error) {
    console.error("Error in requestMentorship:", error);
    return { success: false, error: "An error occurred" };
  }
}

export async function acceptMentorship(linkId: string, notificationId: string) {
  const supabase = await createClient();

  try {
    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Update link status to active
    const { error: updateLinkError } = await supabase
      .from("coach_athlete_links")
      .update({ status: "active" })
      .eq("id", linkId)
      .eq("coach_user_id", user.id);

    if (updateLinkError) {
      return { success: false, error: "Failed to accept mentorship" };
    }

    // Mark notification as read
    const { error: updateNotifError } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("user_id", user.id);

    if (updateNotifError) {
      console.error("Failed to update notification:", updateNotifError);
    }

    revalidatePath("/coach/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error in acceptMentorship:", error);
    return { success: false, error: "An error occurred" };
  }
}

export async function declineMentorship(linkId: string, notificationId: string) {
  const supabase = await createClient();

  try {
    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Update link status to declined
    const { error: updateLinkError } = await supabase
      .from("coach_athlete_links")
      .update({ status: "declined" })
      .eq("id", linkId)
      .eq("coach_user_id", user.id);

    if (updateLinkError) {
      return { success: false, error: "Failed to decline mentorship" };
    }

    // Mark notification as read
    const { error: updateNotifError } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("user_id", user.id);

    if (updateNotifError) {
      console.error("Failed to update notification:", updateNotifError);
    }

    revalidatePath("/coach/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error in declineMentorship:", error);
    return { success: false, error: "An error occurred" };
  }
}
