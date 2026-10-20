import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../server/index.js';
const origin = 'https://agora-arena.example.vercel.app';
const env = { ARENA_ACCESS_PASSWORD: 'test-preview-password', ASSETS: { fetch: vi.fn(async () => new Response('game assets')) } };
const login = (password = env.ARENA_ACCESS_PASSWORD, next = '/') => worker.fetch(new Request(origin + '/api/access?next=' + encodeURIComponent(next), { method: 'POST', headers: { origin }, body: new URLSearchParams({ password }) }), env);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); env.ASSETS.fetch.mockClear(); });
describe('private preview access', () => {
  it('serves only a password page before login, including direct asset links', async () => {
    for (const path of ['/', '/assets/index.js']) {
      const response = await worker.fetch(new Request(origin + path), env);
      expect(await response.text()).toContain('Access password');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it('blocks every API before any provider request', async () => {
    const provider = vi.fn(); vi.stubGlobal('fetch', provider);
    for (const path of ['/api/reactor/token', '/api/agora/token', '/api/agora/agent/start', '/api/agora/agent/stop', '/api/ultimate/voice', '/api/health']) {
      const response = await worker.fetch(new Request(origin + path, { method: 'POST' }), env);
      expect(response.status).toBe(401);
    }
    expect(provider).not.toHaveBeenCalled();
  });
  it('rejects a wrong password without setting a cookie', async () => {
    const response = await login('incorrect');
    expect(response.status).toBe(401); expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.text()).toContain('Incorrect password');
  });
  it('logs in, preserves room links, and unlocks assets and APIs', async () => {
    const response = await login(undefined, '/?room=ABC234');
    expect(response.status).toBe(303); expect(response.headers.get('location')).toBe('/?room=ABC234');
    const cookie = response.headers.get('set-cookie');
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Lax; Max-Age=604800/);
    expect(cookie).not.toContain(env.ARENA_ACCESS_PASSWORD);
    for (const path of ['/assets/index.js', '/api/health']) expect((await worker.fetch(new Request(origin + path, { headers: { cookie: cookie.split(';')[0] } }), env)).status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
  });
  it('rejects forged cookies and cookies signed with the previous password', async () => {
    const loginResponse = await login(); const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
    for (const [value, password] of [[cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a'), env.ARENA_ACCESS_PASSWORD], [cookie, 'new-password']]) {
      expect((await worker.fetch(new Request(origin + '/api/health', { headers: { cookie: value } }), { ...env, ARENA_ACCESS_PASSWORD: password })).status).toBe(401);
    }
  });
  it('expires sessions after seven days', async () => {
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now - 8 * 86400_000);
    const response = await login(); const cookie = response.headers.get('set-cookie').split(';')[0];
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect((await worker.fetch(new Request(origin + '/api/health', { headers: { cookie } }), env)).status).toBe(401);
  });
  it('rejects foreign login origins and external redirect destinations', async () => {
    const response = await login(undefined, '//example.com'); expect(response.headers.get('location')).toBe('/');
    const denied = await worker.fetch(new Request(origin + '/api/access', { method: 'POST', headers: { origin: 'https://example.com' } }), env);
    expect(denied.status).toBe(403);
  });
  it('allows only the exact preview artwork and fonts without opening game assets', async () => {
    for (const path of ['/art/verdant-arena.webp', '/brand/agora-wordmark.webp', '/preview/emberpaw.webp', '/preview/cloudhop.webp', '/preview/stoneguard.webp', '/preview/scrapclaw.webp', '/preview/stormhorn.webp', '/preview/mossbite.webp', '/preview/pebblepop.webp', '/preview/puffvolt.webp', '/preview/cinderveil.webp', '/preview/tideknuckle.webp', '/preview/barlow-condensed.woff2', '/preview/dm-sans.woff2']) {
      expect(await (await worker.fetch(new Request(origin + path), env)).text()).toBe('game assets');
    }
    env.ASSETS.fetch.mockClear();
    for (const path of ['/preview/private.js', '/fighters/emberpaw/combat.webp', '/api/reactor/token']) {
      await worker.fetch(new Request(origin + path), env);
    }
    await worker.fetch(new Request(origin + '/preview/emberpaw.webp', { method: 'POST' }), env);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it('fails closed if the password secret is missing', async () => {
    expect((await worker.fetch(new Request(origin), { ...env, ARENA_ACCESS_PASSWORD: undefined })).status).toBe(503);
  });
});
