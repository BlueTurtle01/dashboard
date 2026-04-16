// =========================================================
// GET /api/funnel/results/[assessmentId]
// Returns stored results for a completed assessment.
// Used by the results page when loaded directly from a link.
// =========================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> }
) {
  const { assessmentId } = await params;

  if (!assessmentId) {
    return NextResponse.json({ error: 'Missing assessmentId.' }, { status: 400 });
  }

  const supabase = await createClient();

  // Load assessment + result + race scores
  const { data: assessment, error: assessError } = await supabase
    .from('funnel_assessments')
    .select('id, status, funnel_type')
    .eq('id', assessmentId)
    .single();

  if (assessError || !assessment) {
    return NextResponse.json({ error: 'Assessment not found.' }, { status: 404 });
  }

  if (assessment.status !== 'completed') {
    return NextResponse.json({ error: 'Assessment not yet completed.' }, { status: 400 });
  }

  const { data: resultRow, error: resultError } = await supabase
    .from('funnel_assessment_results')
    .select('*')
    .eq('assessment_id', assessmentId)
    .single();

  if (resultError || !resultRow) {
    return NextResponse.json({ error: 'Results not found.' }, { status: 404 });
  }

  // Load all race scores for this assessment with race details
  const { data: scoreRows, error: scoresError } = await supabase
    .from('funnel_assessment_race_scores')
    .select(`
      *,
      race:funnel_races(*)
    `)
    .eq('assessment_id', assessmentId)
    .order('total_score', { ascending: false });

  if (scoresError) {
    console.error('Scores fetch error:', scoresError);
    return NextResponse.json({ error: 'Failed to load scores.' }, { status: 500 });
  }

  return NextResponse.json({
    assessment_id: assessmentId,
    result_row: resultRow,
    scores: scoreRows ?? [],
  });
}
