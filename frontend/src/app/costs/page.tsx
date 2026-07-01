'use client';

import React, { Suspense, lazy } from 'react';
import AppLayout from '@/components/AppLayout';

const CostDashboard = lazy(() => import('@/components/CostDashboard'));

function ComponentLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
    </div>
  );
}

function CostsContent() {
  return (
    <Suspense fallback={<ComponentLoader />}>
      <CostDashboard />
    </Suspense>
  );
}

export default function CostsPage() {
  return (
    <AppLayout>
      <CostsContent />
    </AppLayout>
  );
}
