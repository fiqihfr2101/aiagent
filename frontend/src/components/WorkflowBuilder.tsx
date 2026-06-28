'use client';
import { API_BASE } from '../utils/api';

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes, type WorkflowNodeData, type WorkflowNodeType } from './WorkflowNodes';
import WorkflowSidebar from './WorkflowSidebar';

// ─── Connection validation ────────────────────────────────────
const isValidConnection = (connection: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }, nodes: Node[]): boolean => {
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);
  if (!sourceNode || !targetNode) return false;

  // No self-connections
  if (connection.source === connection.target) return false;

  const sourceType = (sourceNode.data as WorkflowNodeData).nodeType;
  const targetType = (targetNode.data as WorkflowNodeData).nodeType;

  // Output nodes can't have outgoing connections
  if (sourceType === 'output') return false;
  // Trigger nodes can't have incoming connections
  if (targetType === 'trigger') return false;

  return true;
};

// ─── MiniMap node color ───────────────────────────────────────
const minimapNodeColor = (node: Node): string => {
  const type = (node.data as WorkflowNodeData)?.nodeType;
  const colors: Record<string, string> = {
    trigger: '#10b981',
    agent: '#00d4aa',
    condition: '#f59e0b',
    transform: '#a855f7',
    output: '#3b82f6',
  };
  return colors[type] || '#6b7280';
};

// ─── Initial state ────────────────────────────────────────────
const initialNodes: Node[] = [
  {
    id: 'start-1',
    type: 'trigger',
    position: { x: 100, y: 200 },
    data: { label: 'Workflow Start', nodeType: 'trigger', config: { event: 'manual' } },
  },
];

const initialEdges: Edge[] = [];

// ─── Main Builder ─────────────────────────────────────────────
const WorkflowBuilder: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Auto-dismiss status messages
  const showStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3000);
  }, []);

  // ─── Handle new connections ──────────────────────────────────
  const onConnect = useCallback(
    (params: Connection) => {
      if (!isValidConnection(params, nodes)) return;
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#00d4aa', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#00d4aa' },
          },
          eds,
        ),
      );
    },
    [nodes, setEdges],
  );

  // ─── Drag-and-drop: add new node ────────────────────────────
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow-type') as WorkflowNodeType;
      const label = event.dataTransfer.getData('application/reactflow-label') || type;

      if (!type || !rfInstance) return;

      const position = rfInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label, nodeType: type, config: {} },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [rfInstance, setNodes],
  );

  // ─── Node drag start (for sidebar) ──────────────────────────
  const onNodeDragStart = useCallback((_event: React.DragEvent, _nodeType: WorkflowNodeType) => {
    // Handled via dataTransfer in the sidebar component
  }, []);

  // ─── Node selection / config ─────────────────────────────────
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // ─── Delete selected node (keyboard) ────────────────────────
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedNode) {
          setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
          setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
          setSelectedNode(null);
        }
      }
    },
    [selectedNode, setNodes, setEdges],
  );

  // ─── Update node config ─────────────────────────────────────
  const updateNodeConfig = useCallback(
    (key: string, value: string) => {
      if (!selectedNode) return;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === selectedNode.id) {
            const data = n.data as WorkflowNodeData;
            return {
              ...n,
              data: {
                ...data,
                config: { ...data.config, [key]: value },
              },
            };
          }
          return n;
        }),
      );
      setSelectedNode((prev) => {
        if (!prev) return null;
        const data = prev.data as WorkflowNodeData;
        return { ...prev, data: { ...data, config: { ...data.config, [key]: value } } };
      });
    },
    [selectedNode, setNodes],
  );

  // ─── Save workflow ──────────────────────────────────────────
  const saveWorkflow = useCallback(async () => {
    if (!rfInstance) return;
    setSaving(true);
    const flow = rfInstance.toObject();
    const payload = {
      name: workflowName,
      nodes: flow.nodes,
      edges: flow.edges,
      viewport: flow.viewport,
    };

    try {
      const url = workflowId
        ? `${API_BASE}/workflows/${workflowId}`
        : API_BASE + '/workflows';
      const method = workflowId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setWorkflowId(data.id);
        showStatus(`✅ Workflow saved: ${data.id}`);
      } else {
        showStatus('❌ Save failed');
      }
    } catch {
      showStatus('❌ Save failed: backend unreachable');
    } finally {
      setSaving(false);
    }
  }, [rfInstance, workflowName, workflowId, showStatus]);

  // ─── Load workflow ──────────────────────────────────────────
  const loadWorkflow = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${API_BASE}/workflows/${id}`);
        if (res.ok) {
          const data = await res.json();
          setNodes(data.nodes || []);
          setEdges(data.edges || []);
          setWorkflowName(data.name || 'Untitled');
          setWorkflowId(data.id);
          showStatus(`📂 Loaded: ${data.name}`);
        }
      } catch {
        showStatus('❌ Load failed');
      }
    },
    [setNodes, setEdges, showStatus],
  );

  // ─── Execute workflow ───────────────────────────────────────
  const executeWorkflow = useCallback(async () => {
    if (!workflowId) {
      // Save first
      await saveWorkflow();
      if (!workflowId) {
        showStatus('❌ Save workflow before executing');
        return;
      }
    }
    setExecuting(true);
    try {
      const res = await fetch(`${API_BASE}/workflows/${workflowId}/execute`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showStatus(`🚀 Execution started: ${data.workflow_id || workflowId}`);
      } else {
        showStatus('❌ Execute failed');
      }
    } catch {
      showStatus('❌ Execute failed: backend unreachable');
    } finally {
      setExecuting(false);
    }
  }, [workflowId, saveWorkflow, showStatus]);

  // ─── New workflow ───────────────────────────────────────────
  const newWorkflow = useCallback(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setWorkflowName('Untitled Workflow');
    setWorkflowId(null);
    setSelectedNode(null);
    showStatus('🆕 New workflow');
  }, [setNodes, setEdges, showStatus]);

  return (
    <div className="flex h-full" onKeyDown={onKeyDown} tabIndex={0}>
      {/* Sidebar */}
      <WorkflowSidebar
        onNodeDragStart={onNodeDragStart}
        onLoadWorkflow={loadWorkflow}
        currentWorkflowId={workflowId}
      />

      {/* Main canvas area */}
      <div className="flex-1 flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex-shrink-0 h-10 bg-bg2 border-b border-border-custom flex items-center px-3 gap-2">
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="bg-transparent border-none text-[12px] font-bold text-txt tracking-wide outline-none w-48 placeholder:text-txt3"
            placeholder="Workflow name..."
          />
          <div className="flex-1" />

          {statusMsg && (
            <span className="text-[10px] font-mono text-txt2 mr-2 animate-fadein">{statusMsg}</span>
          )}

          <button
            onClick={newWorkflow}
            className="px-2.5 py-1 rounded text-[9px] font-mono font-bold border border-border-custom bg-bg3 text-txt2 hover:text-txt hover:border-border2 transition-colors"
          >
            + NEW
          </button>
          <button
            onClick={saveWorkflow}
            disabled={saving}
            className={`px-2.5 py-1 rounded text-[9px] font-mono font-bold border border-cyan-custom/30 bg-cyan-custom/10 text-cyan-custom hover:bg-cyan-custom/20 transition-colors ${saving ? 'opacity-50' : ''}`}
          >
            {saving ? 'SAVING...' : '💾 SAVE'}
          </button>
          <button
            onClick={executeWorkflow}
            disabled={executing}
            className={`px-2.5 py-1 rounded text-[9px] font-mono font-bold border border-grn-custom/30 bg-grn-custom/10 text-grn-custom hover:bg-grn-custom/20 transition-colors ${executing ? 'opacity-50' : ''}`}
          >
            {executing ? 'RUNNING...' : '▶ RUN'}
          </button>
        </div>

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRfInstance}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            isValidConnection={(conn) => isValidConnection(conn, nodes)}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: '#00d4aa', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#00d4aa' },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Controls className="!bg-bg2 !border-border-custom !shadow-lg [&>button]:!bg-bg3 [&>button]:!border-border-custom [&>button]:!text-txt2" />
            <MiniMap
              nodeColor={minimapNodeColor}
              maskColor="rgba(0,0,0,0.7)"
              className="!bg-bg2 !border-border-custom"
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(0,212,170,0.08)" />
          </ReactFlow>

          {/* Node config panel (overlay) */}
          {selectedNode && (
            <div className="absolute top-2 right-2 w-[240px] bg-bg2/95 backdrop-blur-sm border border-border-custom rounded-lg shadow-xl z-10 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-cyan-custom tracking-wider uppercase">
                  Configure Node
                </span>
                <button onClick={() => setSelectedNode(null)} className="text-txt3 hover:text-txt text-xs">✕</button>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[9px] text-txt3 uppercase tracking-wider">Type</label>
                  <div className="text-[11px] text-txt font-mono mt-0.5">
                    {(selectedNode.data as WorkflowNodeData).nodeType}
                  </div>
                </div>
                {Object.entries((selectedNode.data as WorkflowNodeData).config || {}).map(([key, val]) => (
                  <div key={key}>
                    <label className="text-[9px] text-txt3 uppercase tracking-wider">{key}</label>
                    <input
                      type="text"
                      value={String(val)}
                      onChange={(e) => updateNodeConfig(key, e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 rounded bg-bg3 border border-border-custom text-[11px] text-txt font-mono outline-none focus:border-cyan-custom/40"
                    />
                  </div>
                ))}
                <button
                  onClick={() => {
                    const key = prompt('Config key:');
                    if (key) updateNodeConfig(key, '');
                  }}
                  className="w-full mt-1 px-2 py-1 rounded text-[9px] font-mono text-txt3 border border-dashed border-border-custom hover:border-cyan-custom/30 hover:text-cyan-custom transition-colors"
                >
                  + Add config field
                </button>
              </div>
              <div className="mt-3 pt-2 border-t border-border-custom">
                <button
                  onClick={() => {
                    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
                    setSelectedNode(null);
                  }}
                  className="w-full px-2 py-1 rounded text-[9px] font-mono font-bold text-red-custom border border-red-custom/30 bg-red-custom/5 hover:bg-red-custom/15 transition-colors"
                >
                  🗑 Delete Node
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowBuilder;
