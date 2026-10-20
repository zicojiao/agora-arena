import { next } from '@vercel/functions';
import { accessGate } from './server/access.js';

/** Gate HTML, static game assets and APIs before Vercel serves its cached files. */
export default async function middleware(request) {
  const denied = await accessGate(request, {
    ARENA_ACCESS_PASSWORD: process.env.ARENA_ACCESS_PASSWORD,
    ASSETS: { fetch: () => next() },
  });
  return denied ?? next({ headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } });
}

export const config = { matcher: '/:path*' };
