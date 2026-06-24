'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

// ─── Node type definitions ────────────────────────────────────
export type WorkflowNodeType = 'trigger' | 'agent' | 'condition' | 'transform' | 'output';

export interface WorkflowNodeData {
  label: string;
  nodeType: WorkflowNodeType;
  config?: Record<string, any>;
  status?: 'idle' | 'running' | 'completed' | 'failed';
  [key: string]: unknown;
}

const nodeStyles: Record<WorkflowNodeType, { bg: string; border: string; icon: string; color: string }> = {
  trigger:  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', icon: '⚡', color: 'text-emerald-400' },
  agent:    { bg: 'bg-cyan-custom/10',  border: 'border-cyan-custom/40',  icon: '🤖', color: 'text-cyan-custom' },
  condition:{ bg: 'bg-amber-400/10',   border: 'border-amber-400/40',   icon: '🔀', color: 'text-amber-400' },
  transform:{ bg: 'bg-purple-400/10',  border: 'border-purple-400/40',  icon: '⚙️', color: 'text-purple-400' },
  output:   { bg: 'bg-blue-400/10',    border: 'border-blue-400/40',    icon: '📤', color: 'text-blue-400' },
};

const statusColors: Record<string, string> = {
  idle:      'bg-gray-400',
  running:   'bg-amber-400 animate-pulse',
  completed: 'bg-grn-custom',
  failed:    'bg-red-custom',
};

// ─── Base custom node wrapper ─────────────────────────────────
const BaseNode: React.FC<{
  data: WorkflowNodeData;
  showInput?: boolean;
  showOutput?: boolean;
  children?: React.ReactNode;
}> = memo(({ data, showInput = true, showOutput = true, children }) => {
  const style = nodeStyles[data.nodeType] || nodeStyles.agent;

  return (
    <div className={`relative min-w-[180px] rounded-lg border ${style.border} ${style.bg} bg-bg2/90 backdrop-blur-sm shadow-lg`}>
      {showInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-cyan-custom !border-2 !border-bg2 !-left-1.5"
        />
      )}

      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm">{style.icon}</span>
          <span className={`text-[10px] font-mono font-bold tracking-wider uppercase ${style.color}`}>
            {data.nodeType}
          </span>
          {data.status && data.status !== 'idle' && (
            <span className={`ml-auto w-2 h-2 rounded-full ${statusColors[data.status] || statusColors.idle}`} />
          )}
        </div>

        {/* Label */}
        <div className="text-[12px] font-medium text-txt leading-tight truncate">
          {data.label}
        </div>

        {/* Config preview */}
        {data.config && Object.keys(data.config).length > 0 && (
          <div className="mt-1.5 text-[9px] text-txt3 font-mono truncate">
            {Object.entries(data.config).slice(0, 2).map(([k, v]) => (
              <div key={k} className="truncate">
                <span className="text-txt2">{k}:</span> {String(v)}
              </div>
            ))}
          </div>
        )}

        {children}
      </div>

      {showOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-grn-custom !border-2 !border-bg2 !-right-1.5"
        />
      )}
    </div>
  );
});

BaseNode.displayName = 'BaseNode';

// ─── Specific node components ─────────────────────────────────

export const TriggerNode: React.FC<NodeProps> = memo(({ data }) => (
  <BaseNode data={data as WorkflowNodeData} showInput={false} />
));
TriggerNode.displayName = 'TriggerNode';

export const AgentNode: React.FC<NodeProps> = memo(({ data }) => (
  <BaseNode data={data as WorkflowNodeData}>
    {(data as WorkflowNodeData).config?.agentId && (
      <div className="mt-1 text-[9px] text-cyan-custom font-mono opacity-70">
        Agent: {(data as WorkflowNodeData).config?.agentId}
      </div>
    )}
  </BaseNode>
));
AgentNode.displayName = 'AgentNode';

export const ConditionNode: React.FC<NodeProps> = memo(({ data }) => (
  <BaseNode data={data as WorkflowNodeData}>
    <div className="flex gap-1 mt-1">
      <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">true</span>
      <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-custom/15 text-red-custom border border-red-custom/30">false</span>
    </div>
  </BaseNode>
));
ConditionNode.displayName = 'ConditionNode';

export const TransformNode: React.FC<NodeProps> = memo(({ data }) => (
  <BaseNode data={data as WorkflowNodeData} />
));
TransformNode.displayName = 'TransformNode';

export const OutputNode: React.FC<NodeProps> = memo(({ data }) => (
  <BaseNode data={data as WorkflowNodeData} showOutput={false} />
));
OutputNode.displayName = 'OutputNode';

export const nodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  condition: ConditionNode,
  transform: TransformNode,
  output: OutputNode,
};

// ─── Node palette config for sidebar ──────────────────────────
export const NODE_PALETTE: { type: WorkflowNodeType; label: string; icon: string; description: string }[] = [
  { type: 'trigger',   label: 'Trigger',   icon: '⚡', description: 'Start workflow on event' },
  { type: 'agent',     label: 'Agent',     icon: '🤖', description: 'Dispatch to AI agent' },
  { type: 'condition', label: 'Condition', icon: '🔀', description: 'Branch based on logic' },
  { type: 'transform', label: 'Transform', icon: '⚙️', description: 'Transform data' },
  { type: 'output',    label: 'Output',    icon: '📤', description: 'Send result / notify' },
];
