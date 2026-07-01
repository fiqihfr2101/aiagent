'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../utils/api';

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

  const isTokenExpired = useCallback((token: string): boolean => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // Consider expired if exp is in the past (with 30s buffer)
      return payload.exp * 1000 < Date.now() - 30000;
    } catch {
      return true; // If we can't decode, treat as expired
    }
  }, []);

  const tryRefreshToken = useCallback(async (): Promise<boolean> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        storeTokens(refreshData.access_token, refreshData.refresh_token);

        // Fetch user with new token
        const retryRes = await fetch(`${API_BASE}/auth/me`, {
          headers: { 'Authorization': 'Bearer ' + refreshData.access_token },
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          setUser(retryData);
          return true;
        }
      }
    } catch {
      // Refresh failed
    }
    return false;
  }, [getRefreshToken, storeTokens]);

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      // If token is already expired, skip /auth/me and go straight to refresh
      if (isTokenExpired(token)) {
        const refreshed = await tryRefreshToken();
        if (!refreshed) {
          clearTokens();
          setUser(null);
        }
      } else {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { 'Authorization': 'Bearer ' + token },
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else if (res.status === 401) {
          // Token rejected, try to refresh
          const refreshed = await tryRefreshToken();
          if (!refreshed) {
            clearTokens();
            setUser(null);
          }
        } else {
          clearTokens();
          setUser(null);
        }
      }
    } catch (err) {
      console.error('Failed to refresh user:', err);
      // On network/CORS error, try refresh token flow
      try {
        const refreshed = await tryRefreshToken();
        if (!refreshed) {
          setUser(null);
        }
      } catch {
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, isTokenExpired, tryRefreshToken, clearTokens]);

  const login = useCallback(async (username: string, password: string, totpCode?: string) => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, totp_code: totpCode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Login failed');
      }

      const data = await res.json();

      if (data.requires_2fa) {
        return { requires_2fa: true };
      }

      storeTokens(data.access_token, data.refresh_token);
      await refreshUser();
      return {};
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    }
  }, [storeTokens, refreshUser]);

  const logout = useCallback(async () => {
    const token = getAccessToken();
    if (token) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
        });
      } catch (err) {
        // Ignore logout errors
      }
    }
    clearTokens();
    setUser(null);
  }, [getAccessToken, clearTokens]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (user && getAccessToken()) {
      // Refresh every 14 minutes (token expires in 15 minutes)
      refreshTimerRef.current = setInterval(() => {
        refreshUser();
      }, 14 * 60 * 1000);

      return () => {
        if (refreshTimerRef.current) {
          clearInterval(refreshTimerRef.current);
        }
      };
    }
  }, [user, getAccessToken, refreshUser]);

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

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0B0F1A]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          <span className="text-sm text-gray-300 font-mono">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return <>{children}</>;
}

function LoginForm() {
  const { login, error, clearError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2fa, setRequires2fa] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await login(username, password, requires2fa ? totpCode : undefined);
      if (result.requires_2fa) {
        setRequires2fa(true);
      }
    } catch (err) {
      // Error is handled by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-[#0B0F1A]">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">AFILABS</h1>
          <p className="text-gray-300 text-sm">AI Agent Orchestrator</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
              required
            />
          </div>

          {requires2fa && (
            <div>
              <label className="block text-sm text-gray-300 mb-1">2FA Code</label>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white text-center text-2xl tracking-widest focus:border-cyan-500 focus:outline-none"
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                required
              />
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm text-center">{error}</div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-lg disabled:opacity-50"
          >
            {isSubmitting ? 'Signing in...' : requires2fa ? 'Verify' : 'Sign In'}
          </button>

          {requires2fa && (
            <button
              type="button"
              onClick={() => {
                setRequires2fa(false);
                setTotpCode('');
                clearError();
              }}
              className="w-full text-gray-300 hover:text-white text-sm"
            >
              Back to login
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
