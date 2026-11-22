import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileJson2,
  HardDrive,
  Loader2,
  Minimize2,
  Maximize2,
  ShieldCheck,
} from 'lucide-react';
import type { ApiResponse } from '../types/api';

export interface ResponsePanelProps {
  response: ApiResponse | null;
  isLoading: boolean;
  onCopySuccess: (message: string) => void;
}

type ResponseTab = 'pretty' | 'raw' | 'headers';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function getStatusBadgeClasses(status: number): string {
  if (status >= 200 && status < 300) {
    return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
  }
  if (status >= 300 && status < 400) {
    return 'border-sky-500/40 bg-sky-500/15 text-sky-300';
  }
  if (status >= 400 && status < 500) {
    return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
  }
  return 'border-rose-500/40 bg-rose-500/15 text-rose-300';
}

interface JsonTreeNodeProps {
  name?: string;
  value: unknown;
  depth: number;
  defaultExpanded: boolean;
  expandSignal: number;
  isLast: boolean;
}

const JsonTreeNode: React.FC<JsonTreeNodeProps> = ({
  name,
  value,
  depth,
  defaultExpanded,
  expandSignal,
  isLast,
}) => {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);

  React.useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded, expandSignal]);

  const comma = isLast ? '' : ',';
  const indentStyle = { paddingLeft: `${depth * 14}px` };

  if (value === null) {
    return (
      <div style={indentStyle} className="leading-6 hover:bg-zinc-900/60">
        {name !== undefined && <span className="text-sky-300">&quot;{name}&quot;: </span>}
        <span className="italic text-rose-400">null</span>
        <span className="text-zinc-500">{comma}</span>
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <div style={indentStyle} className="leading-6 hover:bg-zinc-900/60">
        {name !== undefined && <span className="text-sky-300">&quot;{name}&quot;: </span>}
        <span className="text-violet-400">{String(value)}</span>
        <span className="text-zinc-500">{comma}</span>
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div style={indentStyle} className="leading-6 hover:bg-zinc-900/60">
        {name !== undefined && <span className="text-sky-300">&quot;{name}&quot;: </span>}
        <span className="text-amber-300">{value}</span>
        <span className="text-zinc-500">{comma}</span>
      </div>
    );
  }

  if (typeof value === 'string') {
    return (
      <div style={indentStyle} className="leading-6 hover:bg-zinc-900/60">
        {name !== undefined && <span className="text-sky-300">&quot;{name}&quot;: </span>}
        <span className="break-all text-emerald-300">{JSON.stringify(value)}</span>
        <span className="text-zinc-500">{comma}</span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries: Array<[string | undefined, unknown]> = isArray
    ? value.map((item) => [undefined, item])
    : Object.entries(value as Record<string, unknown>);

  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';

  if (entries.length === 0) {
    return (
      <div style={indentStyle} className="leading-6 hover:bg-zinc-900/60">
        {name !== undefined && <span className="text-sky-300">&quot;{name}&quot;: </span>}
        <span className="text-zinc-400">
          {openBracket}
          {closeBracket}
        </span>
        <span className="text-zinc-500">{comma}</span>
      </div>
    );
  }

  return (
    <div>
      <div
        style={indentStyle}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex cursor-pointer items-center leading-6 hover:bg-zinc-900/70"
      >
        <span className="mr-1 inline-flex text-zinc-500">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        {name !== undefined && <span className="text-sky-300">&quot;{name}&quot;: </span>}
        <span className="text-zinc-400">{openBracket}</span>
        {!expanded && (
          <>
            <span className="mx-1.5 rounded bg-zinc-800/90 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {entries.length} {isArray ? (entries.length === 1 ? 'item' : 'items') : entries.length === 1 ? 'key' : 'keys'}
            </span>
            <span className="text-zinc-400">{closeBracket}</span>
            <span className="text-zinc-500">{comma}</span>
          </>
        )}
      </div>
      {expanded && (
        <>
          {entries.map(([childKey, childVal], index) => (
            <JsonTreeNode
              key={childKey ?? index}
              name={childKey}
              value={childVal}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
              expandSignal={expandSignal}
              isLast={index === entries.length - 1}
            />
          ))}
          <div style={indentStyle} className="leading-6">
            <span className="ml-4 text-zinc-400">{closeBracket}</span>
            <span className="text-zinc-500">{comma}</span>
          </div>
        </>
      )}
    </div>
  );
};

export const ResponsePanel: React.FC<ResponsePanelProps> = ({
  response,
  isLoading,
  onCopySuccess,
}) => {
  const [activeTab, setActiveTab] = useState<ResponseTab>('pretty');
  const [copied, setCopied] = useState(false);
  const [expandAll, setExpandAll] = useState(true);
  const [expandSignal, setExpandSignal] = useState(0);

  const isJsonData = useMemo(() => {
    if (!response) return false;
    return typeof response.data === 'object' && response.data !== null;
  }, [response]);

  const headerEntries = useMemo(() => {
    if (!response) return [];
    return Object.entries(response.headers);
  }, [response]);

  const formattedText = useMemo(() => {
    if (!response) return '';
    if (isJsonData) {
      return JSON.stringify(response.data, null, 2);
    }
    return response.rawText;
  }, [response, isJsonData]);

  const handleCopy = async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(formattedText);
      setCopied(true);
      onCopySuccess('Response copied to clipboard');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onCopySuccess('Unable to access clipboard');
    }
  };

  const handleDownloadJson = () => {
    if (!response) return;
    const blob = new Blob([formattedText], {
      type: isJsonData ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pulseapi-response-${response.status}-${Date.now()}.${isJsonData ? 'json' : 'txt'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950/60 p-8 text-center">
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-200">Sending request...</p>
          <p className="mt-1 text-xs text-zinc-500">Waiting for upstream server response</p>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950/60 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/80">
          <Activity className="h-6 w-6 text-zinc-500" />
        </div>
        <div className="max-w-sm">
          <p className="text-sm font-medium text-zinc-300">Ready to send</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Enter an endpoint URL or pick a starter request from the sidebar, then press{' '}
            <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
              Ctrl + Enter
            </kbd>{' '}
            to inspect the live response.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950">
      {/* Status & Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/40 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2.5">
          {response.error && response.status === 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              Network Error
            </span>
          ) : (
            <span
              className={`inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-xs font-semibold ${getStatusBadgeClasses(
                response.status
              )}`}
            >
              {response.status} {response.statusText}
            </span>
          )}

          <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400">
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
            {response.durationMs} ms
          </span>

          <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400">
            <HardDrive className="h-3.5 w-3.5 text-indigo-400" />
            {formatBytes(response.sizeBytes)}
          </span>

          {response.viaProxy && (
            <span className="inline-flex items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-indigo-300">
              <ShieldCheck className="h-3 w-3" />
              via /api/proxy
            </span>
          )}
        </div>

        {/* Copy & Download Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-zinc-400" />
            )}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            <Download className="h-3.5 w-3.5 text-cyan-400" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Response Tabs Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-4">
        <div className="flex items-center gap-1">
          {(
            [
              { id: 'pretty', label: 'Pretty JSON' },
              { id: 'raw', label: 'Raw' },
              { id: 'headers', label: 'Headers', count: headerEntries.length },
            ] as Array<{ id: ResponseTab; label: string; count?: number }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'pretty' && isJsonData && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setExpandAll(true);
                setExpandSignal((n) => n + 1);
              }}
              title="Expand all nodes"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            >
              <Maximize2 className="h-3 w-3" />
              Expand
            </button>
            <button
              type="button"
              onClick={() => {
                setExpandAll(false);
                setExpandSignal((n) => n + 1);
              }}
              title="Collapse all nodes"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            >
              <Minimize2 className="h-3 w-3" />
              Collapse
            </button>
          </div>
        )}
      </div>

      {/* Error Banner (if any) */}
      {response.error && (
        <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <div className="space-y-1">
            <p className="font-semibold">Request Failed</p>
            <p className="font-mono text-[11px] text-rose-300/90">{response.error}</p>
          </div>
        </div>
      )}

      {/* Response Body / Headers Viewport */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'pretty' && (
          <>
            {isJsonData ? (
              <div className="font-mono text-xs select-text">
                <JsonTreeNode
                  value={response.data}
                  depth={0}
                  defaultExpanded={expandAll}
                  expandSignal={expandSignal}
                  isLast
                />
              </div>
            ) : response.rawText ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-zinc-200">
                {response.rawText}
              </pre>
            ) : (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <FileJson2 className="h-4 w-4" />
                Empty response body
              </div>
            )}
          </>
        )}

        {activeTab === 'raw' && (
          <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-zinc-300 select-text">
            {response.rawText || '(empty body)'}
          </pre>
        )}

        {activeTab === 'headers' && (
          <div className="overflow-hidden rounded-lg border border-zinc-800/90">
            {headerEntries.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-500">
                No response headers exposed.
              </div>
            ) : (
              <table className="w-full border-collapse text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] text-zinc-400">
                    <th className="w-1/3 px-3 py-2 font-semibold">Header</th>
                    <th className="px-3 py-2 font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {headerEntries.map(([key, value]) => (
                    <tr key={key} className="hover:bg-zinc-900/40">
                      <td className="px-3 py-2 text-cyan-300">{key}</td>
                      <td className="break-all px-3 py-2 text-zinc-300">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
