'use client';

import React, { Suspense, lazy } from 'react';
import AppLayout, { useDashboard } from '@/components/AppLayout';

const MessageCenter = lazy(() => import('@/components/MessageCenter'));

function ComponentLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
    </div>
  );
}

function MessagesContent() {
  const { agents } = useDashboard();

  return (
    <Suspense fallback={<ComponentLoader />}>
      <MessageCenter agents={agents} />
    </Suspense>
  );
}

export default function MessagesPage() {
  return (
    <AppLayout>
      <MessagesContent />
    </AppLayout>
  );
}
