'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface User {
  username: string;
  role: string;
  two_fa_enabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, totpCode?: string) => Promise<{ requires_2fa?: boolean }>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const getAccessToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('access_token');
  }, []);

  const getRefreshToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refresh_token');
  }, []);

  const storeTokens = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  }, []);

  const clearTokens = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }, []);

  const fetchUser = useCallback(async (token: string): Promise<User | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    const rt = getRefreshToken();
    if (!rt) return false;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });

      if (!res.ok) {
        clearTokens();
        setUser(null);
        return false;
      }

      const data = await res.json();
      storeTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      clearTokens();
      setUser(null);
      return false;
    }
  }, [getRefreshToken, clearTokens, storeTokens]);

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    if (token) {
      const u = await fetchUser(token);
      if (u) setUser(u);
    }
  }, [getAccessToken, fetchUser]);

  // Schedule token refresh before expiry
  const scheduleRefresh = useCallback((expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    // Refresh 60 seconds before expiry
    const refreshTime = Math.max((expiresIn - 60) * 1000, 10000);
    refreshTimerRef.current = setTimeout(async () => {
      const success = await refreshToken();
      if (success) {
        // Re-fetch user and re-schedule
        const token = getAccessToken();
        if (token) {
          const u = await fetchUser(token);
          if (u) {
            setUser(u);
            scheduleRefresh(30 * 60); // Default 30 min
          }
        }
      }
    }, refreshTime);
  }, [refreshToken, getAccessToken, fetchUser]);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      const u = await fetchUser(token);
      if (u) {
        setUser(u);
        scheduleRefresh(30 * 60); // Default 30 min
      } else {
        // Try refresh
        const success = await refreshToken();
        if (success) {
          const newToken = getAccessToken();
          if (newToken) {
            const newUser = await fetchUser(newToken);
            if (newUser) {
              setUser(newUser);
              scheduleRefresh(30 * 60);
            }
          }
        } else {
          clearTokens();
        }
      }
      setIsLoading(false);
    };

    checkAuth();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [getAccessToken, fetchUser, refreshToken, clearTokens, scheduleRefresh]);

  const login = useCallback(async (username: string, password: string, totpCode?: string): Promise<{ requires_2fa?: boolean }> => {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, totp_code: totpCode || null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = typeof data.detail === 'string' ? data.detail : 'Login failed';
        setError(detail);
        setIsLoading(false);
        throw new Error(detail);
      }

      const data = await res.json();

      // Check if 2FA is required
      if (data.requires_2fa) {
        setIsLoading(false);
        return { requires_2fa: true };
      }

      storeTokens(data.access_token, data.refresh_token);

      const u = await fetchUser(data.access_token);
      if (u) {
        setUser(u);
        scheduleRefresh(data.expires_in || 30 * 60);
      }
      setIsLoading(false);
      return {};
    } catch (err) {
      setIsLoading(false);
      throw err;
    }
  }, [storeTokens, fetchUser, scheduleRefresh]);

  const logout = useCallback(async () => {
    const refreshTokenVal = getRefreshToken();
    const accessTokenVal = getAccessToken();

    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessTokenVal ? { Authorization: `Bearer ${accessTokenVal}` } : {}),
        },
        body: JSON.stringify({ refresh_token: refreshTokenVal }),
      });
    } catch {
      // Ignore logout errors
    }

    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    clearTokens();
    setUser(null);
  }, [getRefreshToken, getAccessToken, clearTokens]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        error,
        clearError,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Higher-order component for protecting routes.
 * Redirects to login if not authenticated.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setShowLogin(true);
    }
    if (isAuthenticated) {
      setShowLogin(false);
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0B0F1A]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          <span className="text-sm text-gray-400 font-mono">Initializing H.E.R.M.E.S...</span>
        </div>
      </div>
    );
  }

  if (showLogin && !isAuthenticated) {
    // Dynamic import to avoid circular deps
    const LoginForm = require('@/components/LoginForm').default;
    return <LoginForm onLoginSuccess={() => setShowLogin(false)} />;
  }

  return <>{children}</>;
}
