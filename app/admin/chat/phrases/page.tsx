'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BannedPhrase } from '@/lib/chat/types';

export default function AdminChatPhrasesPage() {
  const [phrases, setPhrases] = useState<BannedPhrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPhrase, setNewPhrase] = useState('');
  const [newSeverity, setNewSeverity] = useState<'flag' | 'block'>('flag');
  const [adding, setAdding] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchPhrases();
  }, []);

  const fetchPhrases = async () => {
    try {
      const { data, error: err } = await supabase
        .from('chat_banned_phrases')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      setPhrases(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching phrases:', err);
      setError('Failed to load phrases');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPhrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhrase.trim()) return;

    setAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error: err } = await supabase
        .from('chat_banned_phrases')
        .insert({
          phrase: newPhrase.trim(),
          severity: newSeverity,
          created_by: user?.id,
        })
        .select()
        .single();

      if (err) throw err;
      setPhrases([data, ...phrases]);
      setNewPhrase('');
      setNewSeverity('flag');
      setError(null);
    } catch (err) {
      console.error('Error adding phrase:', err);
      setError('Failed to add phrase');
    } finally {
      setAdding(false);
    }
  };

  const handleTogglePhrase = async (id: string, isActive: boolean) => {
    try {
      const { error: err } = await supabase
        .from('chat_banned_phrases')
        .update({ is_active: !isActive })
        .eq('id', id);

      if (err) throw err;
      setPhrases(
        phrases.map((p) =>
          p.id === id ? { ...p, is_active: !isActive } : p
        )
      );
    } catch (err) {
      console.error('Error toggling phrase:', err);
      setError('Failed to update phrase');
    }
  };

  const handleDeletePhrase = async (id: string) => {
    if (!window.confirm('Delete this phrase?')) return;

    try {
      const { error: err } = await supabase
        .from('chat_banned_phrases')
        .delete()
        .eq('id', id);

      if (err) throw err;
      setPhrases(phrases.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Error deleting phrase:', err);
      setError('Failed to delete phrase');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-600">Loading phrases...</p>
      </div>
    );
  }

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-900 mb-6">Chat Moderation</h1>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">Add Banned Phrase</h2>
        <form onSubmit={handleAddPhrase} className="flex gap-2 flex-col sm:flex-row">
          <input
            type="text"
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
            placeholder="Enter phrase to ban..."
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={newSeverity}
            onChange={(e) => setNewSeverity(e.target.value as 'flag' | 'block')}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="flag">Flag (warn)</option>
            <option value="block">Block (reject)</option>
          </select>
          <button
            type="submit"
            disabled={adding || !newPhrase.trim()}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
        </form>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-6">
          <p className="text-red-900 text-sm">{error}</p>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">
            Banned Phrases ({phrases.length})
          </h2>
        </div>

        {phrases.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-zinc-600">No banned phrases yet</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200">
            {phrases.map((phrase) => (
              <div key={phrase.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm text-zinc-900 break-all">
                    {phrase.phrase}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                        phrase.severity === 'block'
                          ? 'bg-red-100 text-red-900'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {phrase.severity === 'block' ? 'Block' : 'Flag'}
                    </span>
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                        phrase.is_active
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {phrase.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="ml-4 flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleTogglePhrase(phrase.id, phrase.is_active)}
                    className="px-3 py-1 rounded text-xs font-semibold border border-zinc-300 hover:bg-zinc-50 transition-colors"
                  >
                    {phrase.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDeletePhrase(phrase.id)}
                    className="px-3 py-1 rounded text-xs font-semibold border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
