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

  // Working directory state
  const [workdir, setWorkdir] = useState('');
  const [workdirExists, setWorkdirExists] = useState(true);
  const [newWorkdir, setNewWorkdir] = useState('');
  const [workdirError, setWorkdirError] = useState<string | null>(null);
  const [workdirSuccess, setWorkdirSuccess] = useState<string | null>(null);
  const [isUpdatingWorkdir, setIsUpdatingWorkdir] = useState(false);

  useEffect(() => {
    if (user?.two_fa_enabled) {
      setTwoFaEnabled(true);
    }
  }, [user]);

  // Fetch current working directory
  useEffect(() => {
    const fetchWorkdir = async () => {
      try {
        const res = await fetch(`${API_BASE}/agents/workdir`, {
          headers: buildAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setWorkdir(data.workdir);
          setWorkdirExists(data.exists);
          setNewWorkdir(data.workdir);
        }
      } catch (err) {
        console.error('Failed to fetch working directory:', err);
      }
    };
    fetchWorkdir();
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
        body: JSON.stringify({}),
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

  const handle2faVerify = useCallback(async () => {
    setTwoFaError(null);
    setTwoFaSuccess(null);
    setIsVerifying2Fa(true);
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/verify`, {
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
      await refreshUser();
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : 'Failed to verify code');
    } finally {
      setIsVerifying2Fa(false);
    }
  }, [twoFaCode, refreshUser]);

  const handle2faDisable = useCallback(async () => {
    setTwoFaError(null);
    setTwoFaSuccess(null);
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
      setShowDisable2Fa(false);
      setDisablePassword('');
      setTwoFaSuccess('2FA disabled successfully');
      await refreshUser();
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setIsDisabling2Fa(false);
    }
  }, [disablePassword, refreshUser]);

  // ─── Working Directory Update ───────────────────────────────────
  const handleWorkdirUpdate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setWorkdirError(null);
    setWorkdirSuccess(null);
    setIsUpdatingWorkdir(true);

    try {
      const res = await fetch(`${API_BASE}/agents/workdir`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({ path: newWorkdir }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to update working directory');
      }

      const data = await res.json();
      setWorkdir(data.workdir);
      setWorkdirSuccess('Working directory updated successfully');
    } catch (err) {
      setWorkdirError(err instanceof Error ? err.message : 'Failed to update working directory');
    } finally {
      setIsUpdatingWorkdir(false);
    }
  }, [newWorkdir]);

  return (
    <div className="space-y-8 max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-white">Account Settings</h1>

      {/* Working Directory Section */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Agent Working Directory</h2>
        <p className="text-gray-400 text-sm mb-4">
          This is where agents will create and save projects and files.
        </p>

        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Current Directory</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-900 px-4 py-2 rounded-lg text-cyan-400 text-sm break-all">
              {workdir || 'Loading...'}
            </code>
            {!workdirExists && (
              <span className="text-yellow-500 text-xs">⚠ Directory not found</span>
            )}
          </div>
        </div>

        <form onSubmit={handleWorkdirUpdate} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">New Directory Path</label>
            <input
              type="text"
              value={newWorkdir}
              onChange={(e) => setNewWorkdir(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
              placeholder="C:\Users\username\Documents\Projects"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use absolute path. Directory will be created if it doesn't exist.
            </p>
          </div>

          <button
            type="submit"
            disabled={isUpdatingWorkdir || !newWorkdir.trim()}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {isUpdatingWorkdir ? 'Updating...' : 'Update Directory'}
          </button>
        </form>

        {workdirError && (
          <div className="mt-4 text-red-400 text-sm">{workdirError}</div>
        )}
        {workdirSuccess && (
          <div className="mt-4 text-green-400 text-sm">{workdirSuccess}</div>
        )}
      </div>

      {/* Password Section */}
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
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isChangingPassword}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {isChangingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </form>
        {passwordError && (
          <div className="mt-4 text-red-400 text-sm">{passwordError}</div>
        )}
        {passwordSuccess && (
          <div className="mt-4 text-green-400 text-sm">{passwordSuccess}</div>
        )}
      </div>

      {/* 2FA Section */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Two-Factor Authentication (2FA)</h2>
        
        {twoFaEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-green-400">✓</span>
              <span className="text-white">2FA is enabled</span>
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
                <p className="text-gray-300 text-sm">
                  Enter your password to disable 2FA:
                </p>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="Enter password"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handle2faDisable}
                    disabled={isDisabling2Fa || !disablePassword.trim()}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                  >
                    {isDisabling2Fa ? 'Disabling...' : 'Confirm Disable'}
                  </button>
                  <button
                    onClick={() => {
                      setShowDisable2Fa(false);
                      setDisablePassword('');
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
