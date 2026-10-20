import { accessGate } from './access.js';
import { Agent, AgoraClient, Area, OpenAIGPTLive } from 'agora-agents';
import agoraToken from 'agora-token';
const { RtcRole, RtcTokenBuilder } = agoraToken;

const REACTOR_MODEL = 'reactor/fast-h3-omni';
const TOKEN_LIFETIME_SECONDS = 30 * 60;
const AGORA_AGENT_UID = '900001';
const GPT_LIVE_MODEL = 'gpt-live-1';
const ALLOWED_FIGHTERS = new Set(['EMBERPAW', 'CLOUDHOP', 'STONEGUARD', 'SCRAPCLAW', 'STORMHORN', 'MOSSBITE', 'PEBBLEPOP', 'PUFFVOLT', 'CINDERVEIL', 'TIDEKNUCKLE']);
/** The same fighters' Chinese names (src/i18n/fighters.ts), so Chinese transcription spells them right. */
export const FIGHTER_NAMES_ZH = ['焰爪', '云跳', '岩卫', '铁爪', '雷角', '苔牙', '石豆', '绒电', '烬纱', '潮拳'];

/** The interface language a voice request came from. Anything but `zh` is English. */
const requestLang = request => (new URL(request.url).searchParams.get('lang') === 'zh' ? 'zh' : 'en');
/** A player-facing error in the request's language. */
const say = (lang, en, zh) => (lang === 'zh' ? zh : en);

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...init.headers },
});
const fail = (status, error, detail) => json({ error, ...(detail ? { detail } : {}) }, { status });

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

async function issueReactorToken(request, env) {
  if (!env.REACTOR_API_KEY) return fail(503, 'Reactor is not configured');
  if (!sameOrigin(request)) return fail(403, 'Invalid request origin');
  const response = await fetch('https://api.reactor.inc/tokens', {
    method: 'POST',
    headers: { 'Reactor-API-Key': env.REACTOR_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      expires_after: TOKEN_LIFETIME_SECONDS,
      authorization_details: [{ type: 'session', resources: { models: { match: [REACTOR_MODEL] } }, constraints: { max_sessions: 1 } }],
    }),
  });
  if (!response.ok) return fail(502, `Reactor token service returned ${response.status}`);
  const result = await response.json();
  if (!result.jwt || !Number.isFinite(result.expires_at)) return fail(502, 'Reactor returned an invalid token');
  return json({ jwt: result.jwt, expires_at: result.expires_at });
}

function agoraClient(env) {
  return new AgoraClient({
    area: Area.US,
    appId: env.AGORA_APP_ID,
    appCertificate: env.AGORA_APP_CERTIFICATE,
  });
}

function issueAgoraToken(request, env) {
  if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) return fail(503, 'Agora is not configured');
  if (!sameOrigin(request)) return fail(403, 'Invalid request origin');
  const url = new URL(request.url);
  const suppliedUid = Number.parseInt(url.searchParams.get('uid') || '', 10);
  const uid = Number.isFinite(suppliedUid) && suppliedUid > 0
    ? suppliedUid
    : Math.floor(Math.random() * 9_999_000) + 1000;
  const channel = url.searchParams.get('channel') || `goat-clash-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const expires = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  try {
    const token = RtcTokenBuilder.buildTokenWithRtm(
      env.AGORA_APP_ID,
      env.AGORA_APP_CERTIFICATE,
      channel,
      String(uid),
      RtcRole.PUBLISHER,
      expires,
      expires,
    );
    return json({ appId: env.AGORA_APP_ID, token, uid: String(uid), channel });
  } catch (error) {
    return fail(500, 'Could not create Agora RTC + RTM token', String(error));
  }
}

async function startAgoraAgent(request, env) {
  if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE || !env.OPENAI_API_KEY) {
    return fail(503, 'Agora GPT Live is not configured');
  }
  if (!sameOrigin(request)) return fail(403, 'Invalid request origin');
  let payload;
  try { payload = await request.json(); } catch { return fail(400, 'Request body must be JSON'); }
  const requesterId = String(payload?.requester_id || '');
  const channel = String(payload?.channel_name || '');
  const fighterOne = ALLOWED_FIGHTERS.has(payload?.fighter_one) ? payload.fighter_one : 'EMBERPAW';
  const fighterTwo = ALLOWED_FIGHTERS.has(payload?.fighter_two) ? payload.fighter_two : 'CLOUDHOP';
  if (!/^\d{1,10}$/.test(requesterId) || !/^goat-clash-[a-zA-Z0-9-]{8,96}$/.test(channel)) {
    return fail(400, 'A valid requester_id and channel_name are required');
  }
  try {
    const directorPrompt = [
      `You are the ringside hype announcer for Agora Arena, a playful original fantasy fighting game: ${fighterOne} against ${fighterTwo}. They battle in a floating overgrown arena. Preserve their original appearances from the game.`,
      `${fighterOne}'s FastH3 ultimate is fully charged and the player is about to say what it is.`,
      'Speak English. Switch languages only after the player has clearly spoken a whole sentence in another language, and then reply in that language.',
      'Always write the ULTIMATE line in English.',
      'As soon as the player names or describes a move, do not ask questions: reply with one short hype sentence (under 20 words),',
      `then end the same reply with exactly: ULTIMATE: <Move Name> — <one vivid, non-gory cinematic sentence of what ${fighterOne} does to ${fighterTwo}, with sound>.`,
      'Only if the player said nothing usable, ask them once to shout their move name.',
    ].join(' ');
    const agent = new Agent({
      client: agoraClient(env),
      advancedFeatures: { enable_rtm: true, enable_tools: false },
      parameters: {
        audio_scenario: 'chorus',
        data_channel: 'rtm',
        enable_error_message: true,
        enable_metrics: true,
      },
    }).withMllm(new OpenAIGPTLive({
      apiKey: env.OPENAI_API_KEY,
      model: GPT_LIVE_MODEL,
      voice: 'cedar',
      prompt: directorPrompt,
      greeting: `Ultimate charged! Shout ${fighterOne}'s move name and what it does!`,
      delegation: 'responses',
      responsesModel: 'gpt-5.6-sol',
      params: { alpha_selector: undefined },
    }));
    const session = agent.createSession({
      name: `goat-clash-${Date.now()}`,
      channel,
      agentUid: AGORA_AGENT_UID,
      remoteUids: [requesterId],
      idleTimeout: 30,
      expiresIn: TOKEN_LIFETIME_SECONDS,
      debug: false,
    });
    const agentId = await session.start();
    return json({ agent_id: agentId, state: 'RUNNING', create_ts: Math.floor(Date.now() / 1000) });
  } catch (error) {
    return fail(502, 'Could not start Agora GPT Live agent', error instanceof Error ? error.message : String(error));
  }
}

const TRANSCRIBE_MODEL = 'gpt-4o-transcribe';
const LIVE_TRANSCRIBE_MODEL = 'gpt-live-transcribe';
const MAX_AUDIO_BYTES = 2_000_000;

/**
 * Turn a spoken (or typed) ultimate into { transcript, name, description } for the FastH3 prompt.
 * Confirmed live text is preserved without an LLM rewrite. Legacy audio uploads use transcription only.
 */
// Bound both upload memory and provider latency; a stalled STT call must remain retryable.
async function limitedBody(request, maxBytes) {
  if (Number(request.headers.get('content-length')) > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 });
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw Object.assign(new Error('Request too large'), { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

async function voiceProvider(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = response.ok ? await response.json() : null;
    return { ok: response.ok, status: response.status, data };
  } finally { clearTimeout(timer); }
}

/** The realtime transcription session for one ultimate. A Chinese interface listens for Mandarin and keeps it in Chinese. */
export function liveTranscriptionSession(lang) {
  const transcription = lang === 'zh'
    ? {
      model: LIVE_TRANSCRIBE_MODEL,
      languages: ['zh'],
      keywords: FIGHTER_NAMES_ZH,
      prompt: '只转写普通话，输出简体中文。玩家正在用中文描述一个原创格斗游戏里的必杀技。逐字忠实转写，保留招式名和描述，不要翻译成英文，不要编造招式。',
      delay: 'low',
    }
    : {
      model: LIVE_TRANSCRIBE_MODEL,
      languages: ['en'],
      keywords: [...ALLOWED_FIGHTERS],
      prompt: 'English only. A player describes an original fighting-game ultimate attack in English. Transcribe the spoken words faithfully; do not invent or translate a move.',
      delay: 'low',
    };
  return { type: 'transcription', audio: { input: { transcription, turn_detection: null } } };
}

/** SDP only: credentials and the transcription configuration stay on the server. */
async function liveVoiceSession(request, env) {
  if (!env.OPENAI_API_KEY) return fail(503, 'Live transcription is not configured');
  if (!sameOrigin(request)) return fail(403, 'Invalid request origin');
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20_000);
  try {
    const sdp = new TextDecoder().decode(await limitedBody(request, 32_768));
    if (!sdp.startsWith('v=0') || !sdp.includes('m=audio')) return fail(400, 'Send a microphone SDP offer');
    if (request.signal.aborted) return fail(499, 'Voice session cancelled');
    const form = new FormData();
    form.set('sdp', sdp);
    form.set('session', JSON.stringify(liveTranscriptionSession(requestLang(request))));
    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form, signal: controller.signal,
    });
    if (!response.ok) return fail(502, 'Live transcription is unavailable — retry or type your move');
    return new Response(await response.text(), { headers: { 'content-type': 'application/sdp', 'cache-control': 'no-store' } });
  } catch (error) {
    if (error?.status === 413) return fail(413, 'Voice session offer is too large');
    return fail(error?.name === 'AbortError' ? 504 : 502, 'Could not connect live transcription — retry or type your move');
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
  }
}

async function voiceUltimate(request, env) {
  try { return await composeVoiceUltimate(request, env); }
  catch (error) {
    if (error?.status === 413) return fail(413, 'Recording or text is too large');
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return fail(504, 'Voice transcription timed out — retry or type your move');
    return fail(502, 'Voice transcription is unavailable — retry or type your move');
  }
}

async function composeVoiceUltimate(request, env) {
  if (!sameOrigin(request)) return fail(403, 'Invalid request origin');
  const lang = requestLang(request);
  const type = request.headers.get('content-type') || '';
  let transcript = '';
  if (type.startsWith('audio/')) {
    if (!env.OPENAI_API_KEY) return fail(503, say(lang, 'Voice ultimates are not configured', '服务器没有配置语音必杀'));
    const audio = await limitedBody(request, MAX_AUDIO_BYTES);
    if (audio.byteLength < 800) return fail(422, say(lang, 'No speech heard', '没有听到声音'));
    if (audio.byteLength > MAX_AUDIO_BYTES) return fail(413, say(lang, 'Recording too long', '录音太长了'));
    const form = new FormData();
    form.append('model', TRANSCRIBE_MODEL);
    form.append('file', new Blob([audio], { type }), `move.${type.includes('mp4') ? 'mp4' : type.includes('wav') ? 'wav' : type.includes('ogg') ? 'ogg' : 'webm'}`);
    if (lang === 'zh') form.append('language', 'zh');
    form.append('prompt', lang === 'zh' ? '玩家用中文喊出格斗游戏必杀技的名字和效果，请用简体中文转写。' : 'A player shouting the name of a fighting-game ultimate move and what it does.');
    const response = await voiceProvider('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form });
    if (!response.ok) return fail(502, say(lang, `Transcription failed (${response.status})`, `转写失败（${response.status}）`));
    transcript = String(response.data?.text || '').trim();
  } else {
    let body;
    try { body = JSON.parse(new TextDecoder().decode(await limitedBody(request, 4096))); } catch (error) { if (error?.status === 413) throw error; return fail(400, say(lang, 'Send audio or { "text": "…" }', '请发送录音或 { "text": "…" }')); }
    transcript = String(body?.text || '').trim().slice(0, 400);
  }
  if (!transcript || transcript.replace(/[\s\p{P}]/gu, '').length < 2) return fail(422, say(lang, 'No speech heard', '没有听到声音'), transcript);

  const direct = transcript.match(/^([A-Za-z][A-Za-z' ]{2,40}?)\s*[,.!:—–-]\s*(.{8,})$/s);
  if (direct && /^[\x00-\x7F]*$/.test(transcript) && direct[1].trim().split(/\s+/).length <= 5) {
    return json({ transcript, name: titleCase(direct[1]), description: direct[2].trim(), composed: false });
  }
  // Preserve the player's idea and avoid a serial LLM request; only the display name is derived.
  return json({ transcript, name: moveNameFrom(transcript), description: transcript, composed: false });
}

/** Leading words that carry no move identity: fillers, pronouns, articles and generic "make it happen" verbs. */
const LEAD_WORDS = new Set(['i', "i'll", 'ill', 'im', "i'm", 'let', "let's", 'lets', 'please', 'now', 'ok', 'okay', 'so', 'and', 'then',
  'make', 'use', 'do', 'cast', 'call', 'send', 'have', 'go', 'get', 'give', 'try', 'want', 'to', 'a', 'an', 'the', 'my', 'some', 'it', 'this', 'that',
  'throw', 'shoot', 'launch', 'summon', 'hurl', 'unleash', 'create', 'conjure', 'release', 'drop', 'bring', 'form', 'turn', 'become', 'spawn']);
const ATTACK_VERBS = new Set(['throw', 'shoot', 'launch', 'hurl', 'unleash', 'summon', 'conjure', 'cast', 'release', 'drop', 'spawn']);
/** Words that end the noun phrase naming the move ("giant water whale | fall from the sky"). */
const STOP_WORDS = new Set(['that', 'which', 'who', 'to', 'and', 'from', 'into', 'onto', 'at', 'on', 'with', 'of', 'in', 'for', 'then', 'so',
  'fall', 'falls', 'crush', 'crushes', 'hit', 'hits', 'smash', 'smashes', 'slam', 'slams', 'attack', 'attacks', 'strike', 'strikes',
  'him', 'them', 'me', 'it', 'opponent', 'come', 'comes', 'fly', 'flies', 'rain', 'rains', 'burn', 'burns', 'blast', 'blasts', 'and', 'my', 'his', 'her', 'their', 'the', 'a', 'an']);

/** A short, readable move name from free speech: "Make a giant water whale fall…" → "Giant Water Whale". */
export function moveNameFrom(transcript) {
  const text = transcript.trim();
  if (CJK.test(text)) return moveNameFromChinese(text);
  if (!/^[\x00-\x7F]+$/.test(text)) {
    // Typed in another language: the first clause, kept short.
    const clause = text.split(/[，,。.!！?？:：;；—–-]/)[0].trim();
    return (clause || text).slice(0, 12);
  }
  const words = text.replace(/[^A-Za-z' -]/g, ' ').split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < words.length - 1 && LEAD_WORDS.has(words[i].toLowerCase())) i++;
  const verb = words.slice(0, i).findLast(w => ATTACK_VERBS.has(w.toLowerCase())) ?? '';
  const name = [];
  for (; i < words.length && name.length < 3; i++) {
    if (name.length && STOP_WORDS.has(words[i].toLowerCase())) break;
    name.push(words[i]);
  }
  // A lone noun reads as a label, not a move ("Meteor"); keep the verb that launched it ("Launch Meteor").
  if (name.length === 1 && verb) name.unshift(verb);
  return titleCase(name.join(' ') || words.slice(0, 3).join(' ') || 'Ultimate').slice(0, 48);
}

const CJK = /[\u3400-\u9fff]/;
/** Openers that carry no move identity: "我要", "给我", "看招"… */
const ZH_FILLERS = ['我要', '我想', '我来', '我', '给我', '帮我', '让我', '让', '快', '好', '那就', '现在', '然后', '就', '看我的', '看招', '接招', '吃我一招', '来吧', '来'];
/** Casting verbs. The ones in ZH_KEEP_VERB read as part of the name when only a short noun is left ("召唤巨龙"). */
const ZH_CAST = ['召唤出', '召唤', '释放出', '释放', '放出', '发动', '使出', '施展', '祭出', '变出', '变成', '化身为', '化身', '喷出', '射出', '打出', '甩出', '扔出', '丢出', '用', '一招', '一记', '一发'];
const ZH_KEEP_VERB = new Set(['召唤出', '召唤', '释放出', '释放', '发动', '使出', '施展', '祭出', '喷出', '射出']);
const ZH_MEASURE = /^(?:一|两|几|无数)(?:条|个|只|道|把|团|股|阵|片|头|颗|记|发|支|根|座|面|轮|场|群|波|束|枚|张|尊|位|颗颗)/;
/** Where the noun phrase that names the move ends: direction, target or the action that follows it. */
const ZH_END = /(?:从|朝着?|往|对着|向着|把|将|攻击|击中|打中|命中|(?:冲|砸|打|扑|飞|射|劈|砍|撞|轰|压|卷|拍|喷|刺|击|扔|丢|甩|落|降|袭|冲)(?:向|过去|过来|下去|下来|上去|到|在|中)|(?:劈|砍|打|砸|轰|炸|烧|冻|电|淹|撞|踢|揍|吞|咬|缠|困|吹|卷|抓|包)(?:住|上|起|倒|飞|翻|死)?(?:他|她|它|对手|敌人|对方))/;

/** A short Chinese move name from free speech: "召唤一条巨大的水龙从天而降砸向对手" → "巨大水龙". */
export function moveNameFromChinese(transcript) {
  const text = transcript.trim();
  // A spoken name before the first pause is the name: "火龙拳，一条火龙冲向对手" → "火龙拳".
  // Skip a clause that is only an opener ("看招！烈焰旋风斩" names 烈焰旋风斩).
  let clause = (text.split(/[，,。.!！?？:：;；、…—\s]/).find(part => part.trim() && !ZH_FILLERS.includes(part.trim())) ?? text).trim();
  let verb = '';
  for (let changed = true; changed;) {
    changed = false;
    for (const word of [...ZH_FILLERS, ...ZH_CAST]) {
      if (clause.startsWith(word) && clause.length > word.length) {
        if (ZH_CAST.includes(word)) verb = word;
        clause = clause.slice(word.length); changed = true;
      }
    }
    const measure = clause.match(ZH_MEASURE);
    if (measure && clause.length > measure[0].length) { clause = clause.slice(measure[0].length); changed = true; }
  }
  const end = clause.slice(1).search(ZH_END);
  if (end >= 0) clause = clause.slice(0, end + 1);
  clause = clause.replace(/的/g, '').replace(/[“”"'「」『』]/g, '').trim();
  if (clause.length <= 2 && ZH_KEEP_VERB.has(verb)) clause = verb + clause;
  return (clause || text).slice(0, 8);
}

const titleCase = s => s.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

async function stopAgoraAgent(request, env) {
  if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) return fail(503, 'Agora is not configured');
  if (!sameOrigin(request)) return fail(403, 'Invalid request origin');
  let payload;
  try { payload = await request.json(); } catch { return fail(400, 'Request body must be JSON'); }
  const agentId = String(payload?.agent_id || '');
  if (!agentId || agentId.length > 160) return fail(400, 'agent_id is required');
  try {
    await agoraClient(env).stopAgent(agentId);
    return json({ success: true });
  } catch (error) {
    const statusCode = error && typeof error === 'object' ? error.statusCode : undefined;
    if (statusCode === 404) return json({ success: true, state: 'already-stopped' });
    return fail(502, 'Could not stop Agora agent', error instanceof Error ? error.message : String(error));
  }
}

/**
 * The API routes without the password gate. Vercel reaches them through `api/[...path].js` (gated below); the
 * local Vite dev server calls this directly, since local pages are not password-protected either.
 */
export async function handleApi(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/reactor/token') return issueReactorToken(request, env);
    if (request.method === 'GET' && url.pathname === '/api/agora/token') return issueAgoraToken(request, env);
    if (request.method === 'POST' && url.pathname === '/api/agora/agent/start') return startAgoraAgent(request, env);
    if (request.method === 'POST' && url.pathname === '/api/agora/agent/stop') return stopAgoraAgent(request, env);
    if (request.method === 'POST' && url.pathname === '/api/ultimate/session') return liveVoiceSession(request, env);
    if (request.method === 'POST' && url.pathname === '/api/ultimate/voice') return voiceUltimate(request, env);
    if (request.method === 'GET' && url.pathname === '/api/health') return json({
      ok: true,
      model: REACTOR_MODEL,
      reactorConfigured: Boolean(env.REACTOR_API_KEY),
      agoraConfigured: Boolean(env.AGORA_APP_ID && env.AGORA_APP_CERTIFICATE),
      voiceConfigured: Boolean(env.OPENAI_API_KEY),
      voiceRuntime: 'openai-realtime-transcription',
      voiceModel: LIVE_TRANSCRIBE_MODEL,
      fileTranscriptionModel: TRANSCRIBE_MODEL,
      compositionMode: 'verbatim',
    });
    return env.ASSETS ? env.ASSETS.fetch(request) : fail(404, 'API route not found');
}

/** Password gate, then the API. `env.ASSETS` (optional) serves anything that is not an API route. */
export default {
  async fetch(request, env) {
    const denied = await accessGate(request, env);
    return denied ?? handleApi(request, env);
  },
};
