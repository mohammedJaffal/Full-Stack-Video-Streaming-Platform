interface Env { PLAYBACK_SIGNING_SECRET: string; ALLOWED_ORIGIN: string }
type Claims = { sub: string; source: string; exp: number };

const encoder = new TextEncoder();
const decodeBase64Url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), c => c.charCodeAt(0));

async function verify(token: string, secret: string): Promise<Claims> {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) throw new Error('Malformed token');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('HMAC', key, decodeBase64Url(signature), encoder.encode(`${header}.${payload}`));
  if (!ok) throw new Error('Invalid signature');
  const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as Claims;
  if (!claims.exp || Date.now() / 1000 >= claims.exp) throw new Error('Playback token expired');
  if (!claims.source?.startsWith('https://')) throw new Error('Invalid media source');
  return claims;
}

function cors(env: Env, headers = new Headers()) {
  headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN || '*');
  headers.set('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Range,Content-Type');
  headers.set('Access-Control-Expose-Headers', 'Accept-Ranges,Content-Length,Content-Range,Content-Type');
  headers.set('Vary', 'Origin');
  return headers;
}

function targetFromRequest(requestUrl: URL, claims: Claims) {
  const requested = requestUrl.searchParams.get('url');
  if (!requested) return new URL(claims.source);
  const target = new URL(requested);
  const origin = new URL(claims.source);
  if (target.protocol !== 'https:' || target.hostname !== origin.hostname) throw new Error('Target is outside the authorized origin');
  return target;
}

function rewriteManifest(text: string, manifestUrl: URL, requestUrl: URL, token: string) {
  return text.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const absolute = new URL(trimmed, manifestUrl).toString();
    const relay = new URL('/relay', requestUrl.origin);
    relay.searchParams.set('token', token);
    relay.searchParams.set('url', absolute);
    return relay.toString();
  }).join('\n');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: cors(env) });
    const url = new URL(request.url);
    if (!['/manifest', '/relay'].includes(url.pathname)) return new Response('Not found', { status: 404, headers: cors(env) });
    try {
      const token = url.searchParams.get('token') || '';
      const claims = await verify(token, env.PLAYBACK_SIGNING_SECRET);
      const target = targetFromRequest(url, claims);
      const upstreamHeaders = new Headers();
      const range = request.headers.get('Range');
      if (range) upstreamHeaders.set('Range', range);
      const upstream = await fetch(target, { method: request.method, headers: upstreamHeaders, redirect: 'follow' });
      const headers = cors(env, new Headers(upstream.headers));
      headers.set('Cache-Control', target.pathname.endsWith('.m3u8') ? 'private, no-store' : 'private, max-age=60');
      if (request.method === 'HEAD') return new Response(null, { status: upstream.status, headers });
      const type = upstream.headers.get('content-type') || '';
      if (target.pathname.endsWith('.m3u8') || type.includes('mpegurl')) {
        const rewritten = rewriteManifest(await upstream.text(), target, url, token);
        headers.set('Content-Type', 'application/vnd.apple.mpegurl');
        headers.delete('Content-Length');
        return new Response(rewritten, { status: upstream.status, headers });
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unauthorized playback request' }, { status: 401, headers: cors(env) });
    }
  }
};
