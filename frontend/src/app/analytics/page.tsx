'use client';

import React, { Suspense, lazy } from 'react';
import AppLayout from '@/components/AppLayout';

const AnalyticsView = lazy(() => import('@/components/AnalyticsView'));

function ComponentLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
    </div>
  );
}

function AnalyticsContent() {
  return (
    <Suspense fallback={<ComponentLoader />}>
      <div className="h-full overflow-y-auto">
        <div className="flex justify-end p-4">
        </div>
        <AnalyticsView />
      </div>
    </Suspense>
  );
}

export default function AnalyticsPage() {
  return (
    <AppLayout>
      <AnalyticsContent />
    </AppLayout>
  );
}
