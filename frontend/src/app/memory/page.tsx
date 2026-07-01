'use client';

import React, { Suspense, lazy } from 'react';
import AppLayout, { useDashboard } from '@/components/AppLayout';

const MemoryView = lazy(() => import('@/components/MemoryView'));

function ComponentLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
    </div>
  );
}

function MemoryContent() {
  const { agents } = useDashboard();

  return (
    <Suspense fallback={<ComponentLoader />}>
      <MemoryView agents={agents} />
    </Suspense>
  );
}

export default function MemoryPage() {
  return (
    <AppLayout>
      <MemoryContent />
    </AppLayout>
  );
}
