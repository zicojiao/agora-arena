import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import worker, { FIGHTER_NAMES_ZH, moveNameFrom, moveNameFromChinese } from '../server/index.js';
import { FIGHTERS_ZH } from '../src/i18n/fighters';
const base = 'https://agora-arena.example.vercel.app/api/ultimate/voice?attacker=EMBERPAW&opponent=CLOUDHOP';
const env = { OPENAI_API_KEY: 'test-key', ARENA_ACCESS_PASSWORD: 'test-access-only' };
let cookie;
beforeAll(async () => {
  const response = await worker.fetch(new Request('https://agora-arena.example.vercel.app/api/access', { method: 'POST', body: new URLSearchParams({ password: env.ARENA_ACCESS_PASSWORD }) }), env);
  cookie = response.headers.get('set-cookie').split(';')[0];
});
const authenticatedWorker = { fetch(request, env) { request.headers.set('cookie', cookie); return worker.fetch(request, env); } };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('voice ultimate endpoint boundaries', () => {
  it('accepts a direct English move without a provider call', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call);
    const response = await authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://agora-arena.example.vercel.app' }, body: JSON.stringify({ text: 'Flame Punch: a fireball strikes the rabbit' }) }), env);
    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe('Flame Punch');
    expect(call).not.toHaveBeenCalled();
  });
  it('rejects foreign origins before contacting a provider', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call);
    const response = await authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { origin: 'https://example.com' }, body: '{}' }), env);
    expect(response.status).toBe(403); expect(call).not.toHaveBeenCalled();
  });
  it('rejects a streamed oversize audio body before any paid transcription', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call);
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1_000_001)); c.enqueue(new Uint8Array(1_000_001)); c.close(); } });
    const response = await authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: stream, duplex: 'half' }), env);
    expect(response.status).toBe(413); expect(call).not.toHaveBeenCalled();
  });
  it('turns provider network failures into a retryable JSON error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const response = await authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: new Uint8Array(1000) }), env);
    expect(response.status).toBe(502); expect((await response.json()).error).toMatch(/voice|transcription/i);
  });
  it('bounds transcription provider response time', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError'))))));
    const result = authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: new Uint8Array(1000) }), env);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(30_000);
    const response = await result;
    expect(response.status).toBe(504);
  });
});

describe('live voice session and LLM-free composition', () => {
  it('keeps Fire in an unnamed Fire Dragon move', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call);
    const response = await authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Fire Dragon' }) }), env);
    expect(await response.json()).toMatchObject({ name: 'Fire Dragon', description: 'Fire Dragon', composed: false });
    expect(call).not.toHaveBeenCalled();
  });
  it('can format confirmed text without an OpenAI key', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call);
    const response = await authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'A giant clockwork octopus grabs the opponent' }) }), { ...env, OPENAI_API_KEY: '' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ description: 'A giant clockwork octopus grabs the opponent', composed: false });
    expect(call).not.toHaveBeenCalled();
  });
  const sessionUrl = 'https://agora-arena.example.vercel.app/api/ultimate/session';
  const offer = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
  it('relays SDP with a server-fixed transcription session, never returning the project key', async () => {
    let config;
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      expect(url).toBe('https://api.openai.com/v1/realtime/calls');
      config = JSON.parse(options.body.get('session'));
      expect(options.body.get('sdp')).toBe(offer);
      return new Response('v=0\r\ns=answer', { status: 201 });
    }));
    const response = await authenticatedWorker.fetch(new Request(sessionUrl, { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: offer }), env);
    expect(response.status).toBe(200);
    expect(config).toMatchObject({ type: 'transcription', audio: { input: { transcription: { model: 'gpt-live-transcribe', languages: ['en'] }, turn_detection: null } } });
    expect(await response.text()).toBe('v=0\r\ns=answer');
    expect(response.headers.get('content-type')).toContain('application/sdp');
  });
  it('protects the session relay against unauthenticated, foreign and oversized requests', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call);
    expect((await worker.fetch(new Request(sessionUrl, { method: 'POST', body: offer }), env)).status).toBe(401);
    expect((await authenticatedWorker.fetch(new Request(sessionUrl, { method: 'POST', headers: { origin: 'https://evil.example' }, body: offer }), env)).status).toBe(403);
    expect((await authenticatedWorker.fetch(new Request(sessionUrl, { method: 'POST', body: 'v=0' + 'a'.repeat(70_000) }), env)).status).toBe(413);
    expect(call).not.toHaveBeenCalled();
  });
  it('returns a recoverable error when live transcription is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('provider credentials and debug details', { status: 429 })));
    const response = await authenticatedWorker.fetch(new Request(sessionUrl, { method: 'POST', body: offer }), env);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('credentials');
  });
  it('names a described move from its own words without any LLM call', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call);
    const response = await authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Make a giant water whale fall from the sky and crush Cloudhop' }) }), env);
    expect(await response.json()).toMatchObject({ name: 'Giant Water Whale', description: 'Make a giant water whale fall from the sky and crush Cloudhop', composed: false });
    expect(call).not.toHaveBeenCalled();
  });
  it('keeps the attack verb when the move noun is a single word', async () => {
    for (const [text, name] of [['Launch a meteor at Cloudhop', 'Launch Meteor'], ['Throw a lightning spear at him', 'Lightning Spear']]) {
      const response = await authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }), env);
      expect((await response.json()).name).toBe(name);
    }
  });
  it('keeps typed non-English moves verbatim, naming them by the first clause', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call);
    const response = await authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '火龙拳，一条火龙冲向对手' }) }), env);
    expect(await response.json()).toMatchObject({ name: '火龙拳', description: '火龙拳，一条火龙冲向对手', composed: false });
    expect(call).not.toHaveBeenCalled();
  });
  it('uses a clear short English attack command directly without an LLM rewrite', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call);
    const response = await authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Breathe fire at my opponent!' }) }), env);
    expect(await response.json()).toMatchObject({ name: 'Breathe Fire', description: 'Breathe fire at my opponent!', composed: false });
    expect(call).not.toHaveBeenCalled();
  });
});

it('keeps the summoned creature in a short direct move title without a paid rewrite', async () => {
  const call = vi.fn(); vi.stubGlobal('fetch', call);
  const response = await authenticatedWorker.fetch(new Request(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Summon a fire dragon!' }) }), env);
  expect(await response.json()).toMatchObject({ name: 'Fire Dragon', description: 'Summon a fire dragon!', composed: false });
  expect(call).not.toHaveBeenCalled();
});

describe('Chinese voice ultimates', () => {
  const origin = 'https://agora-arena.example.vercel.app';
  const sessionUrl = `${origin}/api/ultimate/session?lang=zh`;
  const offer = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
  const compose = (text, lang = 'zh') => authenticatedWorker.fetch(new Request(`${base}&lang=${lang}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ text }),
  }), env);

  it('a Chinese interface opens a Mandarin transcription session that stays in Chinese', async () => {
    let config;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => { config = JSON.parse(options.body.get('session')); return new Response('v=0\r\ns=answer', { status: 201 }); }));
    const response = await authenticatedWorker.fetch(new Request(sessionUrl, { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: offer }), env);
    expect(response.status).toBe(200);
    const transcription = config.audio.input.transcription;
    expect(transcription.languages).toEqual(['zh']);
    expect(transcription.keywords).toEqual(FIGHTER_NAMES_ZH);
    expect(transcription.prompt).toMatch(/简体中文/);
    expect(transcription.prompt).toMatch(/不要翻译/);
    expect(config.audio.input.turn_detection).toBeNull();
  });

  it('server keywords match the Chinese fighter names the game shows', () => {
    expect(FIGHTER_NAMES_ZH).toEqual(Object.values(FIGHTERS_ZH).map(f => f.name));
  });

  it('keeps the Chinese description verbatim and names the move without any LLM call', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call);
    const response = await compose('召唤一条巨大的水龙从天而降砸向对手');
    expect(await response.json()).toMatchObject({ name: '巨大水龙', description: '召唤一条巨大的水龙从天而降砸向对手', composed: false });
    expect(call).not.toHaveBeenCalled();
  });

  it('answers errors in Chinese for a Chinese interface', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const response = await compose('嗯');
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe('没有听到声音');
    expect((await (await compose('a', 'en')).json()).error).toBe('No speech heard');
  });

  it.each([
    ['火龙拳，一条火龙冲向对手', '火龙拳'],
    ['看招！烈焰旋风斩', '烈焰旋风斩'],
    ['召唤一条巨大的水龙从天而降砸向对手', '巨大水龙'],
    ['喷出一道烈火！', '喷出烈火'],
    ['召唤巨浪拍过去！', '召唤巨浪'],
    ['变成一只巨大的金色凤凰扑向敌人', '巨大金色凤凰'],
    ['我要发动一记冰封千里，把对手冻住', '冰封千里'],
    ['给我召唤一只巨型章鱼缠住他', '巨型章鱼'],
    ['用一把燃烧的巨剑砍向对手', '燃烧巨剑'],
    ['天降雷霆', '天降雷霆'],
  ])('names %s as %s', (text, name) => {
    expect(moveNameFromChinese(text)).toBe(name);
    expect(moveNameFrom(text)).toBe(name);
  });

  it('never returns a name longer than eight characters', () => {
    expect(moveNameFromChinese('无与伦比超级无敌宇宙终极大爆炸').length).toBeLessThanOrEqual(8);
  });

  it('the legacy audio route asks for Chinese transcription', async () => {
    let form;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => { form = options.body; return Response.json({ text: '火龙拳' }); }));
    const response = await authenticatedWorker.fetch(new Request(`${base}&lang=zh`, { method: 'POST', headers: { 'content-type': 'audio/webm', origin }, body: new Uint8Array(2000) }), env);
    expect(response.status).toBe(200);
    expect(form.get('language')).toBe('zh');
    expect(form.get('prompt')).toMatch(/简体中文/);
  });
});
