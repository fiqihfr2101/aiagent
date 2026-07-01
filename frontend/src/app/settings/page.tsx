'use client';

import React, { lazy, Suspense } from 'react';
import AppLayout from '@/components/AppLayout';

const AccountSettings = lazy(() => import('@/components/AccountSettings'));

const ComponentLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
  </div>
);

export default function SettingsPage() {
  return (
    <AppLayout>
      <Suspense fallback={<ComponentLoader />}>
        <AccountSettings />
      </Suspense>
    </AppLayout>
  );
}
