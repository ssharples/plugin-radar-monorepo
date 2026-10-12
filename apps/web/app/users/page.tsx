"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth-provider";
import { useState, useEffect } from "react";
import Link from "next/link";
import { MagnifyingGlass, User, Users } from "@phosphor-icons/react";
import { UserAvatar } from "@/components/social/UserAvatar";

export default function UsersPage() {
    const { sessionToken, isAuthenticated } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const searchResults = useQuery(
        api.userProfiles.searchUsers,
        isAuthenticated && sessionToken && debouncedQuery.length >= 2
            ? { sessionToken, query: debouncedQuery }
            : "skip"
    );

    return (
        <div className="relative min-h-[calc(100vh-64px)]">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />

            <div className="container mx-auto px-4 lg:px-6 py-10 relative">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-8">
                        <h1
                            className="text-3xl font-bold text-stone-100 mb-4"
                            style={{ fontFamily: "var(--font-display)" }}
                        >
                            Discover Producers
                        </h1>
                        <p className="text-stone-400">
                            Search for users by username, email, or Instagram handle to see their plugin chains and load stats.
                        </p>
                    </div>

                    {/* Search Box */}
                    <div className="relative mb-12">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <MagnifyingGlass className="w-6 h-6 text-stone-500" />
                        </div>
                        <input
                            type="text"
                            className="w-full bg-white/[0.03] border border-white/[0.1] rounded-2xl py-4 pl-12 pr-4 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 focus:bg-white/[0.05] transition shadow-inner"
                            placeholder="Search users... (min 2 characters)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Prompt to login if not authenticated */}
                    {!isAuthenticated ? (
                        <div className="text-center py-16 glass-card rounded-2xl">
                            <Users className="w-12 h-12 text-stone-600 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-stone-100 mb-2">
                                Sign in to search
                            </h3>
                            <p className="text-stone-400 mb-6">
                                You must be signed in to discover and connect with other users.
                            </p>
                            <Link
                                href="/account"
                                className="inline-flex items-center justify-center bg-white hover:bg-[#ccff00] text-stone-900 font-semibold py-3 px-6 rounded-xl transition shadow-lg shadow-[#deff0a]/20"
                            >
                                Sign In
                            </Link>
                        </div>
                    ) : (
                        <>
                            {/* Results State */}
                            {debouncedQuery.length >= 2 && searchResults !== undefined && searchResults.length === 0 && (
                                <div className="text-center py-16">
                                    <User className="w-12 h-12 text-stone-600 mx-auto mb-4" />
                                    <h3 className="text-xl font-semibold text-stone-100 mb-2">
                                        No users found
                                    </h3>
                                    <p className="text-stone-400">
                                        Try a different search term.
                                    </p>
                                </div>
                            )}

                            {/* Loading State */}
                            {debouncedQuery.length >= 2 && searchResults === undefined && (
                                <div className="space-y-3">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="animate-pulse flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl"
                                        >
                                            <div className="w-12 h-12 bg-white/[0.04] rounded-full" />
                                            <div className="flex-1 space-y-2">
                                                <div className="h-4 bg-white/[0.04] rounded w-32" />
                                                <div className="h-3 bg-white/[0.04] rounded w-24" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Data State */}
                            {searchResults && searchResults.length > 0 && (
                                <div className="space-y-3">
                                    <p className="text-sm text-stone-500 mb-4 ml-1">
                                        Found {searchResults.length} {searchResults.length === 1 ? 'user' : 'users'}
                                    </p>
                                    {searchResults.map((user) => (
                                        <Link
                                            key={user._id}
                                            href={`/profile/${user.userId}`}
                                            className="flex items-center justify-between p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] hover:border-white/[0.1] rounded-xl transition group"
                                        >
                                            <div className="flex items-center gap-4">
                                                <UserAvatar name={user.username} size="md" />
                                                <div>
                                                    <h3 className="text-stone-100 font-semibold group-hover:text-[#deff0a] transition">
                                                        {user.username}
                                                    </h3>
                                                    <p className="text-stone-500 text-sm">
                                                        Matched on {user.matchedOn}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-stone-500 group-hover:text-stone-300 transition">
                                                View Profile &rarr;
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                </div>
            </div>
        </div>
    );
}
