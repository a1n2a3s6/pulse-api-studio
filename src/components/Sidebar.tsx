import React, { useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ApiRequest, Collection, Environment, HistoryEntry, HttpMethod } from '../types/api';
import { createKeyValueItem, generateId } from '../utils/storage';

export interface SidebarProps {
  collections: Collection[];
  history: HistoryEntry[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  activeRequestId: string;
  isCollapsed: boolean;
  width: number;
  onToggleCollapse: () => void;
  onResizeStart: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSelectRequest: (request: ApiRequest) => void;
  onCreateCollection: (name: string) => void;
  onDeleteCollection: (collectionId: string) => void;
  onCreateRequestInCollection: (collectionId: string) => void;
  onDeleteRequest: (collectionId: string, requestId: string) => void;
  onClearHistory: () => void;
  onSelectEnvironment: (envId: string | null) => void;
  onSaveEnvironments: (environments: Environment[]) => void;
  onExportWorkspace: () => void;
  onImportWorkspace: (file: File) => void;
}

const METHOD_BADGE_COLORS: Record<HttpMethod, string> = {
  GET: 'text-emerald-400',
  POST: 'text-amber-400',
  PUT: 'text-sky-400',
  PATCH: 'text-violet-400',
  DELETE: 'text-rose-400',
};

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export const Sidebar: React.FC<SidebarProps> = ({
  collections,
  history,
  environments,
  activeEnvironmentId,
  activeRequestId,
  isCollapsed,
  width,
  onToggleCollapse,
  onResizeStart,
  onSelectRequest,
  onCreateCollection,
  onDeleteCollection,
  onCreateRequestInCollection,
  onDeleteRequest,
  onClearHistory,
  onSelectEnvironment,
  onSaveEnvironments,
  onExportWorkspace,
  onImportWorkspace,
}) => {
  const [activeTab, setActiveTab] = useState<'collections' | 'history'>('collections');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const c of collections) {
      initial[c.id] = true;
    }
    return initial;
  });
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [draftEnvs, setDraftEnvs] = useState<Environment[]>(environments);
  const [selectedDraftEnvId, setSelectedDraftEnvId] = useState<string>(
    activeEnvironmentId ?? environments[0]?.id ?? ''
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredCollections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return collections;
    return collections
      .map((col) => {
        const colMatches = col.name.toLowerCase().includes(q);
        const matchingReqs = col.requests.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.url.toLowerCase().includes(q) ||
            r.method.toLowerCase().includes(q)
        );
        if (colMatches) return col;
        if (matchingReqs.length > 0) return { ...col, requests: matchingReqs };
        return null;
      })
      .filter((c): c is Collection => c !== null);
  }, [collections, searchQuery]);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (h) =>
        h.request.name.toLowerCase().includes(q) ||
        h.request.url.toLowerCase().includes(q) ||
        h.request.method.toLowerCase().includes(q) ||
        String(h.status).includes(q)
    );
  }, [history, searchQuery]);

  const toggleFolder = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    onCreateCollection(trimmed);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const openEnvModal = () => {
    setDraftEnvs(structuredClone(environments));
    setSelectedDraftEnvId(activeEnvironmentId ?? environments[0]?.id ?? '');
    setIsEnvModalOpen(true);
  };

  const activeDraftEnv = draftEnvs.find((e) => e.id === selectedDraftEnvId) ?? draftEnvs[0] ?? null;

  const handleAddEnv = () => {
    const newEnv: Environment = {
      id: generateId('env'),
      name: `Environment ${draftEnvs.length + 1}`,
      variables: [createKeyValueItem('BASE_URL', 'https://api.example.com', true)],
    };
    setDraftEnvs((prev) => [...prev, newEnv]);
    setSelectedDraftEnvId(newEnv.id);
  };

  const handleDeleteEnv = (id: string) => {
    setDraftEnvs((prev) => {
      const next = prev.filter((e) => e.id !== id);
      if (selectedDraftEnvId === id) {
        setSelectedDraftEnvId(next[0]?.id ?? '');
      }
      return next;
    });
  };

  const handleUpdateEnvName = (id: string, name: string) => {
    setDraftEnvs((prev) => prev.map((e) => (e.id === id ? { ...e, name } : e)));
  };

  const handleUpdateEnvVar = (
    envId: string,
    varId: string,
    field: 'key' | 'value' | 'enabled',
    val: string | boolean
  ) => {
    setDraftEnvs((prev) =>
      prev.map((e) =>
        e.id === envId
          ? {
              ...e,
              variables: e.variables.map((v) => (v.id === varId ? { ...v, [field]: val } : v)),
            }
          : e
      )
    );
  };

  const handleAddEnvVar = (envId: string) => {
    setDraftEnvs((prev) =>
      prev.map((e) =>
        e.id === envId ? { ...e, variables: [...e.variables, createKeyValueItem()] } : e
      )
    );
  };

  const handleDeleteEnvVar = (envId: string, varId: string) => {
    setDraftEnvs((prev) =>
      prev.map((e) =>
        e.id === envId ? { ...e, variables: e.variables.filter((v) => v.id !== varId) } : e
      )
    );
  };

  const handleSaveEnvModal = () => {
    onSaveEnvironments(draftEnvs);
    setIsEnvModalOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportWorkspace(file);
      e.target.value = '';
    }
  };

  if (isCollapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center justify-between border-r border-zinc-800/80 bg-zinc-950 py-3">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand Sidebar"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-cyan-400"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('collections');
              onToggleCollapse();
            }}
            title="Collections"
            className={`rounded-lg p-2 transition-colors ${
              activeTab === 'collections'
                ? 'bg-cyan-500/10 text-cyan-400'
                : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <Layers className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              onToggleCollapse();
            }}
            title="History"
            className={`rounded-lg p-2 transition-colors ${
              activeTab === 'history'
                ? 'bg-cyan-500/10 text-cyan-400'
                : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <Clock className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={openEnvModal}
          title="Manage Environments"
          className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-cyan-400"
        >
          <Globe className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <>
      <aside
        style={{ width: `${width}px` }}
        className="relative flex h-full shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950 select-none"
      >
        {/* Environment Selector Bar */}
        <div className="flex items-center gap-1.5 border-b border-zinc-800/80 px-3 py-2.5">
          <div className="relative flex flex-1 items-center">
            <Globe className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-cyan-400" />
            <select
              value={activeEnvironmentId ?? ''}
              onChange={(e) => onSelectEnvironment(e.target.value || null)}
              aria-label="Active Environment"
              className="w-full appearance-none rounded-lg border border-zinc-800 bg-zinc-900/90 py-1.5 pl-8 pr-7 text-xs font-medium text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-cyan-500/60"
            >
              <option value="">No Environment</option>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-zinc-500" />
          </div>
          <button
            type="button"
            onClick={openEnvModal}
            title="Manage Environment Variables"
            className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-1.5 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-cyan-400"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse Sidebar"
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* Collections / History Tabs */}
        <div className="grid grid-cols-2 border-b border-zinc-800/80 px-2 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('collections')}
            className={`flex items-center justify-center gap-1.5 border-b-2 pb-2 text-xs font-semibold transition-colors ${
              activeTab === 'collections'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Collections
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center justify-center gap-1.5 border-b-2 pb-2 text-xs font-semibold transition-colors ${
              activeTab === 'history'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            History
            {history.length > 0 && (
              <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {history.length}
              </span>
            )}
          </button>
        </div>

        {/* Search & Action Row */}
        <div className="flex items-center gap-1.5 border-b border-zinc-800/60 px-3 py-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'collections' ? 'Filter collections...' : 'Filter history...'
              }
              className="w-full rounded-md border border-zinc-800/90 bg-zinc-900/70 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-cyan-500/50"
            />
          </div>
          {activeTab === 'collections' ? (
            <button
              type="button"
              onClick={() => setIsCreatingFolder((v) => !v)}
              title="New Collection Folder"
              className="rounded-md border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          ) : (
            history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                title="Clear History"
                className="rounded-md border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 transition-colors hover:border-rose-500/40 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )
          )}
        </div>

        {/* Inline New Folder Form */}
        {activeTab === 'collections' && isCreatingFolder && (
          <form
            onSubmit={handleCreateFolderSubmit}
            className="flex items-center gap-1.5 border-b border-zinc-800/60 bg-zinc-900/50 px-3 py-2"
          >
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name..."
              className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              className="rounded bg-cyan-600 px-2 py-1 text-xs font-medium text-white hover:bg-cyan-500"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }}
              className="rounded p-1 text-zinc-500 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </form>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {activeTab === 'collections' ? (
            filteredCollections.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-zinc-500">
                No collections match your filter.
              </div>
            ) : (
              <div className="space-y-1">
                {filteredCollections.map((col) => {
                  const isExpanded = expandedIds[col.id] ?? true;
                  return (
                    <div key={col.id} className="rounded-lg">
                      <div className="group flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900">
                        <button
                          type="button"
                          onClick={() => toggleFolder(col.id)}
                          className="flex flex-1 items-center gap-1.5 overflow-hidden text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                          )}
                          {isExpanded ? (
                            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-cyan-400/90" />
                          ) : (
                            <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                          )}
                          <span className="truncate">{col.name}</span>
                          <span className="ml-1 text-[10px] text-zinc-600">
                            {col.requests.length}
                          </span>
                        </button>
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => onCreateRequestInCollection(col.id)}
                            title="Add Request"
                            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-cyan-400"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteCollection(col.id)}
                            title="Delete Collection"
                            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-rose-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-0.5 space-y-0.5 pl-4">
                          {col.requests.length === 0 ? (
                            <div className="px-3 py-1.5 text-[11px] italic text-zinc-600">
                              Empty collection
                            </div>
                          ) : (
                            col.requests.map((req) => {
                              const isActive = req.id === activeRequestId;
                              return (
                                <div
                                  key={req.id}
                                  className={`group flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors ${
                                    isActive
                                      ? 'bg-cyan-500/10 text-cyan-200 ring-1 ring-inset ring-cyan-500/30'
                                      : 'text-zinc-400 hover:bg-zinc-900/90 hover:text-zinc-200'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => onSelectRequest(req)}
                                    className="flex flex-1 items-center gap-2 overflow-hidden text-left"
                                  >
                                    <span
                                      className={`w-10 shrink-0 font-mono text-[10px] font-bold ${METHOD_BADGE_COLORS[req.method]}`}
                                    >
                                      {req.method}
                                    </span>
                                    <span className="truncate">{req.name}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteRequest(col.id, req.id)}
                                    title="Delete Request"
                                    className="rounded p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-rose-400 group-hover:opacity-100"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : filteredHistory.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-zinc-500">
              No request history yet. Send a request to see it logged here.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredHistory.map((entry) => {
                const statusColor =
                  entry.status >= 200 && entry.status < 300
                    ? 'text-emerald-400'
                    : entry.status >= 300 && entry.status < 400
                      ? 'text-sky-400'
                      : entry.status >= 400 && entry.status < 500
                        ? 'text-amber-400'
                        : 'text-rose-400';

                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onSelectRequest(entry.request)}
                    className="flex w-full flex-col gap-1 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:border-zinc-800 hover:bg-zinc-900/90"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-[10px] font-bold ${METHOD_BADGE_COLORS[entry.request.method]}`}
                      >
                        {entry.request.method}
                      </span>
                      <div className="flex items-center gap-2 font-mono text-[10px]">
                        <span className={statusColor}>{entry.status || 'ERR'}</span>
                        <span className="text-zinc-600">{entry.durationMs}ms</span>
                      </div>
                    </div>
                    <div className="truncate font-mono text-[11px] text-zinc-300">
                      {entry.request.url || entry.request.name}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-600">
                      <span>{formatRelativeTime(entry.timestamp)}</span>
                      {entry.viaProxy && (
                        <span className="rounded bg-indigo-500/15 px-1 text-[9px] text-indigo-300">
                          PROXY
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Workspace Export / Import Footer */}
        <div className="flex items-center gap-2 border-t border-zinc-800/80 px-3 py-2.5">
          <button
            type="button"
            onClick={onExportWorkspace}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            <Download className="h-3.5 w-3.5 text-cyan-400" />
            Export
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-400" />
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Right Resize Handle */}
        <div
          onMouseDown={onResizeStart}
          title="Drag to resize sidebar"
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-cyan-500/50"
        />
      </aside>

      {/* Environment Manager Modal */}
      {isEnvModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setIsEnvModalOpen(false)}
        >
          <div
            className="flex h-[520px] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-zinc-100">Environment Manager</h2>
                <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                  {'Use {{VARIABLE}} syntax'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsEnvModalOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Env List */}
              <div className="flex w-52 flex-col border-r border-zinc-800 bg-zinc-900/40 p-3">
                <button
                  type="button"
                  onClick={handleAddEnv}
                  className="mb-3 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-700 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:border-cyan-500/60 hover:bg-cyan-500/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Environment
                </button>
                <div className="flex-1 space-y-1 overflow-y-auto">
                  {draftEnvs.map((env) => (
                    <div
                      key={env.id}
                      className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                        activeDraftEnv?.id === env.id
                          ? 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/30'
                          : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDraftEnvId(env.id)}
                        className="flex-1 truncate text-left font-medium"
                      >
                        {env.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEnv(env.id)}
                        className="rounded p-1 text-zinc-500 opacity-0 hover:text-rose-400 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Variables Editor */}
              <div className="flex flex-1 flex-col overflow-hidden p-4">
                {activeDraftEnv ? (
                  <>
                    <div className="mb-3 flex items-center gap-3">
                      <label className="text-xs font-medium text-zinc-400">Name</label>
                      <input
                        type="text"
                        value={activeDraftEnv.name}
                        onChange={(e) => handleUpdateEnvName(activeDraftEnv.id, e.target.value)}
                        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div className="mb-2 grid grid-cols-[28px_1fr_1.4fr_32px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      <span />
                      <span>Variable</span>
                      <span>Value</span>
                      <span />
                    </div>

                    <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                      {activeDraftEnv.variables.map((v) => (
                        <div
                          key={v.id}
                          className="grid grid-cols-[28px_1fr_1.4fr_32px] items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            checked={v.enabled}
                            onChange={(e) =>
                              handleUpdateEnvVar(activeDraftEnv.id, v.id, 'enabled', e.target.checked)
                            }
                            className="h-3.5 w-3.5 accent-cyan-500"
                          />
                          <input
                            type="text"
                            value={v.key}
                            onChange={(e) =>
                              handleUpdateEnvVar(activeDraftEnv.id, v.id, 'key', e.target.value)
                            }
                            placeholder="BASE_URL"
                            className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-cyan-300 placeholder-zinc-600 outline-none focus:border-cyan-500"
                          />
                          <input
                            type="text"
                            value={v.value}
                            onChange={(e) =>
                              handleUpdateEnvVar(activeDraftEnv.id, v.id, 'value', e.target.value)
                            }
                            placeholder="https://api.example.com"
                            className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-cyan-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteEnvVar(activeDraftEnv.id, v.id)}
                            className="flex items-center justify-center rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleAddEnvVar(activeDraftEnv.id)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5 text-cyan-400" />
                        Add Variable
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">
                    Create an environment to manage variables.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">
              <button
                type="button"
                onClick={() => setIsEnvModalOpen(false)}
                className="rounded-lg border border-zinc-800 px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEnvModal}
                className="rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-1.5 text-xs font-semibold text-white shadow-glow-cyan transition-opacity hover:opacity-90"
              >
                Save Environments
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
