"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "./api";

interface User {
  id: string;
  fullName: string;
  email?: string;
  phone: string;
  isAdmin: boolean;
  isOwner: boolean;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "mobly_admin_auth";

function loadStored(): { token: string; refreshToken: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveStored(token: string, refreshToken: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, refreshToken }));
}

function clearStored() {
  localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    clearStored();
  }, []);

  useEffect(() => {
    const stored = loadStored();
    if (!stored) {
      setLoading(false);
      return;
    }
    setToken(stored.token);
    setRefreshToken(stored.refreshToken);

    api<{ user: User }>("/auth/me", { token: stored.token })
      .then((data) => {
        if (!data.user.isAdmin) {
          clearStored();
          return;
        }
        setUser(data.user);
      })
      .catch(() => clearStored())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await api<{
      token: string;
      refreshToken: string;
      user: User;
    }>("/auth/login", {
      method: "POST",
      body: { identifier, password },
    });

    if (!data.user.isAdmin) {
      throw new Error("Ce compte n'a pas les droits administrateur.");
    }

    setUser(data.user);
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    saveStored(data.token, data.refreshToken);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, refreshToken, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
