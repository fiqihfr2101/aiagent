'use client';

import React, { useState, Suspense, lazy } from 'react';
import AppLayout from '@/components/AppLayout';

const Marketplace = lazy(() => import('@/components/Marketplace'));
const PluginManager = lazy(() => import('@/components/PluginManager'));

function ComponentLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
    </div>
  );
}

function PluginsContent() {
  const [pluginsTab, setPluginsTab] = useState<'marketplace' | 'installed'>('marketplace');

  return (
    <Suspense fallback={<ComponentLoader />}>
      <div className="h-full flex flex-col">
        <div className="flex gap-2 p-4 border-b border-border-custom">
          <button
            onClick={() => setPluginsTab('marketplace')}
            className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${pluginsTab === 'marketplace' ? 'bg-cyan-custom/20 text-cyan-custom border border-cyan-custom/40' : 'text-txt2 hover:text-txt border border-border-custom'}`}
          >
            Marketplace
          </button>
          <button
            onClick={() => setPluginsTab('installed')}
            className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${pluginsTab === 'installed' ? 'bg-cyan-custom/20 text-cyan-custom border border-cyan-custom/40' : 'text-txt2 hover:text-txt border border-border-custom'}`}
          >
            Installed
          </button>
        </div>
        {pluginsTab === 'marketplace' ? <Marketplace /> : <PluginManager />}
      </div>
    </Suspense>
  );
}

export default function PluginsPage() {
  return (
    <AppLayout>
      <PluginsContent />
    </AppLayout>
  );
}
