'use client';

import React, { useState } from 'react';
import AppLayout, { useDashboard } from '@/components/AppLayout';
import ChatInterface from '@/components/ChatInterface';
import ChatSidebar from '@/components/ChatSidebar';

function ChatContent() {
  const { agents } = useDashboard();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-full">
      <ChatSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <ChatInterface agents={agents} conversationId={null} />
    </div>
  );
}

export default function ChatPage() {
  return (
    <AppLayout>
      <ChatContent />
    </AppLayout>
  );
}
