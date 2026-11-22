import type { ApiRequest, CodeLanguage, Environment } from '../types/api';

export interface ResolvedRequest {
  url: string;
  method: ApiRequest['method'];
  headers: Record<string, string>;
  body: string | null;
}

const ENV_VAR_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function extractEnvVarNames(input: string): string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(ENV_VAR_REGEX.source, 'g');
  while ((match = regex.exec(input)) !== null) {
    matches.add(match[1]);
  }
  return Array.from(matches);
}

export function getEnvMap(env: Environment | null): Record<string, string> {
  if (!env) return {};
  const map: Record<string, string> = {};
  for (const item of env.variables) {
    if (item.enabled && item.key.trim()) {
      map[item.key.trim()] = item.value;
    }
  }
  return map;
}

export function interpolateEnv(input: string, env: Environment | null): string {
  if (!input || !env) return input;
  const envMap = getEnvMap(env);
  return input.replace(ENV_VAR_REGEX, (fullMatch, varName: string) => {
    return Object.prototype.hasOwnProperty.call(envMap, varName) ? envMap[varName] : fullMatch;
  });
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function resolveRequest(request: ApiRequest, env: Environment | null): ResolvedRequest {
  let finalUrl = interpolateEnv(request.url.trim(), env);

  // Append enabled query parameters (including API Key in query if configured)
  const extraParams: Array<[string, string]> = [];
  if (
    request.auth.type === 'apikey' &&
    request.auth.apiKeyIn === 'query' &&
    request.auth.apiKeyName.trim()
  ) {
    extraParams.push([
      interpolateEnv(request.auth.apiKeyName.trim(), env),
      interpolateEnv(request.auth.apiKeyValue, env),
    ]);
  }

  if (finalUrl) {
    try {
      const parsed = new URL(finalUrl);
      // Params from request.params are already bi-directionally synced with URL,
      // but if any extra auth query param exists, append it safely.
      for (const [key, val] of extraParams) {
        parsed.searchParams.set(key, val);
      }
      finalUrl = parsed.toString();
    } catch {
      if (extraParams.length > 0) {
        const sep = finalUrl.includes('?') ? '&' : '?';
        const qs = extraParams
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&');
        finalUrl = `${finalUrl}${sep}${qs}`;
      }
    }
  }

  const headers: Record<string, string> = {};
  for (const h of request.headers) {
    if (h.enabled && h.key.trim()) {
      headers[interpolateEnv(h.key.trim(), env)] = interpolateEnv(h.value, env);
    }
  }

  // Apply authentication headers
  if (request.auth.type === 'bearer' && request.auth.bearerToken.trim()) {
    headers['Authorization'] = `Bearer ${interpolateEnv(request.auth.bearerToken.trim(), env)}`;
  } else if (
    request.auth.type === 'apikey' &&
    request.auth.apiKeyIn === 'header' &&
    request.auth.apiKeyName.trim()
  ) {
    headers[interpolateEnv(request.auth.apiKeyName.trim(), env)] = interpolateEnv(
      request.auth.apiKeyValue,
      env
    );
  } else if (request.auth.type === 'basic' && request.auth.basicUsername.trim()) {
    const user = interpolateEnv(request.auth.basicUsername, env);
    const pass = interpolateEnv(request.auth.basicPassword, env);
    headers['Authorization'] = `Basic ${encodeBase64Utf8(`${user}:${pass}`)}`;
  }

  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
  let body: string | null = null;

  if (request.method !== 'GET') {
    if (request.bodyType === 'json' && request.bodyJson.trim()) {
      body = interpolateEnv(request.bodyJson, env);
      if (!hasContentType) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (request.bodyType === 'urlencoded') {
      const searchParams = new URLSearchParams();
      for (const field of request.bodyForm) {
        if (field.enabled && field.key.trim()) {
          searchParams.append(
            interpolateEnv(field.key.trim(), env),
            interpolateEnv(field.value, env)
          );
        }
      }
      body = searchParams.toString();
      if (!hasContentType) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }
  }

  return {
    url: finalUrl,
    method: request.method,
    headers,
    body,
  };
}

function escapeSingleQuotes(str: string): string {
  return str.replace(/'/g, `'\\''`);
}

export function generateCurl(request: ApiRequest, env: Environment | null): string {
  const resolved = resolveRequest(request, env);
  const url = resolved.url || 'https://api.example.com/resource';
  const lines: string[] = [`curl -X ${resolved.method} '${escapeSingleQuotes(url)}'`];

  for (const [key, value] of Object.entries(resolved.headers)) {
    lines.push(`  -H '${escapeSingleQuotes(`${key}: ${value}`)}'`);
  }

  if (resolved.body !== null && resolved.body.length > 0) {
    lines.push(`  -d '${escapeSingleQuotes(resolved.body)}'`);
  }

  return lines.join(' \\\n');
}

export function generateFetch(request: ApiRequest, env: Environment | null): string {
  const resolved = resolveRequest(request, env);
  const url = resolved.url || 'https://api.example.com/resource';
  const hasHeaders = Object.keys(resolved.headers).length > 0;
  const hasBody = resolved.body !== null && resolved.body.length > 0;

  const optionLines: string[] = [`  method: ${JSON.stringify(resolved.method)},`];

  if (hasHeaders) {
    const headerEntries = Object.entries(resolved.headers)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join('\n');
    optionLines.push(`  headers: {\n${headerEntries}\n  },`);
  }

  if (hasBody && resolved.body !== null) {
    if (request.bodyType === 'json') {
      try {
        const parsed = JSON.parse(resolved.body);
        const formatted = JSON.stringify(parsed, null, 2)
          .split('\n')
          .map((line, i) => (i === 0 ? line : `  ${line}`))
          .join('\n');
        optionLines.push(`  body: JSON.stringify(${formatted}),`);
      } catch {
        optionLines.push(`  body: ${JSON.stringify(resolved.body)},`);
      }
    } else {
      optionLines.push(`  body: new URLSearchParams(${JSON.stringify(resolved.body)}),`);
    }
  }

  return [
    `const response = await fetch(${JSON.stringify(url)}, {`,
    ...optionLines,
    `});`,
    ``,
    `if (!response.ok) {`,
    `  throw new Error(\`HTTP error! status: \${response.status}\`);`,
    `}`,
    ``,
    `const data = await response.json();`,
    `console.log(data);`,
  ].join('\n');
}

export function generateAxios(request: ApiRequest, env: Environment | null): string {
  const resolved = resolveRequest(request, env);
  const url = resolved.url || 'https://api.example.com/resource';
  const hasHeaders = Object.keys(resolved.headers).length > 0;
  const hasBody = resolved.body !== null && resolved.body.length > 0;

  const configLines: string[] = [
    `  method: ${JSON.stringify(resolved.method.toLowerCase())},`,
    `  url: ${JSON.stringify(url)},`,
  ];

  if (hasHeaders) {
    const headerEntries = Object.entries(resolved.headers)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join('\n');
    configLines.push(`  headers: {\n${headerEntries}\n  },`);
  }

  if (hasBody && resolved.body !== null) {
    if (request.bodyType === 'json') {
      try {
        const parsed = JSON.parse(resolved.body);
        const formatted = JSON.stringify(parsed, null, 2)
          .split('\n')
          .map((line, i) => (i === 0 ? line : `  ${line}`))
          .join('\n');
        configLines.push(`  data: ${formatted},`);
      } catch {
        configLines.push(`  data: ${JSON.stringify(resolved.body)},`);
      }
    } else {
      configLines.push(`  data: ${JSON.stringify(resolved.body)},`);
    }
  }

  return [
    `import axios from 'axios';`,
    ``,
    `const { data } = await axios({`,
    ...configLines,
    `});`,
    ``,
    `console.log(data);`,
  ].join('\n');
}

export function generatePythonRequests(request: ApiRequest, env: Environment | null): string {
  const resolved = resolveRequest(request, env);
  const url = resolved.url || 'https://api.example.com/resource';
  const hasHeaders = Object.keys(resolved.headers).length > 0;
  const hasBody = resolved.body !== null && resolved.body.length > 0;

  const lines: string[] = [`import requests`, ``, `url = ${JSON.stringify(url)}`];

  if (hasHeaders) {
    lines.push(`headers = {`);
    for (const [k, v] of Object.entries(resolved.headers)) {
      lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    }
    lines.push(`}`);
  }

  let bodyArg = '';
  if (hasBody && resolved.body !== null) {
    if (request.bodyType === 'json') {
      try {
        const parsed = JSON.parse(resolved.body);
        const pyJson = JSON.stringify(parsed, null, 4)
          .replace(/\btrue\b/g, 'True')
          .replace(/\bfalse\b/g, 'False')
          .replace(/\bnull\b/g, 'None');
        lines.push(`payload = ${pyJson}`);
        bodyArg = ', json=payload';
      } catch {
        lines.push(`payload = ${JSON.stringify(resolved.body)}`);
        bodyArg = ', data=payload';
      }
    } else {
      const formObj: Record<string, string> = {};
      new URLSearchParams(resolved.body).forEach((v, k) => {
        formObj[k] = v;
      });
      lines.push(`payload = ${JSON.stringify(formObj, null, 4)}`);
      bodyArg = ', data=payload';
    }
  }

  const headersArg = hasHeaders ? ', headers=headers' : '';
  lines.push(``);
  lines.push(
    `response = requests.request(${JSON.stringify(resolved.method)}, url${headersArg}${bodyArg})`
  );
  lines.push(`response.raise_for_status()`);
  lines.push(`print(response.json())`);

  return lines.join('\n');
}

export function generateCodeSnippet(
  language: CodeLanguage,
  request: ApiRequest,
  env: Environment | null
): string {
  switch (language) {
    case 'curl':
      return generateCurl(request, env);
    case 'fetch':
      return generateFetch(request, env);
    case 'axios':
      return generateAxios(request, env);
    case 'python':
      return generatePythonRequests(request, env);
  }
}
