import { describe, expect, it } from 'vitest';
import relay, {
  assertAuthorizedTarget,
  relayHeaders,
  rewriteManifest,
  validateRange,
  verify,
} from './index';

const secret = 'test-signing-secret-that-is-at-least-32-bytes';

function encodePart(value: unknown) {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sign(payload: object, header: object = { alg: 'HS256', typ: 'JWT' }) {
  const unsigned = `${encodePart(header)}.${encodePart(payload)}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned)),
  );
  const encodedSignature = btoa(String.fromCharCode(...signature))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${unsigned}.${encodedSignature}`;
}

describe('HLS relay hardening', () => {
  it('protects URI attributes inside HLS tags', () => {
    const manifest = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/prog.m3u8"\nsegment.ts';
    const output = rewriteManifest(manifest, new URL('https://media.example.com/master/main.m3u8'), new URL('https://relay.example.com/manifest'), 'token-123');
    expect(output).toContain('URI="https://relay.example.com/relay?token=token-123&url=https%3A%2F%2Fmedia.example.com%2Fmaster%2Fkeys%2Fkey.bin"');
    expect(output).toContain('url=https%3A%2F%2Fmedia.example.com%2Fmaster%2Finit.mp4');
    expect(output).toContain('url=https%3A%2F%2Fmedia.example.com%2Fmaster%2Faudio%2Fprog.m3u8');
    expect(output).toContain('url=https%3A%2F%2Fmedia.example.com%2Fmaster%2Fsegment.ts');
  });

  it('rejects redirect targets on a different hostname', () => {
    expect(() => assertAuthorizedTarget(new URL('https://evil.example.net/video.ts'), new URL('https://media.example.com/master.m3u8'))).toThrow('outside the authorized origin');
  });

  it('rejects a different port on the authorized hostname', () => {
    expect(() => assertAuthorizedTarget(
      new URL('https://media.example.com:8443/video.ts'),
      new URL('https://media.example.com/master.m3u8'),
    )).toThrow('outside the authorized origin');
  });

  it('accepts only a single valid byte range', () => {
    expect(validateRange('bytes=0-1023')).toBe('bytes=0-1023');
    expect(validateRange('bytes=-512')).toBe('bytes=-512');
    expect(() => validateRange('bytes=100-50')).toThrow('Invalid byte range');
    expect(() => validateRange('bytes=0-10,20-30')).toThrow('Invalid byte range');
  });

  it('requires HS256 token metadata', async () => {
    const token = await sign(
      { sub: 'session', source: 'https://media.example.com/master.m3u8', exp: Math.floor(Date.now() / 1000) + 60 },
      { alg: 'none', typ: 'JWT' },
    );
    await expect(verify(token, secret)).rejects.toThrow('Unsupported token algorithm');
  });

  it('accepts a well-formed, signed playback token', async () => {
    const claims = {
      sub: 'session',
      source: 'https://media.example.com/master.m3u8',
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    const token = await sign(claims);
    await expect(verify(token, secret)).resolves.toEqual(claims);
  });

  it('does not forward cookies or arbitrary upstream headers', () => {
    const headers = relayHeaders(new Headers({
      'Content-Type': 'video/mp2t',
      'Set-Cookie': 'session=upstream',
      'X-Upstream-Secret': 'hidden',
      ETag: '"segment-1"',
    }), { PLAYBACK_SIGNING_SECRET: secret, ALLOWED_ORIGIN: 'https://app.example.com' });

    expect(headers.get('Content-Type')).toBe('video/mp2t');
    expect(headers.get('ETag')).toBe('"segment-1"');
    expect(headers.has('Set-Cookie')).toBe(false);
    expect(headers.has('X-Upstream-Secret')).toBe(false);
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('exposes an unauthenticated health endpoint without touching upstream media', async () => {
    const response = await relay.fetch(
      new Request('https://relay.example.com/health'),
      { PLAYBACK_SIGNING_SECRET: secret, ALLOWED_ORIGIN: 'https://app.example.com' },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ service: 'media-relay', status: 'ok' });
  });

  it('returns a distinct client error for an unauthorized relay origin', async () => {
    const token = await sign({
      sub: 'session',
      source: 'https://media.example.com/master.m3u8',
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const requestUrl = new URL('https://relay.example.com/relay');
    requestUrl.searchParams.set('token', token);
    requestUrl.searchParams.set('url', 'https://media.example.com:8443/segment.ts');

    const response = await relay.fetch(
      new Request(requestUrl),
      { PLAYBACK_SIGNING_SECRET: secret, ALLOWED_ORIGIN: 'https://app.example.com' },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Target is outside the authorized origin',
    });
  });
});
