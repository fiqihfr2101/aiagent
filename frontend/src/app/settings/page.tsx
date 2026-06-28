'use client';

import React, { lazy, Suspense } from 'react';
import { ProtectedRoute } from '@/contexts/AuthContext';

const AccountSettings = lazy(() => import('@/components/AccountSettings'));

const ComponentLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
  </div>
);

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0B0F1A] text-white">
        {/* Top bar with back link */}
        <div className="flex-shrink-0 h-[44px] bg-[rgba(7,9,15,0.95)] border-b border-[rgba(22,35,58,0.8)] flex items-center px-4 gap-4 backdrop-blur-xl">
          <a
            href="/"
            className="flex items-center gap-2 text-[11px] font-medium text-gray-300 hover:text-cyan-400 transition-colors tracking-wide uppercase"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </a>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-[7px] bg-[#0A1628] border border-[rgba(0,212,170,0.5)] flex items-center justify-center shadow-[0_0_10px_rgba(0,212,170,0.25)]">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 stroke-cyan-custom stroke-[1.6]">
                <rect x="4" y="8" width="16" height="12" rx="2" />
                <path d="M12 8V5M9 2h6M9 13h.01M15 13h.01M9 17h6" />
              </svg>
            </div>
            <span className="text-[12px] font-bold tracking-[0.14em]">H.E.R.M.E.S.</span>
          </div>
        </div>

        {/* Settings content */}
        <Suspense fallback={<ComponentLoader />}>
          <AccountSettings />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}
