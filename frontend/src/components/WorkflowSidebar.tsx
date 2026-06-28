'use client';
import { API_BASE } from '../utils/api';

import React, { useState, useEffect, useCallback } from 'react';
import { NODE_PALETTE, type WorkflowNodeData, type WorkflowNodeType } from './WorkflowNodes';

interface WorkflowSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowSidebarProps {
  onNodeDragStart: (event: React.DragEvent, nodeType: WorkflowNodeType) => void;
  onLoadWorkflow: (id: string) => void;
  currentWorkflowId: string | null;
}

const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({ onNodeDragStart, onLoadWorkflow, currentWorkflowId }) => {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'palette' | 'saved'>('palette');

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API_BASE + '/workflows');
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows || []);
      }
    } catch (err) {
      console.error('Failed to fetch workflows:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'saved') fetchWorkflows();
  }, [tab, fetchWorkflows]);

  return (
    <div className="w-[220px] flex-shrink-0 bg-bg2 border-r border-border-custom flex flex-col h-full">
      {/* Tab switcher */}
      <div className="flex border-b border-border-custom">
        <button
          onClick={() => setTab('palette')}
          className={`flex-1 py-2 text-[10px] font-mono font-bold tracking-wider uppercase transition-colors ${
            tab === 'palette' ? 'text-cyan-custom bg-cyan-custom/10 border-b-2 border-cyan-custom' : 'text-txt3 hover:text-txt2'
          }`}
        >
          Nodes
        </button>
        <button
          onClick={() => setTab('saved')}
          className={`flex-1 py-2 text-[10px] font-mono font-bold tracking-wider uppercase transition-colors ${
            tab === 'saved' ? 'text-cyan-custom bg-cyan-custom/10 border-b-2 border-cyan-custom' : 'text-txt3 hover:text-txt2'
          }`}
        >
          Saved
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* Node palette */}
        {tab === 'palette' && (
          <div className="space-y-2">
            <div className="text-[9px] text-txt3 tracking-wider uppercase mb-2">Drag to canvas</div>
            {NODE_PALETTE.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/reactflow-type', item.type);
                  e.dataTransfer.setData('application/reactflow-label', item.label);
                  e.dataTransfer.effectAllowed = 'move';
                  onNodeDragStart(e, item.type);
                }}
                className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border-custom bg-bg3/50 hover:bg-bg3 hover:border-cyan-custom/30 cursor-grab active:cursor-grabbing transition-all group"
              >
                <span className="text-base">{item.icon}</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-txt group-hover:text-cyan-custom transition-colors">{item.label}</div>
                  <div className="text-[9px] text-txt3 truncate">{item.description}</div>
                </div>
              </div>
            ))}

            <div className="mt-4 pt-3 border-t border-border-custom">
              <div className="text-[9px] text-txt3 tracking-wider uppercase mb-1.5">Tips</div>
              <ul className="text-[9px] text-txt3 space-y-1 leading-relaxed">
                <li>• Drag nodes to the canvas</li>
                <li>• Connect by dragging handles</li>
                <li>• Click node to configure</li>
                <li>• Right-click to delete</li>
              </ul>
            </div>
          </div>
        )}

        {/* Saved workflows */}
        {tab === 'saved' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-txt3 tracking-wider uppercase">Workflows</span>
              <button
                onClick={fetchWorkflows}
                className="text-[9px] text-cyan-custom hover:underline"
              >
                Refresh
              </button>
            </div>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <div className="w-4 h-4 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
              </div>
            )}
            {!loading && workflows.length === 0 && (
              <div className="text-[10px] text-txt3 text-center py-4 italic">No saved workflows</div>
            )}
            {workflows.map((wf) => (
              <div
                key={wf.id}
                onClick={() => onLoadWorkflow(wf.id)}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  currentWorkflowId === wf.id
                    ? 'border-cyan-custom/40 bg-cyan-custom/10'
                    : 'border-border-custom bg-bg3/50 hover:bg-bg3 hover:border-cyan-custom/30'
                }`}
              >
                <div className="text-[11px] font-medium text-txt truncate">{wf.name}</div>
                <div className="text-[9px] text-txt3 mt-0.5">
                  {new Date(wf.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowSidebar;
