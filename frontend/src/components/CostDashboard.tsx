'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cachedFetch } from '@/utils/apiCache';
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const API = 'http://localhost:8000';

const COLORS = ['#00D4AA', '#6366F1', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

interface CostSummary {
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tasks: number;
  recent_7d_cost: number;
  trend_percent: number;
}

interface AgentCost {
  agent_id: string;
  agent_name: string;
  total_cost: number;
  input_tokens: number;
  output_tokens: number;
  task_count: number;
}

interface ModelCost {
  model: string;
  total_cost: number;
  input_tokens: number;
  output_tokens: number;
  task_count: number;
}

interface DailyCost {
  date: string;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  task_count: number;
}

const CostDashboard: React.FC = () => {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [agentCosts, setAgentCosts] = useState<AgentCost[]>([]);
  const [modelCosts, setModelCosts] = useState<ModelCost[]>([]);
  const [dailyCosts, setDailyCosts] = useState<DailyCost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCosts = useCallback(async () => {
    try {
      const [summary, agentCosts, modelCosts, dailyCosts] = await Promise.all([
        cachedFetch<CostSummary>(`${API}/metrics/costs`, undefined, 30000),
        cachedFetch<AgentCost[]>(`${API}/metrics/costs/agents`, undefined, 30000),
        cachedFetch<ModelCost[]>(`${API}/metrics/costs/models`, undefined, 30000),
        cachedFetch<DailyCost[]>(`${API}/metrics/costs/daily`, undefined, 30000),
      ]);
      setSummary(summary);
      setAgentCosts(agentCosts);
      setModelCosts(modelCosts);
      setDailyCosts(dailyCosts);
    } catch (err) {
      console.error('Failed to fetch cost data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCosts();
    const interval = setInterval(fetchCosts, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;
  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
    return tokens.toString();
  };

  const pieData = agentCosts.map(a => ({ name: a.agent_name, value: a.total_cost }));
  const barData = modelCosts.map(m => ({ name: m.model, cost: m.total_cost }));

  // Custom tooltip for dark theme
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-bg2 border border-border-custom rounded-lg p-2.5 shadow-lg">
          <p className="text-[10px] text-txt2 mb-1">{label}</p>
          {payload.map((entry: any, i: number) => (
            <p key={i} className="text-[11px] font-mono font-semibold" style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === 'number' ? (entry.name === 'cost' ? formatCost(entry.value) : formatTokens(entry.value)) : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-txt3 text-[11px] font-mono animate-pulse">Loading cost data...</div>
      </div>
    );
  }

  return (
    <div className="p-[20px_24px] overflow-y-auto flex-1">
      <div className="text-base font-semibold">Cost Tracking</div>
      <div className="text-[11px] text-txt2 mt-[3px] mb-4">Token usage and cost analysis · real-time monitoring</div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-2.5 mb-4">
        <div className="p-3 border border-border-custom rounded-lg bg-bg2">
          <div className="text-[9px] text-txt3 uppercase tracking-[0.1em]">Total Cost</div>
          <div className="font-mono text-[22px] font-semibold mt-1 leading-none text-cyan-custom">
            {summary ? formatCost(summary.total_cost) : '$0.00'}
          </div>
          {summary && summary.trend_percent !== 0 && (
            <div className={`text-[9px] font-mono mt-1 ${summary.trend_percent > 0 ? 'text-red-custom' : 'text-grn-custom'}`}>
              {summary.trend_percent > 0 ? '↑' : '↓'} {Math.abs(summary.trend_percent)}% vs last week
            </div>
          )}
        </div>
        <div className="p-3 border border-border-custom rounded-lg bg-bg2">
          <div className="text-[9px] text-txt3 uppercase tracking-[0.1em]">7-Day Cost</div>
          <div className="font-mono text-[22px] font-semibold mt-1 leading-none text-ind-custom">
            {summary ? formatCost(summary.recent_7d_cost) : '$0.00'}
          </div>
        </div>
        <div className="p-3 border border-border-custom rounded-lg bg-bg2">
          <div className="text-[9px] text-txt3 uppercase tracking-[0.1em]">Input Tokens</div>
          <div className="font-mono text-[22px] font-semibold mt-1 leading-none text-amb-custom">
            {summary ? formatTokens(summary.total_input_tokens) : '0'}
          </div>
        </div>
        <div className="p-3 border border-border-custom rounded-lg bg-bg2">
          <div className="text-[9px] text-txt3 uppercase tracking-[0.1em]">Output Tokens</div>
          <div className="font-mono text-[22px] font-semibold mt-1 leading-none text-purple-400">
            {summary ? formatTokens(summary.total_output_tokens) : '0'}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-[11px] mb-4">
        {/* Cost by Agent - Pie Chart */}
        <div className="bg-bg2 border border-border-custom rounded-lg p-3.5">
          <div className="text-[9px] text-txt2 uppercase tracking-[0.08em] mb-3">Cost by Agent</div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={30}
                  formatter={(value: string) => <span className="text-[9px] text-txt2">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-[10px] text-txt3">No cost data yet</div>
          )}
        </div>

        {/* Cost by Model - Bar Chart */}
        <div className="bg-bg2 border border-border-custom rounded-lg p-3.5">
          <div className="text-[9px] text-txt2 uppercase tracking-[0.08em] mb-3">Cost by Model</div>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(22,35,58,0.8)" />
                <XAxis dataKey="name" tick={{ fill: '#6B7A99', fontSize: 9 }} />
                <YAxis tick={{ fill: '#6B7A99', fontSize: 9 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="cost" fill="#00D4AA" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-[10px] text-txt3">No cost data yet</div>
          )}
        </div>

        {/* Daily Cost Trend - Line Chart */}
        <div className="bg-bg2 border border-border-custom rounded-lg p-3.5">
          <div className="text-[9px] text-txt2 uppercase tracking-[0.08em] mb-3">Daily Cost Trend</div>
          {dailyCosts.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={dailyCosts.slice(-14)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(22,35,58,0.8)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#6B7A99', fontSize: 8 }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis tick={{ fill: '#6B7A99', fontSize: 9 }} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="cost" stroke="#6366F1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-[10px] text-txt3">No cost data yet</div>
          )}
        </div>
      </div>

      {/* Token Usage Table */}
      <div className="bg-bg2 border border-border-custom rounded-lg p-3.5">
        <div className="text-[9px] text-txt2 uppercase tracking-[0.08em] mb-3">Token Usage Breakdown</div>
        {agentCosts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-custom">
                  <th className="text-[9px] text-txt3 uppercase tracking-wider pb-2 font-medium">Agent</th>
                  <th className="text-[9px] text-txt3 uppercase tracking-wider pb-2 font-medium text-right">Tasks</th>
                  <th className="text-[9px] text-txt3 uppercase tracking-wider pb-2 font-medium text-right">Input Tokens</th>
                  <th className="text-[9px] text-txt3 uppercase tracking-wider pb-2 font-medium text-right">Output Tokens</th>
                  <th className="text-[9px] text-txt3 uppercase tracking-wider pb-2 font-medium text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {agentCosts.map((agent, i) => (
                  <tr key={agent.agent_id} className="border-b border-border-custom/30">
                    <td className="py-2 text-[11px] font-medium text-txt flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {agent.agent_name}
                    </td>
                    <td className="py-2 text-[11px] font-mono text-txt2 text-right">{agent.task_count}</td>
                    <td className="py-2 text-[11px] font-mono text-amb-custom text-right">{formatTokens(agent.input_tokens)}</td>
                    <td className="py-2 text-[11px] font-mono text-purple-400 text-right">{formatTokens(agent.output_tokens)}</td>
                    <td className="py-2 text-[11px] font-mono font-semibold text-cyan-custom text-right">{formatCost(agent.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-[10px] text-txt3 text-center py-4">No token usage data yet. Complete some tasks to see cost breakdown.</div>
        )}
      </div>
    </div>
  );
};

export default CostDashboard;
