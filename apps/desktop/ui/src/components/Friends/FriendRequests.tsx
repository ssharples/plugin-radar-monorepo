import { useState, useEffect } from 'react';
import { Bell, Check, X, RefreshCw } from 'lucide-react';
import * as convexClient from '../../api/convex-client';
import { api } from '@convex/_generated/api';

interface PendingRequest {
  requestId: string;
  fromUserId: string;
  username: string;
  sentAt: number;
}

export function FriendRequests() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    const token = localStorage.getItem('pluginradar_session');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await convexClient.convex.query(api.friends.getPendingRequests, {
        sessionToken: token,
      });
      setRequests(res as PendingRequest[]);
    } catch (err) {
      console.error('Failed to load friend requests:', err);
    }
    setLoading(false);
  };

  const handleAccept = async (requestId: string) => {
    setProcessing(requestId);
    const token = localStorage.getItem('pluginradar_session');
    if (!token) return;

    try {
      await convexClient.convex.mutation(api.friends.acceptFriendRequest, {
        sessionToken: token,
        requestId: requestId as any,
      });
      setRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    } catch (err) {
      console.error('Failed to accept request:', err);
    }
    setProcessing(null);
  };

  const handleReject = async (requestId: string) => {
    setProcessing(requestId);
    const token = localStorage.getItem('pluginradar_session');
    if (!token) return;

    try {
      await convexClient.convex.mutation(api.friends.rejectFriendRequest, {
        sessionToken: token,
        requestId: requestId as any,
      });
      setRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    } catch (err) {
      console.error('Failed to reject request:', err);
    }
    setProcessing(null);
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  if (loading) {
    return (
      <div className="bg-plugin-surface rounded-lg p-4 border border-plugin-border">
        <div className="text-gray-400 text-sm">Loading requests...</div>
      </div>
    );
  }

  return (
    <div className="bg-plugin-surface rounded-lg p-4 border border-plugin-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-plugin-accent" />
          <h3 className="text-white font-mono font-medium">Friend Requests</h3>
          {requests.length > 0 && (
            <span className="bg-plugin-accent text-white text-xs rounded-full px-2 py-0.5">
              {requests.length}
            </span>
          )}
        </div>
        <button
          onClick={loadRequests}
          className="text-gray-400 hover:text-white p-1"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="text-gray-500 text-sm text-center py-4">
          No pending requests
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <div
              key={req.requestId}
              className="flex items-center justify-between bg-black/20 rounded p-3"
            >
              <div>
                <div className="text-white text-sm font-medium">{req.username}</div>
                <div className="text-gray-500 text-xs">{formatTime(req.sentAt)}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(req.requestId)}
                  disabled={processing === req.requestId}
                  className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded px-2 py-1"
                  title="Accept"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => handleReject(req.requestId)}
                  disabled={processing === req.requestId}
                  className="flex items-center gap-1 bg-red-600/30 hover:bg-red-600/50 disabled:opacity-50 text-red-400 text-sm rounded px-2 py-1"
                  title="Reject"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
