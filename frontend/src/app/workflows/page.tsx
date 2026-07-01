'use client';

import React, { Suspense, lazy } from 'react';
import AppLayout from '@/components/AppLayout';

const WorkflowBuilder = lazy(() => import('@/components/WorkflowBuilder'));

function ComponentLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
    </div>
  );
}

function WorkflowsContent() {
  return (
    <Suspense fallback={<ComponentLoader />}>
      <WorkflowBuilder />
    </Suspense>
  );
}

export default function WorkflowsPage() {
  return (
    <AppLayout>
      <WorkflowsContent />
    </AppLayout>
  );
}
