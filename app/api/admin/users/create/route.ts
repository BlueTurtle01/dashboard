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

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !(await isAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { email, password, roles } = await req.json();

    if (!email || !password || !roles || roles.length === 0) {
      return NextResponse.json(
        { error: 'Email, password, and at least one role required' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Create user in auth
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      console.error('Auth creation error:', authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const newUserId = authUser.user.id;

    // Create user roles
    const roleInserts = roles.map((role: string) => ({
      user_id: newUserId,
      role,
    }));

    const { error: rolesError } = await supabase
      .from('user_roles')
      .insert(roleInserts);

    if (rolesError) {
      console.error('Roles creation error:', rolesError);
      return NextResponse.json({ error: rolesError.message }, { status: 500 });
    }

    // Create athlete profile if athlete role
    if (roles.includes('athlete')) {
      await supabase.from('athlete_profiles').insert({
        user_id: newUserId,
        full_name: email.split('@')[0],
      });
    }

    // Grant default features based on roles
    const featuresToGrant = [];
    if (roles.includes('coach') || roles.includes('athlete')) {
      featuresToGrant.push({ user_id: newUserId, feature: 'race_info' });
    }

    if (featuresToGrant.length > 0) {
      const { error: featuresError } = await supabase
        .from('user_features')
        .insert(featuresToGrant);

      if (featuresError) {
        console.error('Features creation error:', featuresError);
        // Don't fail the whole request if features fail, but log it
      }
    }

    return NextResponse.json({
      user: {
        id: newUserId,
        email: authUser.user.email,
        roles,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !(await isAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get all users with their roles
    const { data: allRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .order('user_id');

    if (rolesError) {
      return NextResponse.json({ error: rolesError.message }, { status: 500 });
    }

    // Get user emails from auth - this requires admin context
    const adminClient = createAdminClient();
    const { data: { users: authUsers }, error: authError } = await adminClient.auth.admin.listUsers();

    if (authError) {
      console.error('Error fetching auth users:', authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    // Get athlete profiles for names
    const { data: profiles } = await supabase
      .from('athlete_profiles')
      .select('user_id, full_name');

    // Combine data
    const usersMap = new Map();
    authUsers?.forEach((authUser: any) => {
      usersMap.set(authUser.id, {
        id: authUser.id,
        email: authUser.email,
        createdAt: authUser.created_at,
        roles: [],
        fullName: null,
      });
    });

    allRoles?.forEach((roleAssignment: any) => {
      const user = usersMap.get(roleAssignment.user_id);
      if (user) {
        user.roles.push(roleAssignment.role);
      }
    });

    profiles?.forEach((profile: any) => {
      const user = usersMap.get(profile.user_id);
      if (user) {
        user.fullName = profile.full_name;
      }
    });

    return NextResponse.json({
      users: Array.from(usersMap.values()),
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !(await isAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId, roles } = await req.json();

    if (!userId || !roles || roles.length === 0) {
      return NextResponse.json(
        { error: 'User ID and at least one role required' },
        { status: 400 }
      );
    }

    // Delete existing roles
    const { error: deleteError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Insert new roles
    const roleInserts = roles.map((role: string) => ({
      user_id: userId,
      role,
    }));

    const { error: insertError } = await supabase
      .from('user_roles')
      .insert(roleInserts);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating roles:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
