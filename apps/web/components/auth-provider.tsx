"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface User {
  _id: Id<"users">;
  email: string;
  name?: string;
  avatarUrl?: string;
  tier: string;
  isAdmin?: boolean;
  createdAt: number;
  lastSeenAt: number;
  emailDigest: string;
  preferredCurrency: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  sessionToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loginMutation = useMutation(api.auth.login);
  const registerMutation = useMutation(api.auth.register);
  const logoutMutation = useMutation(api.auth.logout);
  const session = useQuery(
    api.auth.verifySession,
    sessionToken ? { sessionToken } : "skip"
  );

  // Load session from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem("pluginradar_session");
    if (storedToken) {
      setSessionToken(storedToken);
    }
    setIsLoading(false);
  }, []);

  // Get full user data if we have a valid session
  const userId = session?.userId as Id<"users"> | undefined;
  const user = useQuery(
    api.users.get,
    userId ? { id: userId } : "skip"
  );

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await loginMutation({ email, password });
      localStorage.setItem("pluginradar_session", result.sessionToken);
      setSessionToken(result.sessionToken);
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    setIsLoading(true);
    try {
      const result = await registerMutation({ email, password, name });
      localStorage.setItem("pluginradar_session", result.sessionToken);
      setSessionToken(result.sessionToken);
    } catch (error) {
      console.error("Registration failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    if (sessionToken) {
      logoutMutation({ sessionToken }).catch(() => {});
    }
    localStorage.removeItem("pluginradar_session");
    setSessionToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user: user as User | null,
        isLoading: isLoading || (sessionToken !== null && session === undefined),
        isAuthenticated: !!session,
        isAdmin: session?.isAdmin ?? false,
        sessionToken,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
