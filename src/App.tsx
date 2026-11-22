import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Info,
  Plus,
  Save,
  X,
} from 'lucide-react';
import type {
  ApiRequest,
  ApiResponse,
  Collection,
  Environment,
  HistoryEntry,
  HttpMethod,
  KeyValueItem,
  ToastMessage,
  WorkspaceTab,
} from './types/api';
import { resolveRequest } from './utils/codeGen';
import {
  createEmptyRequest,
  createKeyValueItem,
  exportWorkspaceJson,
  generateId,
  loadActiveEnvironmentId,
  loadCollections,
  loadEnvironments,
  loadHistory,
  loadProxyPreference,
  parseWorkspaceImport,
  saveActiveEnvironmentId,
  saveCollections,
  saveEnvironments,
  saveHistory,
  saveProxyPreference,
} from './utils/storage';
import { Sidebar } from './components/Sidebar';
import { RequestBar } from './components/RequestBar';
import { RequestTabs } from './components/RequestTabs';
import { ResponsePanel } from './components/ResponsePanel';
import { CodeModal } from './components/CodeModal';

const METHOD_DOT_COLORS: Record<HttpMethod, string> = {
  GET: 'bg-emerald-400',
  POST: 'bg-amber-400',
  PUT: 'bg-sky-400',
  PATCH: 'bg-violet-400',
  DELETE: 'bg-rose-400',
};

const METHOD_TEXT_COLORS: Record<HttpMethod, string> = {
  GET: 'text-emerald-400',
  POST: 'text-amber-400',
  PUT: 'text-sky-400',
  PATCH: 'text-violet-400',
  DELETE: 'text-rose-400',
};

function parseQueryParamsFromUrl(url: string, existingParams: KeyValueItem[]): KeyValueItem[] {
  const qIndex = url.indexOf('?');
  const disabledExisting = existingParams.filter((p) => !p.enabled);

  if (qIndex === -1) {
    return disabledExisting;
  }

  const queryString = url.slice(qIndex + 1).split('#')[0];
  if (!queryString) {
    return disabledExisting;
  }

  const enabledExisting = existingParams.filter((p) => p.enabled);
  const parsed: KeyValueItem[] = [];
  const pairs = queryString.split('&');

  pairs.forEach((pair, idx) => {
    if (!pair) return;
    const eqIdx = pair.indexOf('=');
    const rawKey = eqIdx === -1 ? pair : pair.slice(0, eqIdx);
    const rawVal = eqIdx === -1 ? '' : pair.slice(eqIdx + 1);
    let key = rawKey;
    let value = rawVal;
    try {
      key = decodeURIComponent(rawKey);
      value = decodeURIComponent(rawVal);
    } catch {
      // Preserve raw string if contains partial encoding or {{vars}}
    }
    const reusableId = enabledExisting[idx]?.id ?? generateId('kv');
    parsed.push({ id: reusableId, key, value, enabled: true });
  });

  return [...parsed, ...disabledExisting];
}

function buildUrlWithParams(currentUrl: string, params: KeyValueItem[]): string {
  const hashSplit = currentUrl.split('#');
  const hashSuffix = hashSplit.length > 1 ? `#${hashSplit.slice(1).join('#')}` : '';
  const baseWithoutHash = hashSplit[0];
  const qIndex = baseWithoutHash.indexOf('?');
  const baseUrl = qIndex === -1 ? baseWithoutHash : baseWithoutHash.slice(0, qIndex);

  const enabled = params.filter((p) => p.enabled && p.key.trim().length > 0);
  if (enabled.length === 0) {
    return `${baseUrl}${hashSuffix}`;
  }

  const queryParts = enabled.map((p) => {
    const encodedKey = encodeURIComponent(p.key.trim());
    // Keep {{env_var}} readable in URL bar while encoding standard special chars
    const encodedVal = /\{\{.*?\}\}/.test(p.value)
      ? p.value.replace(/&/g, '%26').replace(/#/g, '%23')
      : encodeURIComponent(p.value);
    return `${encodedKey}=${encodedVal}`;
  });

  return `${baseUrl}?${queryParts.join('&')}${hashSuffix}`;
}

interface ProxyApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  durationMs: number;
  sizeBytes: number;
  error?: string;
}

export default function App() {
  const [collections, setCollections] = useState<Collection[]>(() => loadCollections());
  const [environments, setEnvironments] = useState<Environment[]>(() => loadEnvironments());
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string | null>(() =>
    loadActiveEnvironmentId()
  );
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [useProxy, setUseProxy] = useState<boolean>(() => loadProxyPreference());

  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => {
    const initialCollections = loadCollections();
    const firstRequest = initialCollections[0]?.requests[0] ?? createEmptyRequest();
    return [
      {
        tabId: generateId('tab'),
        request: structuredClone(firstRequest),
        response: null,
        isDirty: false,
        isLoading: false,
      },
    ];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].tabId);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [saveModalState, setSaveModalState] = useState<{
    open: boolean;
    name: string;
    collectionId: string;
  }>({ open: false, name: '', collectionId: '' });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isResizingRef = useRef(false);

  const activeTab = useMemo(
    () => tabs.find((t) => t.tabId === activeTabId) ?? tabs[0],
    [tabs, activeTabId]
  );

  const activeEnvironment = useMemo(
    () => environments.find((e) => e.id === activeEnvironmentId) ?? null,
    [environments, activeEnvironmentId]
  );

  // Persist workspace state
  useEffect(() => {
    saveCollections(collections);
  }, [collections]);

  useEffect(() => {
    saveEnvironments(environments);
  }, [environments]);

  useEffect(() => {
    saveActiveEnvironmentId(activeEnvironmentId);
  }, [activeEnvironmentId]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    saveProxyPreference(useProxy);
  }, [useProxy]);

  const addToast = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = generateId('toast');
      setToasts((prev) => [...prev.slice(-3), { id, type, title, description }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3600);
    },
    []
  );

  // Sidebar resize listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const clamped = Math.min(440, Math.max(220, e.clientX));
      setSidebarWidth(clamped);
    };
    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
  };

  const updateActiveRequest = useCallback(
    (updater: (prev: ApiRequest) => ApiRequest) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.tabId === activeTab.tabId
            ? { ...tab, request: updater(tab.request), isDirty: true }
            : tab
        )
      );
    },
    [activeTab.tabId]
  );

  const handleUrlChange = useCallback(
    (nextUrl: string) => {
      updateActiveRequest((prev) => ({
        ...prev,
        url: nextUrl,
        params: parseQueryParamsFromUrl(nextUrl, prev.params),
      }));
    },
    [updateActiveRequest]
  );

  const handleParamsChange = useCallback(
    (nextParams: KeyValueItem[]) => {
      updateActiveRequest((prev) => ({
        ...prev,
        params: nextParams,
        url: buildUrlWithParams(prev.url, nextParams),
      }));
    },
    [updateActiveRequest]
  );

  const handleOpenRequestInTab = useCallback((req: ApiRequest) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.request.id === req.id);
      if (existing) {
        setActiveTabId(existing.tabId);
        return prev;
      }
      const newTab: WorkspaceTab = {
        tabId: generateId('tab'),
        request: structuredClone(req),
        response: null,
        isDirty: false,
        isLoading: false,
      };
      setActiveTabId(newTab.tabId);
      return [...prev, newTab];
    });
  }, []);

  const handleNewTab = useCallback(() => {
    const newReq = createEmptyRequest({
      url: '{{BASE_URL}}/posts/1',
    });
    const newTab: WorkspaceTab = {
      tabId: generateId('tab'),
      request: newReq,
      response: null,
      isDirty: true,
      isLoading: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.tabId);
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const controller = abortControllersRef.current.get(tabId);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(tabId);
      }

      setTabs((prev) => {
        if (prev.length === 1) {
          const freshTab: WorkspaceTab = {
            tabId: generateId('tab'),
            request: createEmptyRequest(),
            response: null,
            isDirty: false,
            isLoading: false,
          };
          setActiveTabId(freshTab.tabId);
          return [freshTab];
        }
        const idx = prev.findIndex((t) => t.tabId === tabId);
        const next = prev.filter((t) => t.tabId !== tabId);
        if (tabId === activeTabId) {
          const fallback = next[Math.max(0, idx - 1)] ?? next[0];
          setActiveTabId(fallback.tabId);
        }
        return next;
      });
    },
    [activeTabId]
  );

  const executeViaProxy = async (
    resolved: ReturnType<typeof resolveRequest>,
    signal: AbortSignal
  ): Promise<ApiResponse> => {
    const proxyRes = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: resolved.url,
        method: resolved.method,
        headers: resolved.headers,
        body: resolved.body,
      }),
      signal,
    });

    const text = await proxyRes.text();
    let parsed: ProxyApiResponse | null = null;
    try {
      parsed = JSON.parse(text) as ProxyApiResponse;
    } catch {
      throw new Error(
        proxyRes.status === 404
          ? 'Serverless proxy (/api/proxy) is not running locally. Deploy to Vercel or run `vercel dev`.'
          : `Proxy returned invalid response (${proxyRes.status}).`
      );
    }

    if (!proxyRes.ok || parsed.error) {
      throw new Error(parsed.error ?? `Proxy error (${proxyRes.status})`);
    }

    const rawText =
      typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data, null, 2);

    return {
      status: parsed.status,
      statusText: parsed.statusText,
      headers: parsed.headers ?? {},
      data: parsed.data,
      rawText,
      durationMs: parsed.durationMs,
      sizeBytes: parsed.sizeBytes,
      viaProxy: true,
      timestamp: Date.now(),
    };
  };

  const executeDirect = async (
    resolved: ReturnType<typeof resolveRequest>,
    signal: AbortSignal
  ): Promise<ApiResponse> => {
    const start = performance.now();
    const res = await fetch(resolved.url, {
      method: resolved.method,
      headers: resolved.headers,
      body: resolved.method !== 'GET' && resolved.body !== null ? resolved.body : undefined,
      signal,
    });

    const buffer = await res.arrayBuffer();
    const durationMs = Math.max(1, Math.round(performance.now() - start));
    const sizeBytes = buffer.byteLength;
    const rawText = new TextDecoder('utf-8').decode(buffer);

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    let data: unknown = rawText;
    const contentType = res.headers.get('content-type') ?? '';
    if (
      rawText.trim().length > 0 &&
      (contentType.includes('json') ||
        rawText.trim().startsWith('{') ||
        rawText.trim().startsWith('['))
    ) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }
    }

    return {
      status: res.status,
      statusText: res.statusText,
      headers,
      data,
      rawText,
      durationMs,
      sizeBytes,
      viaProxy: false,
      timestamp: Date.now(),
    };
  };

  const handleSendRequest = useCallback(async () => {
    const tabSnapshot = activeTab;
    const resolved = resolveRequest(tabSnapshot.request, activeEnvironment);

    if (!resolved.url || !/^https?:\/\//i.test(resolved.url)) {
      addToast(
        'error',
        'Invalid URL',
        'Enter a valid http:// or https:// URL (or check your active environment variables).'
      );
      return;
    }

    const existingController = abortControllersRef.current.get(tabSnapshot.tabId);
    if (existingController) {
      existingController.abort();
    }
    const controller = new AbortController();
    abortControllersRef.current.set(tabSnapshot.tabId, controller);

    setTabs((prev) =>
      prev.map((t) => (t.tabId === tabSnapshot.tabId ? { ...t, isLoading: true } : t))
    );

    const startWall = performance.now();
    let finalResponse: ApiResponse;

    try {
      if (useProxy) {
        finalResponse = await executeViaProxy(resolved, controller.signal);
      } else {
        try {
          finalResponse = await executeDirect(resolved, controller.signal);
        } catch (directErr) {
          if (controller.signal.aborted) {
            throw directErr;
          }
          // Auto-fallback to Vercel serverless proxy on CORS / TypeError failure
          try {
            finalResponse = await executeViaProxy(resolved, controller.signal);
            addToast(
              'info',
              'Auto-retried via /api/proxy',
              'Direct browser request hit CORS; succeeded through serverless proxy.'
            );
          } catch (proxyErr) {
            const directMsg =
              directErr instanceof Error ? directErr.message : 'Direct fetch failed';
            const proxyMsg = proxyErr instanceof Error ? proxyErr.message : 'Proxy fallback failed';
            throw new Error(`Direct fetch failed (${directMsg}). Proxy fallback: ${proxyMsg}`);
          }
        }
      }

      setTabs((prev) =>
        prev.map((t) =>
          t.tabId === tabSnapshot.tabId
            ? { ...t, isLoading: false, response: finalResponse }
            : t
        )
      );

      const historyItem: HistoryEntry = {
        id: generateId('hist'),
        request: structuredClone(tabSnapshot.request),
        status: finalResponse.status,
        durationMs: finalResponse.durationMs,
        timestamp: Date.now(),
        viaProxy: finalResponse.viaProxy,
      };
      setHistory((prev) => [historyItem, ...prev].slice(0, 50));
    } catch (err) {
      if (controller.signal.aborted) {
        setTabs((prev) =>
          prev.map((t) => (t.tabId === tabSnapshot.tabId ? { ...t, isLoading: false } : t))
        );
        addToast('info', 'Request cancelled');
        return;
      }

      const durationMs = Math.max(1, Math.round(performance.now() - startWall));
      const errorMessage = err instanceof Error ? err.message : 'Unexpected request error';
      const errorResponse: ApiResponse = {
        status: 0,
        statusText: 'Error',
        headers: {},
        data: null,
        rawText: '',
        durationMs,
        sizeBytes: 0,
        viaProxy: useProxy,
        timestamp: Date.now(),
        error: errorMessage,
      };

      setTabs((prev) =>
        prev.map((t) =>
          t.tabId === tabSnapshot.tabId
            ? { ...t, isLoading: false, response: errorResponse }
            : t
        )
      );
      addToast('error', 'Request failed', errorMessage);
    } finally {
      abortControllersRef.current.delete(tabSnapshot.tabId);
    }
  }, [activeTab, activeEnvironment, useProxy, addToast]);

  const handleCancelRequest = useCallback(() => {
    const controller = abortControllersRef.current.get(activeTab.tabId);
    if (controller) {
      controller.abort();
    }
  }, [activeTab.tabId]);

  const handleSaveRequest = useCallback(() => {
    const req = activeTab.request;
    const targetCol = collections.find(
      (c) => c.id === req.collectionId || c.requests.some((r) => r.id === req.id)
    );

    if (targetCol) {
      setCollections((prev) =>
        prev.map((col) => {
          if (col.id !== targetCol.id) return col;
          const exists = col.requests.some((r) => r.id === req.id);
          const updatedReq = { ...structuredClone(req), collectionId: col.id };
          return {
            ...col,
            requests: exists
              ? col.requests.map((r) => (r.id === req.id ? updatedReq : r))
              : [...col.requests, updatedReq],
          };
        })
      );
      setTabs((prev) =>
        prev.map((t) => (t.tabId === activeTab.tabId ? { ...t, isDirty: false } : t))
      );
      addToast('success', 'Request saved', `Updated "${req.name}" in ${targetCol.name}`);
      return;
    }

    setSaveModalState({
      open: true,
      name: req.name || 'Untitled Request',
      collectionId: collections[0]?.id ?? '',
    });
  }, [activeTab, collections, addToast]);

  const handleConfirmSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = saveModalState.name.trim() || 'Untitled Request';
    let targetCollectionId = saveModalState.collectionId;

    if (!targetCollectionId) {
      const createdId = generateId('col');
      const newCol: Collection = {
        id: createdId,
        name: 'My Collection',
        createdAt: Date.now(),
        requests: [],
      };
      setCollections((prev) => [...prev, newCol]);
      targetCollectionId = createdId;
    }

    const updatedReq: ApiRequest = {
      ...structuredClone(activeTab.request),
      name: trimmedName,
      collectionId: targetCollectionId,
    };

    setCollections((prev) =>
      prev.map((col) =>
        col.id === targetCollectionId
          ? {
              ...col,
              requests: col.requests.some((r) => r.id === updatedReq.id)
                ? col.requests.map((r) => (r.id === updatedReq.id ? updatedReq : r))
                : [...col.requests, updatedReq],
            }
          : col
      )
    );

    setTabs((prev) =>
      prev.map((t) =>
        t.tabId === activeTab.tabId ? { ...t, request: updatedReq, isDirty: false } : t
      )
    );

    setSaveModalState({ open: false, name: '', collectionId: '' });
    addToast('success', 'Saved to collection', `"${trimmedName}" is now saved.`);
  };

  // Global keyboard shortcuts: Ctrl+Enter (Send), Ctrl+S (Save), Ctrl+K (Focus URL)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        if (!activeTab.isLoading) {
          void handleSendRequest();
        }
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveRequest();
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab.isLoading, handleSendRequest, handleSaveRequest]);

  // Collection & Workspace Handlers
  const handleCreateCollection = (name: string) => {
    const newCol: Collection = {
      id: generateId('col'),
      name,
      createdAt: Date.now(),
      requests: [],
    };
    setCollections((prev) => [...prev, newCol]);
    addToast('success', 'Collection created', `Folder "${name}" added.`);
  };

  const handleDeleteCollection = (collectionId: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== collectionId));
    addToast('info', 'Collection deleted');
  };

  const handleCreateRequestInCollection = (collectionId: string) => {
    const newReq = createEmptyRequest({
      name: 'New Request',
      collectionId,
      url: '{{BASE_URL}}/posts',
      headers: [createKeyValueItem('Accept', 'application/json', true)],
    });
    setCollections((prev) =>
      prev.map((col) =>
        col.id === collectionId ? { ...col, requests: [...col.requests, newReq] } : col
      )
    );
    handleOpenRequestInTab(newReq);
  };

  const handleDeleteRequest = (collectionId: string, requestId: string) => {
    setCollections((prev) =>
      prev.map((col) =>
        col.id === collectionId
          ? { ...col, requests: col.requests.filter((r) => r.id !== requestId) }
          : col
      )
    );
    addToast('info', 'Request removed from collection');
  };

  const handleExportWorkspace = () => {
    const json = exportWorkspaceJson(collections, environments, history);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pulseapi-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('success', 'Workspace exported', 'Downloaded collections, environments, and history.');
  };

  const handleImportWorkspace = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const imported = parseWorkspaceImport(text);
        setCollections(imported.collections);
        setEnvironments(imported.environments);
        setHistory(imported.history);
        if (imported.environments.length > 0) {
          setActiveEnvironmentId(imported.environments[0].id);
        }
        addToast(
          'success',
          'Workspace imported',
          `Loaded ${imported.collections.length} collections and ${imported.environments.length} environments.`
        );
      } catch (err) {
        addToast(
          'error',
          'Import failed',
          err instanceof Error ? err.message : 'Invalid workspace JSON file.'
        );
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Top IDE Header & Multi-Tab Strip */}
      <header className="flex h-11 shrink-0 items-center border-b border-zinc-800/80 bg-zinc-950">
        {/* Brand Mark */}
        <div className="flex h-full shrink-0 items-center gap-2 border-r border-zinc-800/80 px-3.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500 to-indigo-600 shadow-glow-cyan">
            <Activity className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-xs font-bold tracking-tight text-zinc-100">
            Pulse<span className="text-cyan-400">API</span>
            <span className="ml-1 hidden font-normal text-zinc-500 sm:inline">Studio</span>
          </span>
        </div>

        {/* Browser-like Request Tabs */}
        <div className="flex h-full flex-1 items-center overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.tabId === activeTab.tabId;
            return (
              <div
                key={tab.tabId}
                onClick={() => setActiveTabId(tab.tabId)}
                className={`group flex h-full max-w-[210px] min-w-[130px] cursor-pointer items-center justify-between gap-2 border-r border-zinc-800/80 px-3 text-xs transition-colors ${
                  isActive
                    ? 'border-t-2 border-t-cyan-400 bg-zinc-900/90 text-zinc-100'
                    : 'border-t-2 border-t-transparent bg-zinc-950 text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      METHOD_DOT_COLORS[tab.request.method]
                    }`}
                  />
                  <span
                    className={`shrink-0 font-mono text-[10px] font-bold ${
                      METHOD_TEXT_COLORS[tab.request.method]
                    }`}
                  >
                    {tab.request.method}
                  </span>
                  <span className="truncate font-medium">
                    {tab.request.name || 'Untitled'}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {tab.isDirty && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-cyan-400"
                      title="Unsaved changes"
                    />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTab(tab.tabId);
                    }}
                    title="Close Tab"
                    className="rounded p-0.5 text-zinc-500 opacity-60 transition-colors hover:bg-zinc-800 hover:text-zinc-100 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleNewTab}
            title="New Request Tab"
            className="flex h-full items-center justify-center px-3 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-cyan-400"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Inline Request Name Editor */}
        <div className="hidden items-center gap-2 border-l border-zinc-800/80 px-3 lg:flex">
          <input
            type="text"
            value={activeTab.request.name}
            onChange={(e) =>
              updateActiveRequest((prev) => ({ ...prev, name: e.target.value }))
            }
            aria-label="Request Name"
            placeholder="Request name..."
            className="w-40 rounded-md border border-transparent bg-transparent px-2 py-1 text-right text-xs font-medium text-zinc-300 outline-none transition-colors hover:border-zinc-800 focus:border-cyan-500/50 focus:bg-zinc-900"
          />
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collections={collections}
          history={history}
          environments={environments}
          activeEnvironmentId={activeEnvironmentId}
          activeRequestId={activeTab.request.id}
          isCollapsed={sidebarCollapsed}
          width={sidebarWidth}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onResizeStart={handleResizeStart}
          onSelectRequest={handleOpenRequestInTab}
          onCreateCollection={handleCreateCollection}
          onDeleteCollection={handleDeleteCollection}
          onCreateRequestInCollection={handleCreateRequestInCollection}
          onDeleteRequest={handleDeleteRequest}
          onClearHistory={() => {
            setHistory([]);
            addToast('info', 'History cleared');
          }}
          onSelectEnvironment={setActiveEnvironmentId}
          onSaveEnvironments={(nextEnvs) => {
            setEnvironments(nextEnvs);
            if (activeEnvironmentId && !nextEnvs.some((e) => e.id === activeEnvironmentId)) {
              setActiveEnvironmentId(nextEnvs[0]?.id ?? null);
            }
            addToast('success', 'Environments updated');
          }}
          onExportWorkspace={handleExportWorkspace}
          onImportWorkspace={handleImportWorkspace}
        />

        {/* Request + Response Pane */}
        <main className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
          <RequestBar
            request={activeTab.request}
            activeEnvironment={activeEnvironment}
            useProxy={useProxy}
            isLoading={activeTab.isLoading}
            isDirty={activeTab.isDirty}
            urlInputRef={urlInputRef}
            onMethodChange={(method) => updateActiveRequest((prev) => ({ ...prev, method }))}
            onUrlChange={handleUrlChange}
            onToggleProxy={() => {
              setUseProxy((prev) => {
                const next = !prev;
                addToast(
                  'info',
                  next ? 'Serverless Proxy enabled' : 'Direct Fetch enabled',
                  next
                    ? 'All requests route through /api/proxy to bypass CORS.'
                    : 'Requests run directly from browser with automatic CORS proxy fallback.'
                );
                return next;
              });
            }}
            onSend={() => void handleSendRequest()}
            onCancel={handleCancelRequest}
            onSave={handleSaveRequest}
            onOpenCodeModal={() => setIsCodeModalOpen(true)}
          />

          {/* Split Editor (Top) & Response Viewer (Bottom) */}
          <div className="grid flex-1 grid-rows-[minmax(220px,45%)_1fr] overflow-hidden">
            <div className="overflow-hidden border-b border-zinc-800/90">
              <RequestTabs
                request={activeTab.request}
                onChange={updateActiveRequest}
                onParamsChange={handleParamsChange}
              />
            </div>
            <div className="overflow-hidden">
              <ResponsePanel
                response={activeTab.response}
                isLoading={activeTab.isLoading}
                onCopySuccess={(msg) => addToast('success', msg)}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Code Snippet Modal */}
      <CodeModal
        isOpen={isCodeModalOpen}
        request={activeTab.request}
        activeEnvironment={activeEnvironment}
        onClose={() => setIsCodeModalOpen(false)}
        onCopied={(msg) => addToast('success', msg)}
      />

      {/* Save-to-Collection Modal */}
      {saveModalState.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setSaveModalState({ open: false, name: '', collectionId: '' })}
        >
          <form
            onSubmit={handleConfirmSaveModal}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-zinc-100">Save Request</h2>
              </div>
              <button
                type="button"
                onClick={() => setSaveModalState({ open: false, name: '', collectionId: '' })}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-300">Request Name</label>
                <input
                  type="text"
                  autoFocus
                  value={saveModalState.name}
                  onChange={(e) =>
                    setSaveModalState((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Get User Profile"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-300">Collection Folder</label>
                <select
                  value={saveModalState.collectionId}
                  onChange={(e) =>
                    setSaveModalState((prev) => ({ ...prev, collectionId: e.target.value }))
                  }
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-500"
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">
              <button
                type="button"
                onClick={() => setSaveModalState({ open: false, name: '', collectionId: '' })}
                className="rounded-lg border border-zinc-800 px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-1.5 text-xs font-semibold text-white shadow-glow-cyan hover:opacity-90"
              >
                Save Request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-80 items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/95 px-3.5 py-3 shadow-2xl backdrop-blur"
          >
            {toast.type === 'success' && (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            )}
            {toast.type === 'error' && (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            )}
            {toast.type === 'info' && (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-100">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="rounded p-0.5 text-zinc-500 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
