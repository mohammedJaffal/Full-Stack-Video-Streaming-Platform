import { describe, expect, it } from 'vitest';
import { rewriteManifest, assertAuthorizedTarget } from './index';

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
});
