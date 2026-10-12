"use client";

import { createContext, useContext, ReactNode, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "./auth-provider";

const OwnedPluginsContext = createContext<Set<string>>(new Set());

export function OwnedPluginsProvider({ children }: { children: ReactNode }) {
  const { sessionToken, isAuthenticated } = useAuth();

  const ownedIds = useQuery(
    api.ownedPlugins.getOwnedPluginIds,
    isAuthenticated && sessionToken ? { sessionToken } : "skip"
  );

  const ownedSet = useMemo(
    () => new Set((ownedIds ?? []).map(String)),
    [ownedIds]
  );

  return (
    <OwnedPluginsContext.Provider value={ownedSet}>
      {children}
    </OwnedPluginsContext.Provider>
  );
}

export function useOwnedPlugins() {
  return useContext(OwnedPluginsContext);
}
