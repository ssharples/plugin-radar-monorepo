import { useState, useEffect } from 'react';
import { User, Save, CheckCircle, AlertCircle } from 'lucide-react';
import * as convexClient from '../../api/convex-client';
import { api } from '@convex/_generated/api';

export function ProfileSettings() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const token = localStorage.getItem('pluginradar_session');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const profile = await convexClient.convex.query(api.userProfiles.getProfile, {
        sessionToken: token,
      });
      if (profile) {
        setUsername(profile.username || '');
        setEmail(profile.email || '');
        setPhoneNumber(profile.phoneNumber || '');
        setInstagramHandle(profile.instagramHandle || '');
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);

    const token = localStorage.getItem('pluginradar_session');
    if (!token) {
      setError('Not logged in');
      setSaving(false);
      return;
    }

    try {
      await convexClient.convex.mutation(api.userProfiles.upsertProfile, {
        sessionToken: token,
        username: username.trim(),
        email: email.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        instagramHandle: instagramHandle.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || String(err));
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="bg-plugin-surface rounded-lg p-4 border border-plugin-border">
        <div className="text-gray-400 text-sm">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="bg-plugin-surface rounded-lg p-4 border border-plugin-border">
      <div className="flex items-center gap-2 mb-4">
        <User size={18} className="text-plugin-accent" />
        <h3 className="text-white font-mono font-medium">Profile Settings</h3>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded p-3 mb-4 text-red-400 text-sm">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded p-3 mb-4 text-green-400 text-sm">
          <CheckCircle size={14} />
          Profile saved!
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Username *</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your_username"
            required
            className="w-full bg-black/30 border border-plugin-border rounded px-3 py-2 text-white text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">How friends will find you</p>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-black/30 border border-plugin-border rounded px-3 py-2 text-white text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Phone Number</label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1 555-0123"
            className="w-full bg-black/30 border border-plugin-border rounded px-3 py-2 text-white text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Instagram</label>
          <input
            type="text"
            value={instagramHandle}
            onChange={(e) => setInstagramHandle(e.target.value)}
            placeholder="@yourhandle"
            className="w-full bg-black/30 border border-plugin-border rounded px-3 py-2 text-white text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !username.trim()}
          className={`w-full flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium ${
            saving
              ? 'bg-plugin-accent/50 text-plugin-accent cursor-wait'
              : 'bg-plugin-accent hover:bg-plugin-accent-bright text-white'
          }`}
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}
