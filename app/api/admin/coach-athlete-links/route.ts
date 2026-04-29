import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  return !!data;
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !(await isAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get all links
    const { data: links, error: linksError } = await supabase
      .from('coach_athlete_links')
      .select('*')
      .order('created_at', { ascending: false });

    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 500 });
    }

    // Use admin client to get all auth users — this is the source of truth,
    // not user_roles which may be missing entries
    const adminClient = createAdminClient();
    const { data: { users: allAuthUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });

    const emailMap: Record<string, string> = {};
    allAuthUsers.forEach(u => { if (u.email) emailMap[u.id] = u.email; });

    // Get coaches from user_roles (still gated by role assignment)
    const { data: coachUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'coach');

    const coachIds = coachUsers?.map(u => u.user_id) || [];

    // Get profiles for coaches
    const { data: coachProfiles } = coachIds.length
      ? await supabase.from('athlete_profiles').select('user_id, full_name').in('user_id', coachIds)
      : { data: [] };

    // All athletes = union of:
    //   1. users with role='athlete' in user_roles
    //   2. users with an athlete_profiles row
    //   3. athlete_user_ids referenced in existing links
    const { data: athleteRoleUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'athlete');

    const { data: allAthleteProfiles } = await supabase
      .from('athlete_profiles')
      .select('user_id, full_name');

    const profileMap: Record<string, string | null> = {};
    (allAthleteProfiles || []).forEach(p => { profileMap[p.user_id] = p.full_name; });

    const linkedAthleteIds = (links || []).map(l => l.athlete_user_id);
    const allAthleteIds = Array.from(new Set([
      ...(athleteRoleUsers || []).map(u => u.user_id),
      ...(allAthleteProfiles || []).map(p => p.user_id),
      ...linkedAthleteIds,
    ]));

    const athletesWithEmail = allAthleteIds.map(id => ({
      user_id: id,
      full_name: profileMap[id] ?? null,
      email: emailMap[id] ?? null,
    }));

    return NextResponse.json({
      links: links || [],
      coaches: coachProfiles || [],
      athletes: athletesWithEmail,
      emailMap,
    });
  } catch (error) {
    console.error('Error fetching links:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !(await isAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { coachUserId, athleteUserId, status } = await req.json();

    if (!coachUserId || !athleteUserId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if link already exists
    const { data: existing } = await supabase
      .from('coach_athlete_links')
      .select('id')
      .eq('coach_user_id', coachUserId)
      .eq('athlete_user_id', athleteUserId)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('coach_athlete_links')
        .update({ status })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data, { status: 200 });
    }

    // Create new
    const { data, error } = await supabase
      .from('coach_athlete_links')
      .insert({
        coach_user_id: coachUserId,
        athlete_user_id: athleteUserId,
        status,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !(await isAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const linkId = searchParams.get('id');

    if (!linkId) {
      return NextResponse.json({ error: 'Link ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('coach_athlete_links')
      .delete()
      .eq('id', linkId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
