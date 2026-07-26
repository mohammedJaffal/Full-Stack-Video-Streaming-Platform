interface Env { PLAYBACK_SIGNING_SECRET: string; ALLOWED_ORIGIN: string }
export type Claims = { sub: string; source: string; exp: number };

const encoder = new TextEncoder();
const decodeBase64Url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), c => c.charCodeAt(0));
const SAFE_UPSTREAM_HEADERS = [
  'Accept-Ranges',
  'Content-Length',
  'Content-Range',
  'Content-Type',
  'ETag',
  'Last-Modified',
] as const;

class RelayError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function parseJsonPart<T>(value: string, message: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
  } catch {
    throw new RelayError(401, message);
  }
}

export async function verify(token: string, secret: string): Promise<Claims> {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature || token.split('.').length !== 3) {
    throw new RelayError(401, 'Malformed token');
  }
  if (secret.length < 32) throw new RelayError(500, 'Relay signing secret is not configured securely');

  const metadata = parseJsonPart<{ alg?: unknown; typ?: unknown }>(header, 'Invalid token header');
  if (metadata.alg !== 'HS256' || (metadata.typ !== undefined && metadata.typ !== 'JWT')) {
    throw new RelayError(401, 'Unsupported token algorithm');
  }

  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = decodeBase64Url(signature);
  } catch {
    throw new RelayError(401, 'Invalid token signature');
  }
  const ok = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(`${header}.${payload}`));
  if (!ok) throw new RelayError(401, 'Invalid signature');

  const claims = parseJsonPart<Partial<Claims>>(payload, 'Invalid token payload');
  if (
    typeof claims.sub !== 'string' ||
    claims.sub.length === 0 ||
    claims.sub.length > 128 ||
    typeof claims.exp !== 'number' ||
    !Number.isSafeInteger(claims.exp)
  ) {
    throw new RelayError(401, 'Invalid playback claims');
  }
  if (Date.now() / 1000 >= claims.exp) throw new RelayError(401, 'Playback token expired');
  if (typeof claims.source !== 'string' || claims.source.length > 2048) {
    throw new RelayError(401, 'Invalid media source');
  }

  let source: URL;
  try {
    source = new URL(claims.source);
  } catch {
    throw new RelayError(401, 'Invalid media source');
  }
  if (
    source.protocol !== 'https:' ||
    source.username !== '' ||
    source.password !== '' ||
    source.hash !== ''
  ) {
    throw new RelayError(401, 'Invalid media source');
  }

  return claims as Claims;
}

function cors(env: Env, headers = new Headers()) {
  headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN || '*');
  headers.set('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Range,Content-Type');
  headers.set('Access-Control-Expose-Headers', 'Accept-Ranges,Content-Length,Content-Range,Content-Type,ETag,Last-Modified');
  headers.set('Vary', 'Origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

export function relayHeaders(upstream: Headers, env: Env) {
  const headers = new Headers();
  for (const name of SAFE_UPSTREAM_HEADERS) {
    const value = upstream.get(name);
    if (value !== null) headers.set(name, value);
  }
  return cors(env, headers);
}

function errorResponse(env: Env, error: unknown) {
  const status = error instanceof RelayError ? error.status : 502;
  const message = error instanceof RelayError ? error.message : 'Upstream media request failed';
  const headers = cors(env);
  headers.set('Cache-Control', 'no-store');
  return Response.json({ error: message }, { status, headers });
}

export function validateRange(value: string | null) {
  if (value === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) {
    throw new RelayError(416, 'Invalid byte range');
  }

  if (match[1] && match[2] && BigInt(match[1]) > BigInt(match[2])) {
    throw new RelayError(416, 'Invalid byte range');
  }

  return value;
}

export function assertAuthorizedTarget(target: URL, source: URL) {
  if (
    target.protocol !== 'https:' ||
    target.origin !== source.origin ||
    target.username !== '' ||
    target.password !== '' ||
    target.hash !== ''
  ) {
    throw new RelayError(403, 'Target is outside the authorized origin');
  }
}

function targetFromRequest(requestUrl: URL, claims: Claims) {
  const requested = requestUrl.searchParams.get('url');
  if (!requested) return new URL(claims.source);

  let target: URL;
  try {
    target = new URL(requested);
  } catch {
    throw new RelayError(400, 'Invalid relay target');
  }

  assertAuthorizedTarget(target, new URL(claims.source));
  return target;
}

function relayUrl(absolute: string, requestUrl: URL, token: string) {
  const relay = new URL('/relay', requestUrl.origin);
  relay.searchParams.set('token', token);
  relay.searchParams.set('url', absolute);
  return relay.toString();
}

export function rewriteManifest(text: string, manifestUrl: URL, requestUrl: URL, token: string) {
  return text.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (!trimmed.startsWith('#')) return relayUrl(new URL(trimmed, manifestUrl).toString(), requestUrl, token);
    return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${relayUrl(new URL(uri, manifestUrl).toString(), requestUrl, token)}"`);
  }).join('\n');
}

async function fetchAuthorized(target: URL, source: URL, init: RequestInit, remainingRedirects = 3): Promise<Response> {
  assertAuthorizedTarget(target, source);
  const response = await fetch(target, { ...init, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    if (remainingRedirects <= 0) throw new RelayError(502, 'Too many media redirects');
    const location = response.headers.get('location');
    if (!location) throw new RelayError(502, 'Media redirect is missing its target');
    const next = new URL(location, target);
    assertAuthorizedTarget(next, source);
    return fetchAuthorized(next, source, init, remainingRedirects - 1);
  }
  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: cors(env) });

    const url = new URL(request.url);
    if (url.pathname === '/health') {
      const headers = cors(env);
      headers.set('Cache-Control', 'no-store');
      return Response.json({ service: 'media-relay', status: 'ok' }, { headers });
    }
    if (!['/manifest', '/relay'].includes(url.pathname)) return new Response('Not found', { status: 404, headers: cors(env) });

    try {
      const token = url.searchParams.get('token') || '';
      const claims = await verify(token, env.PLAYBACK_SIGNING_SECRET);
      const source = new URL(claims.source);
      const target = targetFromRequest(url, claims);
      const upstreamHeaders = new Headers();
      const range = validateRange(request.headers.get('Range'));
      if (range) upstreamHeaders.set('Range', range);
      const upstream = await fetchAuthorized(target, source, { method: request.method, headers: upstreamHeaders });
      const headers = relayHeaders(upstream.headers, env);

      if (request.method === 'HEAD') {
        headers.set('Cache-Control', 'private, no-store');
        return new Response(null, { status: upstream.status, headers });
      }

      const type = upstream.headers.get('content-type') || '';
      const isManifest = upstream.ok && (target.pathname.toLowerCase().endsWith('.m3u8') || type.toLowerCase().includes('mpegurl'));
      if (isManifest) {
        const rewritten = rewriteManifest(await upstream.text(), target, url, token);
        headers.set('Content-Type', 'application/vnd.apple.mpegurl');
        headers.set('Cache-Control', 'private, no-store');
        headers.delete('Content-Length');
        headers.delete('Content-Range');
        headers.delete('Accept-Ranges');
        headers.delete('ETag');
        headers.delete('Last-Modified');
        return new Response(rewritten, { status: upstream.status, headers });
      }

      headers.set('Cache-Control', range ? 'private, no-store' : 'private, max-age=60');
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (error) {
      return errorResponse(env, error);
    }
  }
};
