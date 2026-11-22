export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface KeyValueItem {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export type AuthType = 'none' | 'bearer' | 'apikey' | 'basic';

export interface AuthConfig {
  type: AuthType;
  bearerToken: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyIn: 'header' | 'query';
  basicUsername: string;
  basicPassword: string;
}

export type BodyType = 'none' | 'json' | 'urlencoded';

export interface ApiRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  auth: AuthConfig;
  bodyType: BodyType;
  bodyJson: string;
  bodyForm: KeyValueItem[];
  collectionId?: string;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  rawText: string;
  durationMs: number;
  sizeBytes: number;
  viaProxy: boolean;
  timestamp: number;
  error?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  requests: ApiRequest[];
  createdAt: number;
}

export interface Environment {
  id: string;
  name: string;
  variables: KeyValueItem[];
}

export interface HistoryEntry {
  id: string;
  request: ApiRequest;
  status: number;
  durationMs: number;
  timestamp: number;
  viaProxy: boolean;
}

export interface WorkspaceTab {
  tabId: string;
  request: ApiRequest;
  response: ApiResponse | null;
  isDirty: boolean;
  isLoading: boolean;
}

export type CodeLanguage = 'curl' | 'fetch' | 'axios' | 'python';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

export interface WorkspaceExport {
  version: number;
  exportedAt: string;
  app: 'PulseAPI Studio';
  collections: Collection[];
  environments: Environment[];
  history: HistoryEntry[];
}
