'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Coach {
  user_id: string;
  full_name: string | null;
}

interface Athlete {
  user_id: string;
  full_name: string | null;
  email?: string | null;
}

interface Link {
  id: string;
  coach_user_id: string;
  athlete_user_id: string;
  status: 'pending' | 'active' | 'declined';
  created_at: string;
}

interface LinkWithNames extends Link {
  coachName?: string;
  athleteName?: string;
  athleteEmail?: string;
}

export default function CoachAthleteLinksPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [links, setLinks] = useState<LinkWithNames[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoach, setSelectedCoach] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'active' | 'pending' | 'declined'>('active');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/admin/coach-athlete-links');
      if (!response.ok) throw new Error('Failed to fetch data');
      const data = await response.json();

      setCoaches(data.coaches || []);
      setAthletes(data.athletes || []);

      const linksWithNames = (data.links || []).map((link: Link) => {
        const athlete = data.athletes.find((a: Athlete) => a.user_id === link.athlete_user_id);
        return {
          ...link,
          coachName: data.coaches.find((c: Coach) => c.user_id === link.coach_user_id)?.full_name,
          athleteName: athlete?.full_name,
          athleteEmail: athlete?.email ?? data.emailMap?.[link.athlete_user_id] ?? null,
        };
      });

      setLinks(linksWithNames);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCoach || !selectedAthlete) return;

    setCreating(true);
    try {
      const response = await fetch('/api/admin/coach-athlete-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachUserId: selectedCoach,
          athleteUserId: selectedAthlete,
          status: selectedStatus,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create link');
      }

      setSelectedCoach('');
      setSelectedAthlete('');
      setSelectedStatus('active');
      await fetchData();
      setError(null);
    } catch (err) {
      console.error('Error creating link:', err);
      setError(err instanceof Error ? err.message : 'Failed to create link');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!window.confirm('Delete this link?')) return;

    setDeleting(linkId);
    try {
      const response = await fetch(`/api/admin/coach-athlete-links?id=${linkId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete link');
      await fetchData();
    } catch (err) {
      console.error('Error deleting link:', err);
      setError('Failed to delete link');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-600">Loading...</p>
      </div>
    );
  }

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-900 mb-6">Coach-Athlete Links</h1>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-6">
          <p className="text-red-900 text-sm">{error}</p>
        </div>
      )}

      {/* Create Link Form */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">Create New Link</h2>
        <form onSubmit={handleCreateLink} className="flex gap-3 flex-col sm:flex-row">
          <select
            value={selectedCoach}
            onChange={(e) => setSelectedCoach(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Select coach...</option>
            {coaches.map((coach) => (
              <option key={coach.user_id} value={coach.user_id}>
                {coach.full_name || coach.user_id}
              </option>
            ))}
          </select>

          <select
            value={selectedAthlete}
            onChange={(e) => setSelectedAthlete(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Select athlete...</option>
            {athletes.map((athlete) => (
              <option key={athlete.user_id} value={athlete.user_id}>
                {athlete.full_name || athlete.user_id}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="declined">Declined</option>
          </select>

          <button
            type="submit"
            disabled={creating || !selectedCoach || !selectedAthlete}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {creating ? 'Creating...' : 'Create Link'}
          </button>
        </form>
      </div>

      {/* Links Table */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">
            Existing Links ({links.length})
          </h2>
        </div>

        {links.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-zinc-600">No coach-athlete links yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                    Coach
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                    Athlete
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                    Athlete Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {links.map((link) => (
                  <tr key={link.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 text-sm text-zinc-900">
                      {link.coachName || link.coach_user_id}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-900">
                      {link.athleteName || link.athlete_user_id}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-500">
                      {link.athleteEmail || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          link.status === 'active'
                            ? 'bg-emerald-100 text-emerald-900'
                            : link.status === 'pending'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-red-100 text-red-900'
                        }`}
                      >
                        {link.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-600">
                      {new Date(link.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => handleDeleteLink(link.id)}
                        disabled={deleting === link.id}
                        className="text-red-600 hover:text-red-700 font-semibold disabled:opacity-50"
                      >
                        {deleting === link.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-6 rounded-lg bg-blue-50 border border-blue-200 p-4">
        <p className="text-sm text-blue-900">
          <strong>Tip:</strong> Use this page to quickly set up coach-athlete relationships for testing
          the chat system. Creating a link with status "active" allows that coach and athlete to message each other.
        </p>
      </div>
    </main>
  );
}
