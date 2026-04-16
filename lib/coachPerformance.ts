import { SupabaseClient } from "@supabase/supabase-js";

interface FeedbackRow {
  athlete_user_id: string;
  submitted_at: string;
  coach_reviewed_at: string | null;
  plan_released_at: string | null;
  overall_feeling: number | null;
  plan_clarity: number | null;
}

export async function recalculateCoachScore(
  coachUserId: string,
  supabase: SupabaseClient
): Promise<void> {
  // Fetch all feedback rows for this coach's athletes
  const { data: athleteLinks, error: linksError } = await supabase
    .from("coach_athlete_links")
    .select("athlete_user_id")
    .eq("coach_user_id", coachUserId)
    .eq("status", "active");

  if (linksError || !athleteLinks) {
    console.error("Failed to fetch athlete links:", linksError);
    return;
  }

  const athleteIds = athleteLinks.map((link) => link.athlete_user_id);

  if (athleteIds.length === 0) {
    // No athletes, set score to tier 1 defaults
    await supabase
      .from("coach_performance_scores")
      .upsert({
        coach_user_id: coachUserId,
        avg_review_hours: null,
        avg_delivery_hours: null,
        avg_satisfaction_score: null,
        avg_clarity_score: null,
        athlete_retention_rate: 0,
        tier: 1,
        calculated_at: new Date().toISOString(),
      });
    return;
  }

  // Fetch all feedback for these athletes
  const { data: feedback, error: feedbackError } = await supabase
    .from("athlete_feedback")
    .select("*")
    .in("athlete_user_id", athleteIds);

  if (feedbackError || !feedback) {
    console.error("Failed to fetch feedback:", feedbackError);
    return;
  }

  // Compute metrics
  let totalReviewHours = 0;
  let reviewedCount = 0;
  let totalDeliveryHours = 0;
  let deliveredCount = 0;
  let totalSatisfaction = 0;
  let totalClarity = 0;
  let satisfactionCount = 0;
  let clarityCount = 0;
  const athleteMonthCounts = new Map<string, number>();

  feedback.forEach((row: FeedbackRow) => {
    // Track how many months of feedback each athlete has (for retention)
    const currentCount = athleteMonthCounts.get(row.athlete_user_id) || 0;
    athleteMonthCounts.set(row.athlete_user_id, currentCount + 1);

    // Review hours: submitted_at to coach_reviewed_at
    if (row.coach_reviewed_at) {
      const submitted = new Date(row.submitted_at).getTime();
      const reviewed = new Date(row.coach_reviewed_at).getTime();
      const hours = (reviewed - submitted) / (1000 * 60 * 60);
      totalReviewHours += hours;
      reviewedCount++;
    }

    // Delivery hours: submitted_at to plan_released_at
    if (row.plan_released_at) {
      const submitted = new Date(row.submitted_at).getTime();
      const released = new Date(row.plan_released_at).getTime();
      const hours = (released - submitted) / (1000 * 60 * 60);
      totalDeliveryHours += hours;
      deliveredCount++;
    }

    // Satisfaction score
    if (row.overall_feeling !== null) {
      totalSatisfaction += row.overall_feeling;
      satisfactionCount++;
    }

    // Clarity score
    if (row.plan_clarity !== null) {
      totalClarity += row.plan_clarity;
      clarityCount++;
    }
  });

  // Compute averages
  const avgReviewHours =
    reviewedCount > 0 ? totalReviewHours / reviewedCount : null;
  const avgDeliveryHours =
    deliveredCount > 0 ? totalDeliveryHours / deliveredCount : null;
  const avgSatisfactionScore =
    satisfactionCount > 0 ? totalSatisfaction / satisfactionCount : null;
  const avgClarityScore =
    clarityCount > 0 ? totalClarity / clarityCount : null;

  // Retention: athletes with 2+ months of feedback
  const retainedAthletes = Array.from(athleteMonthCounts.values()).filter(
    (count) => count >= 2
  ).length;
  const retentionRate =
    athleteIds.length > 0 ? (retainedAthletes / athleteIds.length) * 100 : 0;

  // Determine tier
  let tier = 1;
  if (
    avgDeliveryHours !== null &&
    avgDeliveryHours < 24 &&
    avgSatisfactionScore !== null &&
    avgSatisfactionScore > 8.5 &&
    retentionRate > 85
  ) {
    tier = 3;
  } else if (
    avgDeliveryHours !== null &&
    avgDeliveryHours < 48 &&
    avgSatisfactionScore !== null &&
    avgSatisfactionScore > 7.5 &&
    retentionRate > 70
  ) {
    tier = 2;
  }

  // Upsert the score
  const { error: upsertError } = await supabase
    .from("coach_performance_scores")
    .upsert({
      coach_user_id: coachUserId,
      avg_review_hours: avgReviewHours,
      avg_delivery_hours: avgDeliveryHours,
      avg_satisfaction_score: avgSatisfactionScore,
      avg_clarity_score: avgClarityScore,
      athlete_retention_rate: retentionRate,
      tier,
      calculated_at: new Date().toISOString(),
    });

  if (upsertError) {
    console.error("Failed to upsert coach score:", upsertError);
  }
}
