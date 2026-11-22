import type {
  ApiRequest,
  AuthConfig,
  Collection,
  Environment,
  HistoryEntry,
  KeyValueItem,
  WorkspaceExport,
} from '../types/api';

const STORAGE_KEYS = {
  collections: 'pulseapi_collections_v1',
  environments: 'pulseapi_environments_v1',
  activeEnvId: 'pulseapi_active_env_v1',
  history: 'pulseapi_history_v1',
  useProxy: 'pulseapi_use_proxy_v1',
} as const;

export function generateId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createKeyValueItem(
  key = '',
  value = '',
  enabled = true,
  description = ''
): KeyValueItem {
  return {
    id: generateId('kv'),
    key,
    value,
    enabled,
    description,
  };
}

export function createDefaultAuth(): AuthConfig {
  return {
    type: 'none',
    bearerToken: '',
    apiKeyName: 'X-API-Key',
    apiKeyValue: '',
    apiKeyIn: 'header',
    basicUsername: '',
    basicPassword: '',
  };
}

export function createEmptyRequest(overrides?: Partial<ApiRequest>): ApiRequest {
  return {
    id: generateId('req'),
    name: 'Untitled Request',
    method: 'GET',
    url: '',
    params: [],
    headers: [createKeyValueItem('Accept', 'application/json', true)],
    auth: createDefaultAuth(),
    bodyType: 'none',
    bodyJson: '{\n  \n}',
    bodyForm: [],
    ...overrides,
  };
}

export function getStarterEnvironments(): Environment[] {
  return [
    {
      id: 'env_prod',
      name: 'Production',
      variables: [
        createKeyValueItem('BASE_URL', 'https://jsonplaceholder.typicode.com', true, 'Default base URL'),
        createKeyValueItem('GITHUB_API', 'https://api.github.com', true, 'GitHub REST API v3'),
        createKeyValueItem('COUNTRIES_API', 'https://restcountries.com/v3.1', true, 'REST Countries API'),
        createKeyValueItem('API_KEY', 'pulse_prod_demo_key_2026', true, 'Sample API key'),
      ],
    },
    {
      id: 'env_staging',
      name: 'Staging',
      variables: [
        createKeyValueItem('BASE_URL', 'https://jsonplaceholder.typicode.com', true, 'Staging base URL'),
        createKeyValueItem('GITHUB_API', 'https://api.github.com', true, 'GitHub REST API v3'),
        createKeyValueItem('COUNTRIES_API', 'https://restcountries.com/v3.1', true, 'REST Countries API'),
        createKeyValueItem('API_KEY', 'pulse_staging_demo_key_2026', true, 'Staging sample key'),
      ],
    },
  ];
}

export function getStarterCollections(): Collection[] {
  const now = Date.now();
  return [
    {
      id: 'col_jsonplaceholder',
      name: 'JSONPlaceholder Demo',
      description: 'Free fake REST API for rapid prototyping and testing',
      createdAt: now,
      requests: [
        createEmptyRequest({
          id: 'req_jp_posts',
          collectionId: 'col_jsonplaceholder',
          name: 'List Posts',
          method: 'GET',
          url: '{{BASE_URL}}/posts?_limit=5',
          params: [createKeyValueItem('_limit', '5', true)],
        }),
        createEmptyRequest({
          id: 'req_jp_user',
          collectionId: 'col_jsonplaceholder',
          name: 'Get User Profile',
          method: 'GET',
          url: '{{BASE_URL}}/users/1',
        }),
        createEmptyRequest({
          id: 'req_jp_create',
          collectionId: 'col_jsonplaceholder',
          name: 'Create New Post',
          method: 'POST',
          url: '{{BASE_URL}}/posts',
          headers: [
            createKeyValueItem('Accept', 'application/json', true),
            createKeyValueItem('Content-Type', 'application/json', true),
          ],
          bodyType: 'json',
          bodyJson: JSON.stringify(
            {
              title: 'Shipping PulseAPI Studio',
              body: 'Testing REST endpoints with zero friction and instant code generation.',
              userId: 1,
            },
            null,
            2
          ),
        }),
        createEmptyRequest({
          id: 'req_jp_patch',
          collectionId: 'col_jsonplaceholder',
          name: 'Patch Post Title',
          method: 'PATCH',
          url: '{{BASE_URL}}/posts/1',
          headers: [
            createKeyValueItem('Accept', 'application/json', true),
            createKeyValueItem('Content-Type', 'application/json', true),
          ],
          bodyType: 'json',
          bodyJson: JSON.stringify(
            {
              title: 'Updated Post Title via PATCH',
            },
            null,
            2
          ),
        }),
        createEmptyRequest({
          id: 'req_jp_delete',
          collectionId: 'col_jsonplaceholder',
          name: 'Delete Post',
          method: 'DELETE',
          url: '{{BASE_URL}}/posts/1',
        }),
      ],
    },
    {
      id: 'col_github',
      name: 'GitHub Public API',
      description: 'Public repositories and developer profiles on GitHub',
      createdAt: now + 1,
      requests: [
        createEmptyRequest({
          id: 'req_gh_repo',
          collectionId: 'col_github',
          name: 'Get React Repository',
          method: 'GET',
          url: '{{GITHUB_API}}/repos/facebook/react',
          headers: [createKeyValueItem('Accept', 'application/vnd.github+json', true)],
        }),
        createEmptyRequest({
          id: 'req_gh_user',
          collectionId: 'col_github',
          name: 'Get GitHub User',
          method: 'GET',
          url: '{{GITHUB_API}}/users/torvalds',
          headers: [createKeyValueItem('Accept', 'application/vnd.github+json', true)],
        }),
        createEmptyRequest({
          id: 'req_gh_vercel_repos',
          collectionId: 'col_github',
          name: 'List Vercel Repos',
          method: 'GET',
          url: '{{GITHUB_API}}/users/vercel/repos?per_page=5&sort=updated',
          params: [
            createKeyValueItem('per_page', '5', true),
            createKeyValueItem('sort', 'updated', true),
          ],
          headers: [createKeyValueItem('Accept', 'application/vnd.github+json', true)],
        }),
      ],
    },
    {
      id: 'col_countries',
      name: 'REST Countries',
      description: 'World country metadata, capitals, currencies, and regions',
      createdAt: now + 2,
      requests: [
        createEmptyRequest({
          id: 'req_rc_japan',
          collectionId: 'col_countries',
          name: 'Country by Name (Japan)',
          method: 'GET',
          url: '{{COUNTRIES_API}}/name/japan?fields=name,capital,population,region,currencies',
          params: [createKeyValueItem('fields', 'name,capital,population,region,currencies', true)],
        }),
        createEmptyRequest({
          id: 'req_rc_europe',
          collectionId: 'col_countries',
          name: 'Countries in Europe',
          method: 'GET',
          url: '{{COUNTRIES_API}}/region/europe?fields=name,capital,population',
          params: [createKeyValueItem('fields', 'name,capital,population', true)],
        }),
      ],
    },
  ];
}

export function loadCollections(): Collection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.collections);
    if (!raw) return getStarterCollections();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as Collection[];
    }
    return getStarterCollections();
  } catch {
    return getStarterCollections();
  }
}

export function saveCollections(collections: Collection[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.collections, JSON.stringify(collections));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadEnvironments(): Environment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.environments);
    if (!raw) return getStarterEnvironments();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as Environment[];
    }
    return getStarterEnvironments();
  } catch {
    return getStarterEnvironments();
  }
}

export function saveEnvironments(environments: Environment[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.environments, JSON.stringify(environments));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadActiveEnvironmentId(): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.activeEnvId);
    return saved ?? 'env_prod';
  } catch {
    return 'env_prod';
  }
}

export function saveActiveEnvironmentId(envId: string | null): void {
  try {
    if (envId === null) {
      localStorage.setItem(STORAGE_KEYS.activeEnvId, '');
    } else {
      localStorage.setItem(STORAGE_KEYS.activeEnvId, envId);
    }
  } catch {
    // Ignore storage errors
  }
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(history: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history.slice(0, 50)));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadProxyPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.useProxy) === 'true';
  } catch {
    return false;
  }
}

export function saveProxyPreference(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.useProxy, String(enabled));
  } catch {
    // Ignore storage errors
  }
}

export function exportWorkspaceJson(
  collections: Collection[],
  environments: Environment[],
  history: HistoryEntry[]
): string {
  const payload: WorkspaceExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'PulseAPI Studio',
    collections,
    environments,
    history,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseWorkspaceImport(rawJson: string): {
  collections: Collection[];
  environments: Environment[];
  history: HistoryEntry[];
} {
  const parsed = JSON.parse(rawJson) as Partial<WorkspaceExport>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON structure.');
  }
  if (!Array.isArray(parsed.collections) || !Array.isArray(parsed.environments)) {
    throw new Error('Workspace file must include "collections" and "environments" arrays.');
  }
  return {
    collections: parsed.collections,
    environments: parsed.environments,
    history: Array.isArray(parsed.history) ? parsed.history : [],
  };
}
