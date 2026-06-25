'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function AccountSettings() {
  const { user, refreshUser } = useAuth();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFASetupMode, setTwoFASetupMode] = useState(false);
  const [twoFAQRCode, setTwoFAQRCode] = useState<string | null>(null);
  const [twoFASecret, setTwoFASecret] = useState<string | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAPassword, setTwoFAPassword] = useState('');
  const [twoFAError, setTwoFAError] = useState<string | null>(null);
  const [twoFASuccess, setTwoFASuccess] = useState<string | null>(null);
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  useEffect(() => {
    if (user) {
      setTwoFAEnabled(user.two_fa_enabled || false);
    }
  }, [user]);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('access_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: *** ${token}` } : {}),
    };
  }, []);

  // ─── Password Change ─────────────────────────────────────────
  const handlePasswordChange = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword.trim()) {
      setPasswordError('Current password is required');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch(`${API_BASE}/auth/password`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to change password');
      }

      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message);
    } finally {
      setIsChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword, getAuthHeaders]);

  // ─── 2FA Setup ───────────────────────────────────────────────
  const handle2FASetup = useCallback(async () => {
    setTwoFAError(null);
    setTwoFASuccess(null);

    if (!twoFAPassword.trim()) {
      setTwoFAError('Password is required to set up 2FA');
      return;
    }

    setIs2FALoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/setup`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ password: twoFAPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to set up 2FA');
      }

      const data = await res.json();
      setTwoFAQRCode(data.qr_code);
      setTwoFASecret(data.secret);
      setTwoFASetupMode(true);
      setTwoFAPassword('');
    } catch (err: any) {
      setTwoFAError(err.message);
    } finally {
      setIs2FALoading(false);
    }
  }, [twoFAPassword, getAuthHeaders]);

  // ─── 2FA Enable ──────────────────────────────────────────────
  const handle2FAEnable = useCallback(async () => {
    setTwoFAError(null);
    setTwoFASuccess(null);

    if (twoFACode.length !== 6) {
      setTwoFAError('Please enter a valid 6-digit code');
      return;
    }

    setIs2FALoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/enable`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ code: twoFACode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to enable 2FA');
      }

      setTwoFASuccess('2FA enabled successfully!');
      setTwoFAEnabled(true);
      setTwoFASetupMode(false);
      setTwoFAQRCode(null);
      setTwoFASecret(null);
      setTwoFACode('');
      refreshUser();
    } catch (err: any) {
      setTwoFAError(err.message);
    } finally {
      setIs2FALoading(false);
    }
  }, [twoFACode, getAuthHeaders, refreshUser]);

  // ─── 2FA Disable ─────────────────────────────────────────────
  const handle2FADisable = useCallback(async () => {
    setTwoFAError(null);
    setTwoFASuccess(null);

    if (!disablePassword.trim()) {
      setTwoFAError('Password is required to disable 2FA');
      return;
    }

    setIs2FALoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/disable`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ password: disablePassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to disable 2FA');
      }

      setTwoFASuccess('2FA disabled successfully');
      setTwoFAEnabled(false);
      setShowDisable2FA(false);
      setDisablePassword('');
      refreshUser();
    } catch (err: any) {
      setTwoFAError(err.message);
    } finally {
      setIs2FALoading(false);
    }
  }, [disablePassword, getAuthHeaders, refreshUser]);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-wide">Account Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Manage your account security and preferences</p>
      </div>

      {/* User Info */}
      <div className="bg-[#111827]/80 border border-gray-700/50 rounded-xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-lg font-bold text-white">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <div className="text-lg font-semibold text-white">{user?.username}</div>
            <div className="text-sm text-gray-400 capitalize">Role: {user?.role}</div>
          </div>
          {twoFAEnabled && (
            <div className="ml-auto px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-mono">
              2FA Active
            </div>
          )}
        </div>
      </div>

      {/* Password Change Section */}
      <div className="bg-[#111827]/80 border border-gray-700/50 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          Change Password
        </h2>

        {passwordError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">{passwordError}</p>
          </div>
        )}
        {passwordSuccess && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <p className="text-sm text-green-400">{passwordSuccess}</p>
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-gray-400 uppercase tracking-wider mb-2">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0D1117] border border-gray-600/50 rounded-lg text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-gray-400 uppercase tracking-wider mb-2">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0D1117] border border-gray-600/50 rounded-lg text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              placeholder="Min 8 characters"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-gray-400 uppercase tracking-wider mb-2">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0D1117] border border-gray-600/50 rounded-lg text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={isChangingPassword}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-600/50 text-white text-sm font-mono font-bold rounded-lg transition-colors"
          >
            {isChangingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* 2FA Section */}
      <div className="bg-[#111827]/80 border border-gray-700/50 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Two-Factor Authentication (2FA)
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Add an extra layer of security to your account using a TOTP authenticator app (e.g., Google Authenticator, Authy).
        </p>

        {twoFAError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">{twoFAError}</p>
          </div>
        )}
        {twoFASuccess && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <p className="text-sm text-green-400">{twoFASuccess}</p>
          </div>
        )}

        {/* 2FA Status */}
        {!twoFASetupMode && !showDisable2FA && (
          <div className="space-y-4">
            <div className={`flex items-center justify-between p-4 rounded-lg border ${
              twoFAEnabled
                ? 'bg-green-500/5 border-green-500/30'
                : 'bg-gray-500/5 border-gray-600/30'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${twoFAEnabled ? 'bg-green-400' : 'bg-gray-500'}`} />
                <span className="text-sm text-white font-mono">
                  {twoFAEnabled ? '2FA is enabled' : '2FA is disabled'}
                </span>
              </div>
              <span className={`text-xs font-mono ${twoFAEnabled ? 'text-green-400' : 'text-gray-500'}`}>
                {twoFAEnabled ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>

            {!twoFAEnabled ? (
              /* Setup 2FA */
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-mono text-gray-400 uppercase tracking-wider mb-2">
                    Confirm Password to Enable 2FA
                  </label>
                  <input
                    type="password"
                    value={twoFAPassword}
                    onChange={(e) => setTwoFAPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0D1117] border border-gray-600/50 rounded-lg text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                    placeholder="••••••••"
                  />
                </div>
                <button
                  onClick={handle2FASetup}
                  disabled={is2FALoading}
                  className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-600/50 text-white text-sm font-mono font-bold rounded-lg transition-colors"
                >
                  {is2FALoading ? 'Setting up...' : 'Set Up 2FA'}
                </button>
              </div>
            ) : (
              /* Disable 2FA button */
              <button
                onClick={() => setShowDisable2FA(true)}
                className="px-5 py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-sm font-mono font-bold rounded-lg transition-colors"
              >
                Disable 2FA
              </button>
            )}
          </div>
        )}

        {/* 2FA Setup Mode - QR Code */}
        {twoFASetupMode && (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-sm text-gray-300 mb-4">
                Scan this QR code with your authenticator app:
              </p>
              {twoFAQRCode && (
                <div className="inline-block p-4 bg-white rounded-xl">
                  <img src={twoFAQRCode} alt="2FA QR Code" className="w-48 h-48" />
                </div>
              )}
            </div>

            {twoFASecret && (
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-2">Or enter this secret manually:</p>
                <code className="px-3 py-1.5 bg-[#0D1117] border border-gray-600/50 rounded text-cyan-400 text-sm font-mono select-all">
                  {twoFASecret}
                </code>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-gray-400 uppercase tracking-wider mb-2">
                  Enter 6-digit code from your app
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={twoFACode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setTwoFACode(val);
                  }}
                  className="w-full px-4 py-2.5 bg-[#0D1117] border border-gray-600/50 rounded-lg text-white text-lg font-mono tracking-[0.5em] text-center placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                  placeholder="000000"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handle2FAEnable}
                  disabled={is2FALoading || twoFACode.length !== 6}
                  className="flex-1 px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white text-sm font-mono font-bold rounded-lg transition-colors"
                >
                  {is2FALoading ? 'Verifying...' : 'Enable 2FA'}
                </button>
                <button
                  onClick={() => {
                    setTwoFASetupMode(false);
                    setTwoFAQRCode(null);
                    setTwoFASecret(null);
                    setTwoFACode('');
                    setTwoFAError(null);
                  }}
                  className="px-5 py-2.5 bg-gray-600/30 hover:bg-gray-600/50 text-gray-300 text-sm font-mono rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2FA Disable Confirmation */}
        {showDisable2FA && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-sm text-red-400">
                ⚠️ Disabling 2FA will reduce your account security. You will only need your password to log in.
              </p>
            </div>
            <div>
              <label className="block text-xs font-mono text-gray-400 uppercase tracking-wider mb-2">
                Confirm Password to Disable 2FA
              </label>
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0D1117] border border-gray-600/50 rounded-lg text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                placeholder="••••••••"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handle2FADisable}
                disabled={is2FALoading}
                className="flex-1 px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white text-sm font-mono font-bold rounded-lg transition-colors"
              >
                {is2FALoading ? 'Disabling...' : 'Confirm Disable'}
              </button>
              <button
                onClick={() => {
                  setShowDisable2FA(false);
                  setDisablePassword('');
                  setTwoFAError(null);
                }}
                className="px-5 py-2.5 bg-gray-600/30 hover:bg-gray-600/50 text-gray-300 text-sm font-mono rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
