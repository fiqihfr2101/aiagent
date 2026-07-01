'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout, { useDashboard } from '@/components/AppLayout';
import ChatInterface from '@/components/ChatInterface';
import ChatSidebar from '@/components/ChatSidebar';

function ConversationContent() {
  const { agents } = useDashboard();
  const params = useParams();
  const conversationId = params.conversationId as string;
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-full">
      <ChatSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <ChatInterface agents={agents} conversationId={conversationId} />
    </div>
  );
}

export default function ConversationPage() {
  return (
    <AppLayout>
      <ConversationContent />
    </AppLayout>
  );
}
