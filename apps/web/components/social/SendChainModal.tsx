"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/auth-provider";
import { X, PaperPlaneTilt, Check, LinkSimple } from "@phosphor-icons/react";
import { UserAvatar } from "./UserAvatar";

interface SendChainModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-selected chain (e.g. from chain detail page) */
  preSelectedChainId?: Id<"pluginChains">;
  preSelectedChainName?: string;
}

export function SendChainModal({
  isOpen,
  onClose,
  preSelectedChainId,
  preSelectedChainName,
}: SendChainModalProps) {
  const { user, sessionToken } = useAuth();
  const [selectedChainId, setSelectedChainId] = useState<Id<"pluginChains"> | null>(
    preSelectedChainId ?? null
  );
  const [selectedFriendUsername, setSelectedFriendUsername] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const friends = useQuery(
    api.friends.getFriends,
    sessionToken ? { sessionToken } : "skip"
  );

  // Only fetch user's chains if no pre-selected chain
  const myChains = useQuery(
    api.pluginDirectory.getChainsByUser,
    !preSelectedChainId && user
      ? { userId: user._id, sessionToken: sessionToken ?? undefined }
      : "skip"
  );

  const sendChainMutation = useMutation(api.privateChains.sendChain);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!sessionToken || !selectedChainId || !selectedFriendUsername) return;
    setSending(true);
    setError(null);
    try {
      await sendChainMutation({
        sessionToken,
        chainId: selectedChainId,
        recipientIdentifier: selectedFriendUsername,
      });
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send chain");
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSent(false);
    setError(null);
    setSelectedChainId(preSelectedChainId ?? null);
    setSelectedFriendUsername(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative w-full max-w-md mx-4 bg-stone-900/95 border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold text-stone-100">Send Chain to Friend</h2>
          <button
            onClick={handleClose}
            className="p-1 text-stone-400 hover:text-stone-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {sent ? (
            /* Success state */
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto mb-4 bg-[#deff0a]/15 rounded-full flex items-center justify-center">
                <Check className="w-6 h-6 text-[#deff0a]" />
              </div>
              <h3 className="text-lg font-semibold text-stone-100 mb-1">Chain Sent!</h3>
              <p className="text-sm text-stone-400">
                Your friend will see it in their shared chains.
              </p>
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 text-sm font-medium text-stone-300 hover:text-white transition"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Step 1: Select chain (only if not pre-selected) */}
              {!preSelectedChainId && (
                <div>
                  <label className="block text-xs text-stone-500 uppercase tracking-wider mb-2">
                    Select Chain
                  </label>
                  {myChains === undefined ? (
                    <div className="animate-pulse h-10 bg-white/[0.04] rounded-xl" />
                  ) : myChains.length === 0 ? (
                    <p className="text-sm text-stone-400">
                      You haven&apos;t published any chains yet.
                    </p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
                      {myChains.map((chain: any) => (
                        <button
                          key={chain._id}
                          onClick={() => setSelectedChainId(chain._id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition text-sm ${
                            selectedChainId === chain._id
                              ? "bg-[#deff0a]/10 border border-[#deff0a]/30 text-stone-100"
                              : "bg-white/[0.03] hover:bg-white/[0.06] border border-transparent text-stone-300"
                          }`}
                        >
                          <LinkSimple className="w-4 h-4 text-stone-500 shrink-0" />
                          <span className="truncate">{chain.name}</span>
                          <span className="text-xs text-stone-500 ml-auto shrink-0">
                            {chain.pluginCount} plugins
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {preSelectedChainId && preSelectedChainName && (
                <div>
                  <label className="block text-xs text-stone-500 uppercase tracking-wider mb-2">
                    Chain
                  </label>
                  <div className="flex items-center gap-3 px-3 py-2 bg-[#deff0a]/10 border border-[#deff0a]/30 rounded-xl text-sm text-stone-100">
                    <LinkSimple className="w-4 h-4 text-[#deff0a] shrink-0" />
                    <span className="truncate">{preSelectedChainName}</span>
                  </div>
                </div>
              )}

              {/* Step 2: Select friend */}
              <div>
                <label className="block text-xs text-stone-500 uppercase tracking-wider mb-2">
                  Send To
                </label>
                {friends === undefined ? (
                  <div className="animate-pulse h-10 bg-white/[0.04] rounded-xl" />
                ) : friends.length === 0 ? (
                  <p className="text-sm text-stone-400">
                    You don&apos;t have any friends yet. Add friends from their profile page.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
                    {friends.map((friend: any) => (
                      <button
                        key={friend.userId}
                        onClick={() => setSelectedFriendUsername(friend.username)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition text-sm ${
                          selectedFriendUsername === friend.username
                            ? "bg-[#deff0a]/10 border border-[#deff0a]/30 text-stone-100"
                            : "bg-white/[0.03] hover:bg-white/[0.06] border border-transparent text-stone-300"
                        }`}
                      >
                        <UserAvatar name={friend.username} size="sm" />
                        <span className="truncate">{friend.username}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!selectedChainId || !selectedFriendUsername || sending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#deff0a] hover:bg-[#ccff00] text-stone-900 font-semibold rounded-xl transition text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#deff0a]/20"
              >
                <PaperPlaneTilt className="w-4 h-4" />
                {sending ? "Sending..." : "Send Chain"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
