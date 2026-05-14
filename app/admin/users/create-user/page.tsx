'use client';

import { useEffect, useState } from 'react';

interface User {
  id: string;
  email: string;
  fullName: string | null;
  roles: string[];
  createdAt: string;
}

const AVAILABLE_ROLES = ['coach', 'athlete', 'admin', 'creator'];

export default function CreateUserPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['athlete']);
  const [creating, setCreating] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRoles, setEditingRoles] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users/create');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data.users || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pwd);
  };

  const handleToggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || selectedRoles.length === 0) return;

    setCreating(true);
    try {
      const response = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          roles: selectedRoles,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create user');
      }

      setEmail('');
      setPassword('');
      setSelectedRoles(['athlete']);
      await fetchUsers();
      setError(null);
    } catch (err) {
      console.error('Error creating user:', err);
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const startEditingRoles = (user: User) => {
    setEditingUserId(user.id);
    setEditingRoles([...user.roles]);
  };

  const handleToggleEditRole = (role: string) => {
    setEditingRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleUpdateRoles = async () => {
    if (!editingUserId || editingRoles.length === 0) return;

    setUpdating(true);
    try {
      const response = await fetch('/api/admin/users/create', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUserId,
          roles: editingRoles,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update roles');
      }

      setEditingUserId(null);
      setEditingRoles([]);
      await fetchUsers();
    } catch (err) {
      console.error('Error updating roles:', err);
      setError(err instanceof Error ? err.message : 'Failed to update roles');
    } finally {
      setUpdating(false);
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
      <h1 className="text-2xl font-bold text-zinc-900 mb-6">Create Users & Assign Roles</h1>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-6">
          <p className="text-red-900 text-sm">{error}</p>
        </div>
      )}

      {/* Create User Form */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">Create New User</h2>
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-900 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="athlete@example.com"
                className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900 mb-1">
                Password
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter or generate..."
                  className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={generatePassword}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-900 mb-2">
              Roles
            </label>
            <div className="flex flex-wrap gap-3">
              {AVAILABLE_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role)}
                    onChange={() => handleToggleRole(role)}
                    className="rounded border-zinc-300"
                  />
                  <span className="text-sm text-zinc-900 capitalize">{role}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={creating || !email || !password || selectedRoles.length === 0}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating...' : 'Create User'}
          </button>
        </form>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">
            All Users ({users.length})
          </h2>
        </div>

        {users.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-zinc-600">No users yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                    Roles
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
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 text-sm text-zinc-900 font-mono">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-900">
                      {user.fullName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {editingUserId === user.id ? (
                        <div className="flex flex-wrap gap-2">
                          {AVAILABLE_ROLES.map((role) => (
                            <label
                              key={role}
                              className="flex items-center gap-1 text-xs cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={editingRoles.includes(role)}
                                onChange={() => handleToggleEditRole(role)}
                                className="rounded border-zinc-300"
                              />
                              <span className="capitalize">{role}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {user.roles.map((role) => (
                            <span
                              key={role}
                              className="inline-block px-2 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-900 capitalize"
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-600">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {editingUserId === user.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={handleUpdateRoles}
                            disabled={updating}
                            className="text-emerald-600 hover:text-emerald-700 font-semibold disabled:opacity-50"
                          >
                            {updating ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingUserId(null)}
                            className="text-zinc-600 hover:text-zinc-700 font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditingRoles(user)}
                          className="text-indigo-600 hover:text-indigo-700 font-semibold"
                        >
                          Edit Roles
                        </button>
                      )}
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
        <p className="text-sm text-blue-900 mb-2">
          <strong>Quick Testing Setup:</strong>
        </p>
        <ul className="text-sm text-blue-900 list-disc list-inside space-y-1">
          <li>Create a coach user (email: coach@test.com, role: coach)</li>
          <li>Create an athlete user (email: athlete@test.com, role: athlete)</li>
          <li>Go to Admin → Config → Coach-Athlete Links and link them</li>
          <li>Now they can message each other in the chat system!</li>
        </ul>
      </div>
    </main>
  );
}
