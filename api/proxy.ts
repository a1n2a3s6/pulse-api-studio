import type { VercelRequest, VercelResponse } from '@vercel/node';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

interface ProxyRequestBody {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

const ALLOWED_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

const FORBIDDEN_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
]);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

const REQUEST_TIMEOUT_MS = 25_000;

function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((octet) => Number(octet));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 & 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::1' || normalized === '::' || normalized === '0:0:0:0:0:0:0:1') {
    return true;
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true; // fc00::/7 unique local
  }
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true; // fe80::/10 link-local
  }
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    if (isIP(mapped) === 4) {
      return isPrivateIpv4(mapped);
    }
  }
  return false;
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true;
}

async function validateTargetUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL format. Include http:// or https://.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol "${parsed.protocol}". Only http and https are allowed.`);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    throw new Error('URL hostname is required.');
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Blocked by SSRF protection: local and internal hostnames are not permitted.');
  }

  const ipVersion = isIP(hostname);
  if (ipVersion !== 0) {
    if (isPrivateIp(hostname)) {
      throw new Error('Blocked by SSRF protection: private or loopback IP addresses are not permitted.');
    }
    return parsed;
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) {
      throw new Error(`Could not resolve hostname "${hostname}".`);
    }
    for (const record of addresses) {
      if (isPrivateIp(record.address)) {
        throw new Error(
          `Blocked by SSRF protection: "${hostname}" resolves to a private or loopback IP address.`
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Blocked by SSRF')) {
      throw err;
    }
    throw new Error(`DNS lookup failed for "${hostname}".`);
  }

  return parsed;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. Send a POST request with { url, method, headers, body }.' });
    return;
  }

  const payload = (typeof req.body === 'string' ? safeJsonParse(req.body) : req.body) as
    | ProxyRequestBody
    | undefined;

  if (!payload || typeof payload.url !== 'string' || !payload.url.trim()) {
    res.status(400).json({ error: 'Missing required "url" string in request body.' });
    return;
  }

  const method = (payload.method ?? 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    res.status(400).json({ error: `Unsupported HTTP method "${method}".` });
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = await validateTargetUrl(payload.url.trim());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'URL validation failed.';
    res.status(403).json({ error: message });
    return;
  }

  const sanitizedHeaders: Record<string, string> = {};
  if (payload.headers && typeof payload.headers === 'object') {
    for (const [key, value] of Object.entries(payload.headers)) {
      if (!key || typeof value !== 'string') continue;
      if (FORBIDDEN_REQUEST_HEADERS.has(key.toLowerCase())) continue;
      sanitizedHeaders[key] = value;
    }
  }

  let serializedBody: string | undefined;
  if (method !== 'GET' && method !== 'HEAD' && payload.body !== undefined && payload.body !== null) {
    if (typeof payload.body === 'string') {
      serializedBody = payload.body;
    } else {
      serializedBody = JSON.stringify(payload.body);
      const hasContentType = Object.keys(sanitizedHeaders).some(
        (k) => k.toLowerCase() === 'content-type'
      );
      if (!hasContentType) {
        sanitizedHeaders['Content-Type'] = 'application/json';
      }
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startTime = performance.now();

  try {
    const upstreamResponse = await fetch(targetUrl.toString(), {
      method,
      headers: sanitizedHeaders,
      body: serializedBody,
      redirect: 'follow',
      signal: controller.signal,
    });

    const arrayBuffer = await upstreamResponse.arrayBuffer();
    const durationMs = Math.max(1, Math.round(performance.now() - startTime));
    const sizeBytes = arrayBuffer.byteLength;
    const rawText = new TextDecoder('utf-8').decode(arrayBuffer);

    const responseHeaders: Record<string, string> = {};
    upstreamResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const contentType = upstreamResponse.headers.get('content-type') ?? '';
    let data: unknown = rawText;
    if (rawText.length > 0 && (contentType.includes('json') || looksLikeJson(rawText))) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }
    }

    res.status(200).json({
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
      data,
      durationMs,
      sizeBytes,
    });
  } catch (err) {
    const durationMs = Math.max(1, Math.round(performance.now() - startTime));
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const message = isAbort
      ? `Upstream request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
      : err instanceof Error
        ? err.message
        : 'Upstream request failed.';

    res.status(isAbort ? 504 : 502).json({
      error: message,
      durationMs,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}
