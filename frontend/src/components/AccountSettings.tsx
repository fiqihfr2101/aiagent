'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '../utils/api';

// Helper to build auth headers
function buildAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }
  return headers;
}

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
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaSetupData, setTwoFaSetupData] = useState<{ qr_code: string; secret: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [twoFaError, setTwoFaError] = useState<string | null>(null);
  const [twoFaSuccess, setTwoFaSuccess] = useState<string | null>(null);
  const [isSettingUp2Fa, setIsSettingUp2Fa] = useState(false);
  const [isVerifying2Fa, setIsVerifying2Fa] = useState(false);
  const [isDisabling2Fa, setIsDisabling2Fa] = useState(false);
  const [showDisable2Fa, setShowDisable2Fa] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  useEffect(() => {
    if (user?.two_fa_enabled) {
      setTwoFaEnabled(true);
    }
  }, [user]);

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
        headers: buildAuthHeaders(),
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
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  // ─── 2FA Setup ─────────────────────────────────────────────
  const handle2faSetup = useCallback(async () => {
    setTwoFaError(null);
    setIsSettingUp2Fa(true);
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/setup`, {
        method: 'POST',
        headers: buildAuthHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to setup 2FA');
      }

      const data = await res.json();
      setTwoFaSetupData(data);
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : 'Failed to setup 2FA');
    } finally {
      setIsSettingUp2Fa(false);
    }
  }, []);

  // ─── 2FA Verify & Enable ───────────────────────────────────
  const handle2faVerify = useCallback(async () => {
    if (twoFaCode.length !== 6) {
      setTwoFaError('Code must be 6 digits');
      return;
    }

    setTwoFaError(null);
    setIsVerifying2Fa(true);
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/enable`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({ code: twoFaCode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Invalid code');
      }

      setTwoFaEnabled(true);
      setTwoFaSetupData(null);
      setTwoFaCode('');
      setTwoFaSuccess('2FA enabled successfully');
      refreshUser();
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : 'Failed to verify code');
    } finally {
      setIsVerifying2Fa(false);
    }
  }, [twoFaCode, refreshUser]);

  // ─── 2FA Disable ───────────────────────────────────────────
  const handle2faDisable = useCallback(async () => {
    if (!disablePassword.trim()) {
      setTwoFaError('Password is required to disable 2FA');
      return;
    }

    setTwoFaError(null);
    setIsDisabling2Fa(true);
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/disable`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({ password: disablePassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to disable 2FA');
      }

      setTwoFaEnabled(false);
      setTwoFaSetupData(null);
      setTwoFaCode('');
      setDisablePassword('');
      setShowDisable2Fa(false);
      setTwoFaSuccess('2FA disabled successfully');
      refreshUser();
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setIsDisabling2Fa(false);
    }
  }, [disablePassword, refreshUser]);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold text-white">Account Settings</h1>

      {/* Password Change Section */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Change Password</h2>
        
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-300 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
              required
              minLength={8}
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-300 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
              required
            />
          </div>

          {passwordError && (
            <div className="text-red-400 text-sm">{passwordError}</div>
          )}
          {passwordSuccess && (
            <div className="text-green-400 text-sm">{passwordSuccess}</div>
          )}

          <button
            type="submit"
            disabled={isChangingPassword}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {isChangingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* 2FA Section */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Two-Factor Authentication (2FA)</h2>
        
        {twoFaEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-400">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>2FA is enabled</span>
            </div>

            {!showDisable2Fa ? (
              <button
                onClick={() => setShowDisable2Fa(true)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
              >
                Disable 2FA
              </button>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Enter password to disable 2FA</label>
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                    placeholder="Current password"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handle2faDisable}
                    disabled={isDisabling2Fa}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                  >
                    {isDisabling2Fa ? 'Disabling...' : 'Confirm Disable'}
                  </button>
                  <button
                    onClick={() => {
                      setShowDisable2Fa(false);
                      setDisablePassword('');
                      setTwoFaError(null);
                    }}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {!twoFaSetupData ? (
              <div>
                <p className="text-gray-300 text-sm mb-4">
                  Add an extra layer of security to your account by enabling 2FA.
                </p>
                <button
                  onClick={handle2faSetup}
                  disabled={isSettingUp2Fa}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {isSettingUp2Fa ? 'Setting up...' : 'Setup 2FA'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
                </p>
                
                <div className="flex justify-center bg-white p-4 rounded-lg">
                  <img src={twoFaSetupData.qr_code} alt="2FA QR Code" className="w-48 h-48" />
                </div>

                <div className="bg-gray-900 p-3 rounded-lg">
                  <p className="text-xs text-gray-300 mb-1">Manual entry key:</p>
                  <code className="text-cyan-400 text-sm break-all">{twoFaSetupData.secret}</code>
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">Enter 6-digit code from app</label>
                  <input
                    type="text"
                    value={twoFaCode}
                    onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white text-center text-2xl tracking-widest focus:border-cyan-500 focus:outline-none"
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handle2faVerify}
                    disabled={isVerifying2Fa || twoFaCode.length !== 6}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                  >
                    {isVerifying2Fa ? 'Verifying...' : 'Enable 2FA'}
                  </button>
                  <button
                    onClick={() => {
                      setTwoFaSetupData(null);
                      setTwoFaCode('');
                      setTwoFaError(null);
                    }}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {twoFaError && (
          <div className="mt-4 text-red-400 text-sm">{twoFaError}</div>
        )}
        {twoFaSuccess && (
          <div className="mt-4 text-green-400 text-sm">{twoFaSuccess}</div>
        )}
      </div>
    </div>
  );
}
