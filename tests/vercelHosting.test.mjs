import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import middleware from '../middleware.js';
import api from '../api/[...path].js';
import agoraToken from '../api/agora/token.js';
import agentStart from '../api/agora/agent/start.js';
import agentStop from '../api/agora/agent/stop.js';
import reactorToken from '../api/reactor/token.js';
import voice from '../api/ultimate/voice.js';
import liveSession from '../api/ultimate/session.js';

const origin = 'https://agora-arena.example.vercel.app';
const request = (path, init) => new Request(origin + path, init);
async function login() {
  const response = await middleware(request('/api/access?next=%2F%3Froom%3DABC234', {
    method: 'POST', headers: { origin }, body: new URLSearchParams({ password: 'test-only-password' }),
  }));
  return { response, cookie: response.headers.get('set-cookie').split(';')[0] };
}

beforeEach(() => {
  vi.stubEnv('ARENA_ACCESS_PASSWORD', 'test-only-password');
  for (const key of ['REACTOR_API_KEY', 'OPENAI_API_KEY', 'AGORA_APP_ID', 'AGORA_APP_CERTIFICATE']) vi.stubEnv(key, 'configured-test-value');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('native Vercel hosting', () => {
  it('exposes every nested provider URL as an explicit Vercel function entry', async () => {
    for (const [path, route] of [['agora/token', agoraToken], ['agora/agent/start', agentStart], ['agora/agent/stop', agentStop], ['reactor/token', reactorToken], ['ultimate/voice', voice], ['ultimate/session', liveSession]]) {
      expect(route).toBe(api);
      expect((await route.fetch(request('/api/' + path))).status).toBe(401);
    }
  });
  it('loads both server entry points in native Node without a TypeScript loader', () => {
    expect(() => execFileSync(process.execPath, ['--no-experimental-strip-types', '--input-type=module', '-e',
      "await import('./middleware.js'); await import('./api/[...path].js');"], { cwd: new URL('../', import.meta.url), stdio: 'pipe' })).not.toThrow();
  });
  it('fails closed without a password and gates static bundles and provider APIs', async () => {
    expect(await (await middleware(request('/assets/game.js'))).text()).toContain('Access password');
    expect((await middleware(request('/api/reactor/token', { method: 'POST' }))).status).toBe(401);
    expect((await api.fetch(request('/api/agora/token'))).status).toBe(401);
    expect((await middleware(request('/preview/emberpaw.webp'))).headers.get('x-middleware-next')).toBe('1');
    vi.stubEnv('ARENA_ACCESS_PASSWORD', '');
    expect((await middleware(request('/'))).status).toBe(503);
  });

  it('signs a secure cookie, preserves room links, and unlocks files without shared caching', async () => {
    const { response, cookie } = await login();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/?room=ABC234');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
    const allowed = await middleware(request('/assets/game.js', { headers: { cookie } }));
    expect(allowed.headers.get('x-middleware-next')).toBe('1');
    expect(allowed.headers.get('cache-control')).toBe('private, no-store');
  });

  it('routes health and direct English move text through the shared backend without provider calls', async () => {
    const provider = vi.fn(); vi.stubGlobal('fetch', provider);
    const { cookie } = await login();
    const health = await api.fetch(request('/api/health', { headers: { cookie } }));
    expect(await health.json()).toMatchObject({ ok: true, reactorConfigured: true, agoraConfigured: true, voiceConfigured: true });
    const move = await api.fetch(request('/api/ultimate/voice', {
      method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Dragon Punch, a roaring fire dragon strikes the opponent.' }),
    }));
    expect(await move.json()).toMatchObject({ name: 'Dragon Punch', composed: false });
    expect(provider).not.toHaveBeenCalled();
  });

  it('keeps origin protection and returns JSON for unknown API routes', async () => {
    const provider = vi.fn(); vi.stubGlobal('fetch', provider);
    const { cookie } = await login();
    expect((await api.fetch(request('/api/reactor/token', { method: 'POST', headers: { cookie, origin: 'https://other.example' } }))).status).toBe(403);
    const missing = await api.fetch(request('/api/unknown', { headers: { cookie } }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'API route not found' });
    expect(provider).not.toHaveBeenCalled();
  });
});
