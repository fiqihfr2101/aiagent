'use client';

import React, { useState, useCallback } from 'react';
import { API_BASE } from '@/utils/api';

// ─── Types ───────────────────────────────────────────────────────

interface ExecutionResult {
  success: boolean;
  language: string;
  code: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

interface CodeExecution {
  language: string;
  code: string;
  auto_executed: boolean;
  result: ExecutionResult | null;
}

interface CodeExecutionCardProps {
  execution: CodeExecution;
  agentColor?: string;
}

// ─── Language Badge Colors ───────────────────────────────────────

const LANGUAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  python: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  shell: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  bash: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  api: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  http: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  javascript: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  typescript: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
};

function getLanguageStyle(lang: string) {
  return LANGUAGE_COLORS[lang.toLowerCase()] || { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30' };
}

// ─── Icons ───────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-3.5 h-3.5 stroke-current">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-3.5 h-3.5 stroke-current">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className={`w-3.5 h-3.5 stroke-current transition-transform ${expanded ? 'rotate-90' : ''}`}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Collapsible Section ─────────────────────────────────────────

function CollapsibleSection({
  title,
  content,
  icon,
  defaultExpanded = false,
  maxHeight = 200,
}: {
  title: string;
  content: string;
  icon: React.ReactNode;
  defaultExpanded?: boolean;
  maxHeight?: number;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!content) return null;

  return (
    <div className="border border-border-custom rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-bg4/50 hover:bg-bg4 transition-colors text-left"
      >
        <ChevronIcon expanded={expanded} />
        {icon}
        <span className="text-[11px] font-medium text-txt2">{title}</span>
        <span className="text-[9px] text-txt3 ml-auto">
          {content.split('\n').length} lines
        </span>
      </button>
      {expanded && (
        <div
          className="overflow-auto bg-bg5 p-3"
          style={{ maxHeight: maxHeight }}
        >
          <pre className="text-[11px] font-mono text-cyan-custom/80 whitespace-pre-wrap break-all">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export default function CodeExecutionCard({ execution, agentColor = '#00D4AA' }: CodeExecutionCardProps) {
  const [copied, setCopied] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const [rerunResult, setRerunResult] = useState<ExecutionResult | null>(null);

  const { language, code, auto_executed, result } = execution;
  const langStyle = getLanguageStyle(language);
  const displayResult = rerunResult || result;

  // Copy code to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  // Re-run code
  const handleRerun = useCallback(async () => {
    setIsRerunning(true);
    try {
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const response = await fetch(API_BASE + '/code/execute', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          language,
          code,
          timeout: 30,
        }),
      });

      if (!response.ok) {
        throw new Error('Execution failed');
      }

      const data = await response.json();
      setRerunResult(data);
    } catch (error) {
      setRerunResult({
        success: false,
        language,
        code,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Re-execution failed',
        exit_code: -1,
        duration_ms: 0,
      });
    } finally {
      setIsRerunning(false);
    }
  }, [language, code]);

  return (
    <div className="border border-border-custom rounded-xl overflow-hidden bg-bg3/50 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg4/30 border-b border-border-custom">
        {/* Language badge */}
        <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold ${langStyle.bg} ${langStyle.text} border ${langStyle.border}`}>
          {language.toUpperCase()}
        </span>

        {/* Status indicator */}
        {displayResult ? (
          displayResult.success ? (
            <span className="flex items-center gap-1 text-[9px] text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Success
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[9px] text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Error
            </span>
          )
        ) : auto_executed === false ? (
          <span className="flex items-center gap-1 text-[9px] text-yellow-400">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            Not executed
          </span>
        ) : null}

        {/* Duration */}
        {displayResult && displayResult.duration_ms > 0 && (
          <span className="text-[9px] text-txt3 ml-auto">
            {displayResult.duration_ms}ms
          </span>
        )}

        {/* Exit code */}
        {displayResult && displayResult.exit_code !== 0 && displayResult.exit_code !== -1 && (
          <span className="text-[9px] text-txt3">
            exit: {displayResult.exit_code}
          </span>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-1.5 py-1 rounded-md text-txt3 hover:text-cyan-custom hover:bg-cyan-custom/10 transition-colors"
            title={copied ? 'Copied!' : 'Copy code'}
          >
            <CopyIcon />
            <span className="text-[9px]">{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button
            onClick={handleRerun}
            disabled={isRerunning}
            className="flex items-center gap-1 px-1.5 py-1 rounded-md text-txt3 hover:text-green-400 hover:bg-green-400/10 transition-colors disabled:opacity-50"
            title="Re-run code"
          >
            {isRerunning ? (
              <div className="w-3.5 h-3.5 border-2 border-txt3/30 border-t-green-400 rounded-full animate-spin" />
            ) : (
              <PlayIcon />
            )}
            <span className="text-[9px]">Re-run</span>
          </button>
        </div>
      </div>

      {/* Code block */}
      <div className="p-3 bg-bg5/50">
        <pre className="text-[11px] font-mono text-cyan-custom/80 whitespace-pre-wrap break-all overflow-auto max-h-[200px]">
          {code}
        </pre>
      </div>

      {/* Results */}
      {displayResult && (
        <div className="px-3 pb-3 space-y-2">
          {/* Stdout */}
          <CollapsibleSection
            title="Output (stdout)"
            content={displayResult.stdout}
            icon={<span className="text-[10px]">📤</span>}
            defaultExpanded={!!displayResult.stdout && displayResult.success}
          />

          {/* Stderr */}
          <CollapsibleSection
            title="Errors (stderr)"
            content={displayResult.stderr}
            icon={<span className="text-[10px]">⚠️</span>}
            defaultExpanded={!!displayResult.stderr && !displayResult.success}
          />
        </div>
      )}

      {/* Not executed hint */}
      {auto_executed === false && !displayResult && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 p-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <span className="text-[10px]">⚠️</span>
            <span className="text-[10px] text-yellow-400/80">
              Code was not auto-executed for safety. Click Re-run to execute manually.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
