"use client";

import { useState } from "react";

interface ForkButtonProps {
  onFork: (newName: string) => Promise<void>;
  chainName: string;
  disabled?: boolean;
}

export function ForkButton({ onFork, chainName, disabled }: ForkButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const [forkName, setForkName] = useState("");
  const [forking, setForking] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleOpen = () => {
    setForkName(`${chainName} (fork)`);
    setShowForm(true);
  };

  const handleFork = async () => {
    if (!forkName.trim() || forking) return;
    setForking(true);
    try {
      await onFork(forkName.trim());
      setShowForm(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } finally {
      setForking(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        disabled={disabled || forking}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-white/[0.06] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {/* Git branch icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="4" cy="4" r="2" />
          <circle cx="12" cy="4" r="2" />
          <circle cx="4" cy="12" r="2" />
          <path d="M4 6v4M6 4h4" />
        </svg>
        {showSuccess ? "Forked!" : "Fork"}
      </button>

      {showForm && (
        <div className="mt-2 p-3 bg-stone-800 border border-white/[0.06] rounded-xl">
          <label className="block text-xs text-stone-400 mb-1.5">
            New chain name
          </label>
          <input
            type="text"
            value={forkName}
            onChange={(e) => setForkName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFork()}
            className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500 focus:border-white focus:outline-none mb-2"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleFork}
              disabled={forking || !forkName.trim()}
              className="px-3 py-1.5 text-sm bg-white text-black font-semibold rounded-lg transition-colors"
            >
              {forking ? "..." : "Create Fork"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-stone-400 hover:text-stone-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
