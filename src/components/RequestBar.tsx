import React, { useMemo } from 'react';
import {
  ChevronDown,
  Code2,
  Globe,
  Loader2,
  Save,
  Send,
  ShieldCheck,
  Square,
} from 'lucide-react';
import type { ApiRequest, Environment, HttpMethod } from '../types/api';
import { extractEnvVarNames, getEnvMap } from '../utils/codeGen';

export interface RequestBarProps {
  request: ApiRequest;
  activeEnvironment: Environment | null;
  useProxy: boolean;
  isLoading: boolean;
  isDirty: boolean;
  urlInputRef: React.RefObject<HTMLInputElement>;
  onMethodChange: (method: HttpMethod) => void;
  onUrlChange: (url: string) => void;
  onToggleProxy: () => void;
  onSend: () => void;
  onCancel: () => void;
  onSave: () => void;
  onOpenCodeModal: () => void;
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: 'text-emerald-400',
  POST: 'text-amber-400',
  PUT: 'text-sky-400',
  PATCH: 'text-violet-400',
  DELETE: 'text-rose-400',
};

export const RequestBar: React.FC<RequestBarProps> = ({
  request,
  activeEnvironment,
  useProxy,
  isLoading,
  isDirty,
  urlInputRef,
  onMethodChange,
  onUrlChange,
  onToggleProxy,
  onSend,
  onCancel,
  onSave,
  onOpenCodeModal,
}) => {
  const envVarsInUrl = useMemo(() => {
    const names = extractEnvVarNames(request.url);
    const map = getEnvMap(activeEnvironment);
    return names.map((name) => ({
      name,
      resolved: Object.prototype.hasOwnProperty.call(map, name),
      value: map[name],
    }));
  }, [request.url, activeEnvironment]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoading) {
      onSend();
    }
  };

  return (
    <div className="border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-3">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
        {/* Method + URL Combined Input */}
        <div className="flex min-w-[260px] flex-1 items-center rounded-xl border border-zinc-800 bg-zinc-900/90 transition-all focus-within:border-cyan-500/60 focus-within:ring-2 focus-within:ring-cyan-500/15">
          <div className="relative flex items-center border-r border-zinc-800">
            <select
              value={request.method}
              onChange={(e) => onMethodChange(e.target.value as HttpMethod)}
              aria-label="HTTP Method"
              className={`cursor-pointer appearance-none bg-transparent py-2.5 pl-3.5 pr-8 font-mono text-xs font-bold outline-none ${METHOD_STYLES[request.method]}`}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m} className="bg-zinc-900 text-zinc-100">
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-zinc-500" />
          </div>

          <input
            ref={urlInputRef}
            type="text"
            value={request.url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://api.example.com/v1/resource or {{BASE_URL}}/posts"
            spellCheck={false}
            className="w-full bg-transparent px-3.5 py-2.5 font-mono text-xs text-zinc-100 placeholder-zinc-500 outline-none"
          />

          {/* Inline {{var}} Status Indicator */}
          {envVarsInUrl.length > 0 && (
            <div className="hidden items-center gap-1 pr-2.5 sm:flex">
              {envVarsInUrl.slice(0, 2).map((item) => (
                <span
                  key={item.name}
                  title={
                    item.resolved
                      ? `${item.name} = ${item.value}`
                      : `Unresolved variable "{{${item.name}}}" in active environment`
                  }
                  className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                    item.resolved
                      ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {`{{${item.name}}}`}
                </span>
              ))}
              {envVarsInUrl.length > 2 && (
                <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                  +{envVarsInUrl.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Direct vs Serverless Proxy Toggle */}
        <button
          type="button"
          onClick={onToggleProxy}
          title={
            useProxy
              ? 'Serverless Proxy enabled (/api/proxy) — bypasses browser CORS restrictions'
              : 'Direct browser fetch — auto-falls back to /api/proxy on CORS failure'
          }
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
            useProxy
              ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300 shadow-glow-indigo'
              : 'border-zinc-800 bg-zinc-900/90 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          {useProxy ? (
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
          ) : (
            <Globe className="h-3.5 w-3.5 text-zinc-400" />
          )}
          <span className="hidden md:inline">{useProxy ? 'Proxy' : 'Direct'}</span>
        </button>

        {/* Code Snippet Button */}
        <button
          type="button"
          onClick={onOpenCodeModal}
          title="Generate cURL, fetch, Axios, or Python code"
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
        >
          <Code2 className="h-3.5 w-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Code</span>
        </button>

        {/* Save Button */}
        <button
          type="button"
          onClick={onSave}
          title="Save Request (Ctrl+S)"
          className="relative inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
        >
          <Save className="h-3.5 w-3.5 text-zinc-400" />
          <span className="hidden sm:inline">Save</span>
          {isDirty && (
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" title="Unsaved changes" />
          )}
        </button>

        {/* Send / Cancel CTA */}
        {isLoading ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Cancel</span>
            <Square className="h-2.5 w-2.5 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            title="Send Request (Ctrl+Enter)"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-2.5 text-xs font-semibold text-white shadow-glow-cyan transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Send</span>
            <kbd className="hidden rounded bg-black/25 px-1.5 py-0.5 font-mono text-[10px] text-cyan-100/90 lg:inline">
              Ctrl↵
            </kbd>
          </button>
        )}
      </form>
    </div>
  );
};
