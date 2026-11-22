import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ApiRequest, AuthType, BodyType, KeyValueItem } from '../types/api';
import { createKeyValueItem } from '../utils/storage';

export interface RequestTabsProps {
  request: ApiRequest;
  onChange: (updater: (prev: ApiRequest) => ApiRequest) => void;
  onParamsChange: (params: KeyValueItem[]) => void;
}

type EditorTab = 'params' | 'headers' | 'auth' | 'body';

const COMMON_HEADERS: Array<{ key: string; value: string }> = [
  { key: 'Content-Type', value: 'application/json' },
  { key: 'Accept', value: 'application/json' },
  { key: 'Cache-Control', value: 'no-cache' },
  { key: 'User-Agent', value: 'PulseAPI-Studio/1.0' },
];

export const RequestTabs: React.FC<RequestTabsProps> = ({
  request,
  onChange,
  onParamsChange,
}) => {
  const [activeTab, setActiveTab] = useState<EditorTab>('params');
  const [showBasicPass, setShowBasicPass] = useState(false);

  const activeParamCount = request.params.filter((p) => p.enabled && p.key.trim()).length;
  const activeHeaderCount = request.headers.filter((h) => h.enabled && h.key.trim()).length;
  const hasAuth = request.auth.type !== 'none';
  const hasBody = request.bodyType !== 'none';

  const jsonValidation = useMemo(() => {
    if (request.bodyType !== 'json') return { valid: true, error: '' };
    const trimmed = request.bodyJson.trim();
    if (!trimmed) return { valid: true, error: '' };
    // Replace {{var}} placeholders with valid JSON string tokens for syntax checking
    const sanitized = trimmed.replace(/"?\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}"?/g, '"__var__"');
    try {
      JSON.parse(sanitized);
      return { valid: true, error: '' };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Invalid JSON syntax',
      };
    }
  }, [request.bodyType, request.bodyJson]);

  const handleBeautifyJson = () => {
    try {
      const parsed = JSON.parse(request.bodyJson);
      const formatted = JSON.stringify(parsed, null, 2);
      onChange((prev) => ({ ...prev, bodyJson: formatted }));
    } catch {
      // Invalid JSON — error message is already shown inline
    }
  };

  const updateKeyValueList = (
    list: KeyValueItem[],
    id: string,
    field: 'key' | 'value' | 'enabled',
    val: string | boolean
  ): KeyValueItem[] => list.map((item) => (item.id === id ? { ...item, [field]: val } : item));

  const renderKeyValueEditor = (
    items: KeyValueItem[],
    onUpdate: (next: KeyValueItem[]) => void,
    keyPlaceholder: string,
    valuePlaceholder: string
  ) => (
    <div className="space-y-2">
      <div className="grid grid-cols-[26px_1fr_1.3fr_32px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <span />
        <span>Key</span>
        <span>Value</span>
        <span />
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800/90 py-5 text-center text-xs text-zinc-500">
          No entries yet. Click &ldquo;Add Row&rdquo; to insert one.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[26px_1fr_1.3fr_32px] items-center gap-2"
            >
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) =>
                  onUpdate(updateKeyValueList(items, item.id, 'enabled', e.target.checked))
                }
                className="h-3.5 w-3.5 accent-cyan-500"
              />
              <input
                type="text"
                value={item.key}
                onChange={(e) =>
                  onUpdate(updateKeyValueList(items, item.id, 'key', e.target.value))
                }
                placeholder={keyPlaceholder}
                spellCheck={false}
                className={`rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 font-mono text-xs outline-none focus:border-cyan-500/60 ${
                  item.enabled ? 'text-zinc-100' : 'text-zinc-500 line-through'
                }`}
              />
              <input
                type="text"
                value={item.value}
                onChange={(e) =>
                  onUpdate(updateKeyValueList(items, item.id, 'value', e.target.value))
                }
                placeholder={valuePlaceholder}
                spellCheck={false}
                className={`rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 font-mono text-xs outline-none focus:border-cyan-500/60 ${
                  item.enabled ? 'text-cyan-200' : 'text-zinc-500 line-through'
                }`}
              />
              <button
                type="button"
                onClick={() => onUpdate(items.filter((row) => row.id !== item.id))}
                title="Remove row"
                className="flex items-center justify-center rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onUpdate([...items, createKeyValueItem()])}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
      >
        <Plus className="h-3.5 w-3.5 text-cyan-400" />
        Add Row
      </button>
    </div>
  );

  const handleQuickAddHeader = (key: string, value: string) => {
    onChange((prev) => {
      const exists = prev.headers.some((h) => h.key.toLowerCase() === key.toLowerCase());
      if (exists) {
        return {
          ...prev,
          headers: prev.headers.map((h) =>
            h.key.toLowerCase() === key.toLowerCase() ? { ...h, value, enabled: true } : h
          ),
        };
      }
      return {
        ...prev,
        headers: [...prev.headers, createKeyValueItem(key, value, true)],
      };
    });
  };

  const handleJsonKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const nextValue = `${request.bodyJson.slice(0, start)}  ${request.bodyJson.slice(end)}`;
      onChange((prev) => ({ ...prev, bodyJson: nextValue }));
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950">
      {/* Tab Strip */}
      <div className="flex items-center gap-1 border-b border-zinc-800/80 px-4">
        {(
          [
            { id: 'params', label: 'Params', badge: activeParamCount || null },
            { id: 'headers', label: 'Headers', badge: activeHeaderCount || null },
            { id: 'auth', label: 'Auth', dot: hasAuth },
            { id: 'body', label: 'Body', dot: hasBody },
          ] as Array<{ id: EditorTab; label: string; badge?: number | null; dot?: boolean }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge ? (
              <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                {tab.badge}
              </span>
            ) : null}
            {tab.dot ? <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> : null}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'params' && (
          <div>
            <p className="mb-3 text-[11px] text-zinc-500">
              Query parameters are bi-directionally synced with the URL bar above.
            </p>
            {renderKeyValueEditor(request.params, onParamsChange, 'param_name', 'value')}
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-500">Quick add:</span>
              {COMMON_HEADERS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handleQuickAddHeader(preset.key, preset.value)}
                  className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
                >
                  + {preset.key}
                </button>
              ))}
            </div>
            {renderKeyValueEditor(
              request.headers,
              (next) => onChange((prev) => ({ ...prev, headers: next })),
              'Header-Name',
              'value or {{API_KEY}}'
            )}
          </div>
        )}

        {activeTab === 'auth' && (
          <div className="max-w-xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'none', label: 'No Auth' },
                  { id: 'bearer', label: 'Bearer Token' },
                  { id: 'apikey', label: 'API Key' },
                  { id: 'basic', label: 'Basic Auth' },
                ] as Array<{ id: AuthType; label: string }>
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      auth: { ...prev.auth, type: option.id },
                    }))
                  }
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    request.auth.type === option.id
                      ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {request.auth.type === 'none' && (
              <p className="text-xs text-zinc-500">
                This request does not attach an automatic authorization header or query key.
              </p>
            )}

            {request.auth.type === 'bearer' && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Token (sent as <code className="text-cyan-400">Authorization: Bearer ...</code>)
                </label>
                <input
                  type="text"
                  value={request.auth.bearerToken}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      auth: { ...prev.auth, bearerToken: e.target.value },
                    }))
                  }
                  placeholder="eyJhbGciOiJIUzI1NiIs... or {{API_KEY}}"
                  spellCheck={false}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-cyan-500/60"
                />
              </div>
            )}

            {request.auth.type === 'apikey' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-300">Key Name</label>
                  <input
                    type="text"
                    value={request.auth.apiKeyName}
                    onChange={(e) =>
                      onChange((prev) => ({
                        ...prev,
                        auth: { ...prev.auth, apiKeyName: e.target.value },
                      }))
                    }
                    placeholder="X-API-Key"
                    spellCheck={false}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-cyan-500/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-300">Add To</label>
                  <select
                    value={request.auth.apiKeyIn}
                    onChange={(e) =>
                      onChange((prev) => ({
                        ...prev,
                        auth: {
                          ...prev.auth,
                          apiKeyIn: e.target.value as 'header' | 'query',
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-500/60"
                  >
                    <option value="header">Request Header</option>
                    <option value="query">Query Parameter</option>
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-medium text-zinc-300">Value</label>
                  <input
                    type="text"
                    value={request.auth.apiKeyValue}
                    onChange={(e) =>
                      onChange((prev) => ({
                        ...prev,
                        auth: { ...prev.auth, apiKeyValue: e.target.value },
                      }))
                    }
                    placeholder="{{API_KEY}}"
                    spellCheck={false}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-cyan-500/60"
                  />
                </div>
              </div>
            )}

            {request.auth.type === 'basic' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-300">Username</label>
                  <input
                    type="text"
                    value={request.auth.basicUsername}
                    onChange={(e) =>
                      onChange((prev) => ({
                        ...prev,
                        auth: { ...prev.auth, basicUsername: e.target.value },
                      }))
                    }
                    placeholder="username"
                    spellCheck={false}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-cyan-500/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-300">Password</label>
                  <div className="relative">
                    <input
                      type={showBasicPass ? 'text' : 'password'}
                      value={request.auth.basicPassword}
                      onChange={(e) =>
                        onChange((prev) => ({
                          ...prev,
                          auth: { ...prev.auth, basicPassword: e.target.value },
                        }))
                      }
                      placeholder="password"
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-3 pr-9 font-mono text-xs text-zinc-100 outline-none focus:border-cyan-500/60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBasicPass((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                    >
                      {showBasicPass ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'body' && (
          <div className="flex h-full flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {(
                  [
                    { id: 'none', label: 'None' },
                    { id: 'json', label: 'JSON' },
                    { id: 'urlencoded', label: 'Form URL-Encoded' },
                  ] as Array<{ id: BodyType; label: string }>
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onChange((prev) => ({ ...prev, bodyType: option.id }))}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      request.bodyType === option.id
                        ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {request.bodyType === 'json' && (
                <div className="flex items-center gap-2">
                  {jsonValidation.valid ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Valid JSON
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-rose-400">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Syntax Error
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleBeautifyJson}
                    disabled={!jsonValidation.valid}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-cyan-300 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Beautify JSON
                  </button>
                </div>
              )}
            </div>

            {request.bodyType === 'none' && (
              <p className="text-xs text-zinc-500">
                No request body will be sent. Switch to JSON or Form URL-Encoded for POST, PUT, or
                PATCH requests.
              </p>
            )}

            {request.bodyType === 'json' && (
              <div className="flex flex-1 flex-col gap-2">
                <textarea
                  value={request.bodyJson}
                  onChange={(e) => onChange((prev) => ({ ...prev, bodyJson: e.target.value }))}
                  onKeyDown={handleJsonKeyDown}
                  spellCheck={false}
                  rows={9}
                  placeholder={'{\n  "title": "Hello PulseAPI",\n  "completed": false\n}'}
                  className={`min-h-[160px] flex-1 resize-y rounded-lg border bg-zinc-900/90 p-3 font-mono text-xs leading-relaxed text-zinc-100 placeholder-zinc-600 outline-none ${
                    jsonValidation.valid
                      ? 'border-zinc-800 focus:border-cyan-500/60'
                      : 'border-rose-500/60 focus:border-rose-400'
                  }`}
                />
                {!jsonValidation.valid && (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 font-mono text-[11px] text-rose-300">
                    {jsonValidation.error}
                  </div>
                )}
              </div>
            )}

            {request.bodyType === 'urlencoded' &&
              renderKeyValueEditor(
                request.bodyForm,
                (next) => onChange((prev) => ({ ...prev, bodyForm: next })),
                'field_name',
                'field_value'
              )}
          </div>
        )}
      </div>
    </div>
  );
};
