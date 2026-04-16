// =========================================================
// POST /api/funnel/complete
// Accepts the full assessment submission:
//   1. Creates the lead record
//   2. Creates the assessment record
//   3. Saves all answers
//   4. Builds the derived profile
//   5. Scores all active races
//   6. Generates explanations
//   7. Selects recommendations
//   8. Persists everything to DB
//   9. Returns assessment_id + full result
// =========================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildDerivedProfile } from '@/lib/funnel/profileBuilder';
import { scoreAllRaces } from '@/lib/funnel/scoringEngine';
import { selectRecommendations } from '@/lib/funnel/recommendationSelector';
import { generateExplanations } from '@/lib/funnel/explanationGenerator';
import type {
  AssessmentAnswers,
  FunnelRace,
  FunnelSubmitPayload,
} from '@/lib/funnel/types';

export async function POST(req: NextRequest) {
  try {
    const body: FunnelSubmitPayload = await req.json();
    const { answers, utm_source, utm_medium, utm_campaign, utm_content, utm_term } = body;

    // Basic validation
    if (!answers.email || !answers.first_name) {
      return NextResponse.json(
        { error: 'first_name and email are required.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // --------------------------------------------------
    // 1. Create lead
    // --------------------------------------------------
    const { data: lead, error: leadError } = await supabase
      .from('funnel_leads')
      .insert({
        first_name: answers.first_name,
        email: answers.email.toLowerCase().trim(),
        country_of_residence: answers.country_of_residence ?? null,
        source_funnel: 'feeder_race_matcher',
        utm_source: utm_source ?? null,
        utm_medium: utm_medium ?? null,
        utm_campaign: utm_campaign ?? null,
        utm_content: utm_content ?? null,
        utm_term: utm_term ?? null,
        consent_marketing: answers.consent_marketing ?? false,
        consent_privacy: true,
      })
      .select('id')
      .single();

    if (leadError) {
      console.error('Lead insert error:', leadError);
      return NextResponse.json({ error: 'Failed to save lead.' }, { status: 500 });
    }

    // --------------------------------------------------
    // 2. Create assessment
    // --------------------------------------------------
    const { data: assessment, error: assessError } = await supabase
      .from('funnel_assessments')
      .insert({
        lead_id: lead.id,
        funnel_type: 'feeder_race_matcher',
        funnel_version: '1.0',
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (assessError) {
      console.error('Assessment insert error:', assessError);
      return NextResponse.json({ error: 'Failed to create assessment.' }, { status: 500 });
    }

    const assessmentId = assessment.id;

    // --------------------------------------------------
    // 3. Save all answers
    // --------------------------------------------------
    const answerRows = Object.entries(answers)
      .filter(([key]) => !['first_name', 'email', 'country_of_residence', 'consent_marketing', 'consent_privacy'].includes(key))
      .map(([key, value]) => {
        const row: Record<string, unknown> = {
          assessment_id: assessmentId,
          question_key: key,
          answer_json: null,
          answer_text: null,
          answer_number: null,
        };

        if (Array.isArray(value)) {
          row.answer_json = value;
        } else if (typeof value === 'number') {
          row.answer_number = value;
        } else if (typeof value === 'boolean') {
          row.answer_text = value ? 'true' : 'false';
        } else if (value !== null && value !== undefined) {
          row.answer_text = String(value);
        }

        return row;
      });

    if (answerRows.length > 0) {
      const { error: answersError } = await supabase
        .from('funnel_assessment_answers')
        .insert(answerRows);

      if (answersError) {
        console.error('Answers insert error:', answersError);
        // Non-fatal — continue
      }
    }

    // --------------------------------------------------
    // 4. Build derived profile
    // --------------------------------------------------
    const profile = buildDerivedProfile(answers as AssessmentAnswers);

    // Persist profile
    await supabase.from('funnel_assessment_profiles').insert({
      assessment_id: assessmentId,
      profile_json: profile,
      endurance_level: profile.endurance_level,
      terrain_readiness_level: profile.terrain_readiness_level,
      stage_race_readiness_level: profile.stage_race_readiness_level,
      pack_readiness_level: profile.pack_readiness_level,
      heat_readiness_level: profile.heat_readiness_level,
      budget_band: profile.budget_band,
      travel_willingness_level: profile.travel_willingness_level,
      life_constraint_level: profile.life_constraint_level,
      risk_appetite_level: profile.risk_appetite_level,
      mds_goal_timeline: profile.mds_goal_timeline,
      has_marathon: profile.has_marathon,
      has_trail_marathon: profile.has_trail_marathon,
      has_ultra: profile.has_ultra,
      has_multi_stage: profile.has_multi_stage,
      has_pack_experience: profile.has_pack_experience,
      can_train_4_plus_days: profile.can_train_4_plus_days,
      can_do_back_to_back: profile.can_do_back_to_back,
      willing_heat_training: profile.willing_heat_training,
      prefers_lower_risk: profile.prefers_lower_risk,
      prefers_stage_race: profile.prefers_stage_race,
      wants_desert_specificity: profile.wants_desert_specificity,
    });

    // --------------------------------------------------
    // 5. Load active races from DB
    // --------------------------------------------------
    const { data: races, error: racesError } = await supabase
      .from('funnel_races')
      .select('*')
      .eq('is_active', true);

    if (racesError || !races || races.length === 0) {
      console.error('Races fetch error:', racesError);
      return NextResponse.json({ error: 'Failed to load race data.' }, { status: 500 });
    }

    // --------------------------------------------------
    // 6. Score all races
    // --------------------------------------------------
    const scores = scoreAllRaces(races as FunnelRace[], profile);

    // --------------------------------------------------
    // 7. Generate explanations
    // --------------------------------------------------
    generateExplanations(scores, profile);

    // --------------------------------------------------
    // 8. Select recommendations
    // --------------------------------------------------
    const result = selectRecommendations(scores, profile);

    // --------------------------------------------------
    // 9. Persist race scores
    // --------------------------------------------------
    const scoreRows = scores.map((s) => ({
      assessment_id: assessmentId,
      race_id: s.race.id,
      is_hard_filtered: s.is_hard_filtered,
      hard_filter_reasons_json: s.hard_filter_reasons.length > 0 ? s.hard_filter_reasons : null,
      endurance_fit_score: s.endurance_fit_score,
      terrain_fit_score: s.terrain_fit_score,
      stage_fit_score: s.stage_fit_score,
      pack_fit_score: s.pack_fit_score,
      heat_fit_score: s.heat_fit_score,
      budget_fit_score: s.budget_fit_score,
      travel_fit_score: s.travel_fit_score,
      life_fit_score: s.life_fit_score,
      risk_fit_score: s.risk_fit_score,
      mds_progression_fit_score: s.mds_progression_fit_score,
      total_score: s.total_score,
      explanation_json: s.explanation,
    }));

    await supabase.from('funnel_assessment_race_scores').insert(scoreRows);

    // --------------------------------------------------
    // 10. Persist final result
    // --------------------------------------------------
    await supabase.from('funnel_assessment_results').insert({
      assessment_id: assessmentId,
      primary_race_id: result.primary_race.race.id,
      alternative_race_ids_json: result.alternatives.map((a) => a.race.id),
      lower_risk_race_id: result.lower_risk_race?.race.id ?? null,
      stretch_race_id: result.stretch_race?.race.id ?? null,
      summary_json: result.summary,
      main_gaps_json: result.main_gaps,
    });

    // --------------------------------------------------
    // 11. Return to client
    // --------------------------------------------------
    return NextResponse.json({
      assessment_id: assessmentId,
      result,
    });
  } catch (err) {
    console.error('Funnel complete error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
