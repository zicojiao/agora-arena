import { Readable } from 'node:stream';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `npm run dev` serves `/api/*` from the same handlers Vercel runs (`server/index.js`), in-process, with keys from
 * `.env.local` (`vercel env pull .env.local`, or copy `.env.example`). Local pages are not password-protected, so
 * this calls the ungated `handleApi`; production goes through `api/[...path].js` and `middleware.js`.
 */
function localApi(): Plugin {
  return {
    name: 'agora-arena-local-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '');
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          // Loaded per request so edits to the server code apply without restarting Vite.
          const { handleApi } = await server.ssrLoadModule('/server/index.js') as {
            handleApi: (request: Request, env: Record<string, string>) => Promise<Response>;
          };
          const url = new URL(req.url, `http://${req.headers.host}`);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value);
            else if (value) value.forEach(v => headers.append(key, v));
          }
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const request = new Request(url, {
            method: req.method, headers,
            body: hasBody ? Readable.toWeb(req) as ReadableStream : undefined,
            ...(hasBody ? { duplex: 'half' } : {}),
          } as RequestInit);
          const response = await handleApi(request, env);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => { if (key !== 'set-cookie') res.setHeader(key, value); });
          const cookies = response.headers.getSetCookie();
          if (cookies.length) res.setHeader('set-cookie', cookies);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
  build: { target: 'es2022' },
  // The Reactor SDK imports its wasm glue relative to its own file (`./wasm/reactor_wasm.js`). Pre-bundling
  // moves the SDK into .vite/deps where that folder does not exist; production copies it next to the bundle
  // (scripts/copy-reactor-wasm.mjs).
  // Its CommonJS dependencies still need pre-bundling to load as ES modules.
  optimizeDeps: {
    exclude: ['@reactor-team/js-sdk'],
    include: ['@reactor-team/js-sdk > awaitqueue', '@reactor-team/js-sdk > hls.js', '@reactor-team/js-sdk > mp4box'],
  },
});
