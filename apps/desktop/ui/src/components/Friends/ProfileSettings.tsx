import { useState, useEffect } from 'react';
import { User, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { convex, getStoredSession } from '../../api/convex-client';
import { api } from '@convex/_generated/api';

const cardStyle: React.CSSProperties = {
  background: 'var(--color-bg-secondary)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4)',
  border: '1px solid var(--color-border-default)',
};

const headingStyle: React.CSSProperties = {
  color: '#deff0a',
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-wide)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-tertiary)',
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-wide)',
  marginBottom: '4px',
};

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
    const token = getStoredSession();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const profile = await convex.query(api.userProfiles.getProfile, {
        sessionToken: token,
      });
      if (profile) {
        setUsername(profile.username || '');
        setEmail(profile.email || '');
        setPhoneNumber(profile.phoneNumber || '');
        setInstagramHandle(profile.instagramHandle || '');
      }
    } catch {
      // Failed to load profile
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);

    const token = getStoredSession();
    if (!token) {
      setError('Not logged in');
      setSaving(false);
      return;
    }

    try {
      await convex.mutation(api.userProfiles.upsertProfile, {
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
      <div style={cardStyle}>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>Loading profile...</div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div className="flex items-center gap-2 mb-4">
        <User size={18} style={{ color: 'var(--color-accent-cyan)' }} />
        <h3 style={headingStyle}>Profile Settings</h3>
      </div>

      {error && (
        <div className="flex items-center gap-2 mb-4" style={{ background: 'rgba(255, 0, 51, 0.1)', border: '1px solid rgba(255, 0, 51, 0.3)', borderRadius: 'var(--radius-base)', padding: 'var(--space-3)', color: 'var(--color-status-error)', fontSize: 'var(--text-sm)' }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 mb-4" style={{ background: 'rgba(0, 255, 65, 0.1)', border: '1px solid rgba(0, 255, 65, 0.3)', borderRadius: 'var(--radius-base)', padding: 'var(--space-3)', color: 'var(--color-status-active)', fontSize: 'var(--text-sm)' }}>
          <CheckCircle size={14} />
          Profile saved!
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label style={labelStyle}>Username *</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your_username"
            required
            className="input w-full"
          />
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-disabled)', marginTop: '4px' }}>How friends will find you</p>
        </div>

        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input w-full"
          />
        </div>

        <div>
          <label style={labelStyle}>Phone Number</label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1 555-0123"
            className="input w-full"
          />
        </div>

        <div>
          <label style={labelStyle}>Instagram</label>
          <input
            type="text"
            value={instagramHandle}
            onChange={(e) => setInstagramHandle(e.target.value)}
            placeholder="@yourhandle"
            className="input w-full"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !username.trim()}
          className={`btn w-full flex items-center justify-center gap-2 ${saving || !username.trim() ? '' : 'btn-primary'}`}
          style={saving || !username.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}
