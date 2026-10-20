import { accessPage, PREVIEW_ASSETS } from './access-page.js';

const COOKIE = '__Host-arena_access';
const WEEK = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();
const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', vary: 'Cookie' };
const keyFor = password => crypto.subtle.importKey('raw', encoder.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');

const page = (next, wrong = false) => accessPage(next, wrong, headers);

/** Shared-password gate for HTML, assets and every paid API. No client-side secret. */
export async function accessGate(request, env) {
  const password = env.ARENA_ACCESS_PASSWORD;
  if (!password) return new Response('Private preview is temporarily unavailable.', { status: 503, headers });
  const url = new URL(request.url);
  if (['GET', 'HEAD'].includes(request.method) && PREVIEW_ASSETS.has(url.pathname)) return env.ASSETS.fetch(request);
  const key = await keyFor(password);
  if (url.pathname === '/api/access' && request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return new Response('Invalid origin', { status: 403, headers });
    let next = url.searchParams.get('next') || '/';
    if (!next.startsWith('/') || new URL(next, url.origin).origin !== url.origin) next = '/';
    let length = 0; const chunks = [];
    const reader = request.body?.getReader();
    if (reader) try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > 4096) { await reader.cancel(); return new Response('Request too large', { status: 413, headers }); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    const supplied = new URLSearchParams(new TextDecoder().decode(data)).get('password') || '';
    const signed = await crypto.subtle.sign('HMAC', key, encoder.encode('password-check'));
    const candidate = await keyFor(supplied || ' ');
    if (!await crypto.subtle.verify('HMAC', candidate, signed, encoder.encode('password-check'))) return page(next, true);
    const expires = String(Math.floor(Date.now() / 1000) + WEEK);
    const signature = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(expires)));
    return new Response(null, { status: 303, headers: { ...headers, location: next, 'set-cookie': `${COOKIE}=${expires}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${WEEK}` } });
  }
  const token = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const match = token?.match(/^(\d{10})\.([a-f0-9]{64})$/);
  const now = Math.floor(Date.now() / 1000);
  if (match && Number(match[1]) > now && Number(match[1]) <= now + WEEK) {
    const signature = Uint8Array.from(match[2].match(/../g), x => parseInt(x, 16));
    if (await crypto.subtle.verify('HMAC', key, signature, encoder.encode(match[1]))) return null;
  }
  if (url.pathname.startsWith('/api/')) return Response.json({ error: 'Access password required' }, { status: 401, headers });
  return page(url.pathname + url.search);
}
