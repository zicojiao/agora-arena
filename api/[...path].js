import server from '../server/index.js';

/** Vercel entry for every `/api/*` route: password gate plus the shared handlers in `server/index.js`. */
export default {
  fetch(request) {
    return server.fetch(request, {
      ARENA_ACCESS_PASSWORD: process.env.ARENA_ACCESS_PASSWORD,
      REACTOR_API_KEY: process.env.REACTOR_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      AGORA_APP_ID: process.env.AGORA_APP_ID,
      AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE,
    });
  },
};
