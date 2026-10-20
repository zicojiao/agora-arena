import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { preloadFighters } from '../../game/assets';
import { ArrowLeft, Copy, Home, LoaderCircle, Mic, MicOff, Radio, RotateCcw, SkipForward, Swords, Users, Wifi, X } from 'lucide-react';
import { Battle } from '../../engine/battle';
import type { InputFrame } from '../../engine/types';
import { NULL_INPUT } from '../../engine/types';
import { GameCanvas } from '../GameCanvas';
import { TouchLayer } from '../TouchLayer';
import { clearHeld, createHeld, keyboardBind, toInputFrame } from '../input';
import { captureGameFrame, H3Session, type H3State } from '../../h3-session';
import { setArenaDuck, startArenaBgm } from '../../render/arenaBgm';
import { GAUGE_MAX, stepGauge, ultimateDamage, type ParsedUltimate } from '../../game/fasth3';
import { composeMove } from '../../game/voiceMove';
import { LiveMoveTranscriber } from '../../game/liveVoiceMove';
import { markFirstVideoFrame, markUlt, resetUltTimeline } from '../../game/timeline';
import { DEFAULT_SETUP, GOAT_STAGES, ROUNDS_TO_WIN, fighterById, localizedRoster, normalizeFighterId, normalizeSetup, stageById, stageLabel, type Settings } from '../../game/setup';
import { getLang, t, useLang } from '../../i18n';
import { Lockstep, stateHash, type InputBatch } from '../../online/lockstep';
import { newRoomCode, normalizeRoomCode, OnlineRoom, type GameMessage } from '../../online/room';
import { buildUltimatePrompt } from '../../game/ultimatePrompt';
import { ChargingChip, ControlsLegend, FastH3Gauge, ImpactBanner, MatchHud, PoweredBy, RoundBanner, UltimateRelease } from '../goat/Hud';
import { pumpChargeAura, setChargeAura, setChargeLabel } from '../../render/renderer';
import { UltimatePanel, type VoiceState } from '../goat/UltimatePanel';
import { ConfirmDialog, useLeaveGuard } from '../goat/Menus';
import { ControlsGuide } from '../goat/ControlsGuide';
import { AgoraBrand } from '../goat/AgoraBrand';

type View = 'entry' | 'connecting' | 'lobby' | 'fight' | 'result' | 'gone';
type Role = 'host' | 'guest';
type Side = 0 | 1;
type Phase = 'intro' | 'play' | 'roundEnd';
type UltStage = 'panel' | 'charging' | 'cinema';
type MatchInfo = { m: number; p1: string; p2: string; stage: string };
/** What the non-casting player knows about the opponent's ultimate. */
type Watch = { name?: string; description?: string; playing: boolean };
/** Ultimate events, all keyed by the tick the ultimate was opened on. `lock` resumes the fight while the clip
 * renders, `abort` cancels it, `progress` mirrors the caster's FastH3 stage, `end` lands (or drops) the hit once
 * both players have paused for the clip. */
type UltEvent = { ev: 'lock' | 'abort' | 'progress' | 'end'; name?: string; desc?: string; hit?: boolean; damage?: number; state?: H3State };
/** call: the caster is speaking (fight paused) · charging: the fight goes on while FastH3 renders · cinema: paused for the clip. */
type UltPhase = 'call' | 'charging' | 'cinema';

const INTRO_MS = 1500;
const ROUND_END_MS = 3400;
const SUM_EVERY = 120;
/** Pings go out every 2 s; this long without hearing anything from the opponent means they dropped. */
const PEER_TIMEOUT_MS = 12_000;
const ultKey = (m: number, r: number, t: number) => `${m}:${r}:${t}`;

function friendlyError(message: string) {
  if (/credits_depleted|balance is depleted|\b402\b/i.test(message)) return t('err.credits');
  if (/PERMISSION_DENIED|NotAllowedError|Permission denied/i.test(message)) return t('err.micBlockedOnline');
  return message;
}

export function OnlineMode({ settings, touch, initialCode, onExit }: {
  settings: Settings; touch: boolean; initialCode?: string | null; onExit: () => void;
}) {
  const lang = useLang();
  const [view, setView] = useState<View>('entry');
  const [role, setRole] = useState<Role>('host');
  const [code, setCode] = useState('');
  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [error, setError] = useState('');
  /** Why the room screen closed when it was not the opponent leaving (e.g. the room is full). */
  const [goneReason, setGoneReason] = useState('');
  const [myFighter, setMyFighter] = useState(DEFAULT_SETUP.playerId);
  const [peer, setPeer] = useState<{ uid: string; fighter: string } | null>(null);
  const [stageId, setStageId] = useState('nightfall');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [ping, setPing] = useState<number | null>(null);
  const [hasMic, setHasMic] = useState(false);
  const [copied, setCopied] = useState(false);

  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [round, setRound] = useState(1);
  const [wins, setWins] = useState<[number, number]>([0, 0]);
  const [ultCount, setUltCount] = useState<[number, number]>([0, 0]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [gauges, setGauges] = useState<[number, number]>([0, 0]);
  const [clock, setClock] = useState(60);
  const [stalled, setStalled] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [impact, setImpact] = useState<{ name: string; damage: number } | null>(null);
  const [cleanFrame, setCleanFrame] = useState(false);

  // Ultimate (both sides).
  const [ultCaster, setUltCaster] = useState<Side | null>(null);
  const [ultStage, setUltStage] = useState<UltStage | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [micLevel, setMicLevel] = useState(0);
  const [heard, setHeard] = useState('');
  const [moveText, setMoveText] = useState('');
  const [ultimate, setUltimate] = useState<ParsedUltimate | null>(null);
  const [h3State, setH3State] = useState<H3State | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [watch, setWatch] = useState<Watch | null>(null);
  const [remoteClip, setRemoteClip] = useState<MediaStreamTrack | null>(null);

  const roomRef = useRef<OnlineRoom | null>(null);
  const roleRef = useRef<Role>('host');
  const peerRef = useRef<{ uid: string; fighter: string } | null>(null);
  // Both fighters' sprite sheets load as soon as they are known, not when the match starts.
  useEffect(() => { void preloadFighters(peer ? [myFighter, peer.fighter] : [myFighter]); }, [myFighter, peer]);
  const myFighterRef = useRef(myFighter);
  myFighterRef.current = myFighter;
  const stageIdRef = useRef(stageId);
  stageIdRef.current = stageId;
  const matchRef = useRef<MatchInfo | null>(null);
  const roundRef = useRef(1);
  const winsRef = useRef<[number, number]>([0, 0]);
  const lsRef = useRef<Lockstep | null>(null);
  const pendingBatches = useRef<InputBatch[]>([]);
  const gaugesRef = useRef<[number, number]>([0, 0]);
  const lastHpRef = useRef({ p1Hp: 0, p2Hp: 0 });
  const skipGaugeRef = useRef(false);
  const ultActiveRef = useRef<{ caster: Side; t: number; phase: UltPhase } | null>(null);
  const [ultPhase, setUltPhase] = useState<UltPhase | null>(null);
  useEffect(() => { if (ultPhase === 'call' || ultPhase === 'cinema') setControlsOpen(false); }, [ultPhase]);
  const cinePressRef = useRef(false);
  const pumpsRef = useRef(0);
  const [pumps, setPumps] = useState(0);
  const [release, setRelease] = useState(false);
  const [peerStage, setPeerStage] = useState<H3State | null>(null);
  const ultConsumedRef = useRef(-1);
  const ultPressRef = useRef(false);
  const ultEvents = useRef(new Map<string, UltEvent[]>());
  const roundEndRef = useRef(false);
  const hashes = useRef(new Map<number, number>());
  const stallSince = useRef(0);
  /** Last time anything arrived from the opponent; silence for PEER_TIMEOUT_MS means they are gone. */
  const lastHeard = useRef(performance.now());
  const timers = useRef<number[]>([]);
  const h3Ref = useRef<H3Session | null>(null);
  const recorderRef = useRef<LiveMoveTranscriber | null>(null);
  const voiceKeyRef = useRef({ active: false, held: false });
  const voiceAbortRef = useRef<AbortController | null>(null);
  const castEpochRef = useRef(0);
  const inputRetryAt = useRef(0);
  const viewRef = useRef(view); viewRef.current = view;
  const referenceRef = useRef<File | null>(null);
  const finishedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const menuRef = useRef(false);
  menuRef.current = menuOpen || controlsOpen;
  const ultimateNameRef = useRef('');
  const startCastingRef = useRef<() => Promise<void>>(async () => undefined);
  const streamRef = useRef<MediaStream | null>(null);
  /** The clip has started playing; from then on a dropped connection means it is over, not that it failed. */
  const playedRef = useRef(false);
  /** Where this player stood in the captured opening frame (the prompt names the attacker's side). */
  const casterSideRef = useRef<'left' | 'right'>('left');
  /** Resolves once the fight frame is captured and the FastH3 session exists (a fast typist can beat it). */
  const castReadyRef = useRef<Promise<void>>(Promise.resolve());

  const me: Side = role === 'host' ? 0 : 1;
  const meRef = useRef<Side>(0);
  meRef.current = me;
  const [battleKey, setBattleKey] = useState(0);
  const held = useMemo(createHeld, [battleKey]);
  const previous = useMemo(createHeld, [battleKey]);
  const battle = useMemo(() => {
    const m = matchRef.current;
    const b = new Battle(structuredClone(fighterById(m?.p1 ?? DEFAULT_SETUP.playerId)), structuredClone(fighterById(m?.p2 ?? DEFAULT_SETUP.opponentId)), 285, 675, false);
    lastHpRef.current = { p1Hp: b.p1.hp, p2Hp: b.p2.hp };
    roundEndRef.current = false;
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleKey]);
  const battleRef = useRef(battle);
  battleRef.current = battle;

  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const send = (message: GameMessage) => void roomRef.current?.send(message);

  useEffect(() => keyboardBind(held, false), [held]);
  useEffect(() => { if (import.meta.env.DEV) Object.assign(window as object, { __battle: battle, __online: { lsRef, gaugesRef, hashes } }); }, [battle]);
  useEffect(() => { setClock(Math.ceil(battle.timeLeft / 60)); }, [battle]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); voiceAbortRef.current?.abort(); recorderRef.current?.cancel(); void h3Ref.current?.close(); void roomRef.current?.leave(); }, []);
  useEffect(() => { startArenaBgm(view === 'fight' ? 'fight' : 'menu', Math.min(2, round - 1)); }, [view, round]);
  useEffect(() => { setArenaDuck(ultStage === 'cinema' || watch?.playing ? 0 : ultCaster !== null ? 0.22 : view === 'fight' ? 0.75 : 0.45); }, [ultStage, ultCaster, watch, view]);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => undefined);
      if (ultStage === 'cinema') return markFirstVideoFrame(videoRef.current);
    }
  }, [stream, ultStage]);
  useEffect(() => {
    if (remoteVideoRef.current && remoteClip) { remoteVideoRef.current.srcObject = new MediaStream([remoteClip]); void remoteVideoRef.current.play().catch(() => undefined); }
  }, [remoteClip, watch, ultPhase]);

  // ---------- room & lobby ----------
  const sayHello = useCallback(() => send({ k: 'hello', role: roleRef.current, fighter: myFighterRef.current }), []);

  const beginRound = useCallback((m: number, r: number) => {
    castEpochRef.current++; voiceAbortRef.current?.abort();
    inputRetryAt.current = 0;
    const ls = new Lockstep(m, r, meRef.current);
    for (const batch of pendingBatches.current.filter(b => b.m === m && b.r === r)) ls.receive(batch);
    pendingBatches.current = pendingBatches.current.filter(b => b.m > m || (b.m === m && b.r > r));
    lsRef.current = ls;
    roundRef.current = r;
    ultConsumedRef.current = -1;
    // A new round starts clean: no ultimate open, no aura, nothing waiting.
    ultActiveRef.current = null;
    cinePressRef.current = false;
    setChargeAura(null);
    setUltCaster(null); setUltPhase(null); setWatch(null); setRemoteClip(null);
    hashes.current.clear();
    setRound(r);
    setPhase('intro');
    setBattleKey(k => k + 1);
  }, []);

  const startMatch = useCallback((info: MatchInfo) => {
    setControlsOpen(false);
    const setup = normalizeSetup({ playerId: info.p1, opponentId: info.p2, stageId: info.stage });
    info = { ...info, p1: setup.playerId, p2: setup.opponentId, stage: setup.stageId };
    timers.current.forEach(clearTimeout); timers.current = [];
    matchRef.current = info;
    setMatch(info);
    setStageId(info.stage);
    winsRef.current = [0, 0]; setWins([0, 0]);
    gaugesRef.current = [0, 0]; setGauges([0, 0]);
    setUltCount([0, 0]);
    setMenuOpen(false); setImpact(null);
    beginRound(info.m, 1);
    setView('fight');
  }, [beginRound]);

  const setPhaseOf = (phase: UltPhase | null) => {
    if (ultActiveRef.current && phase) ultActiveRef.current.phase = phase;
    setUltPhase(phase);
  };

  const clearUlt = useCallback(() => {
    ultActiveRef.current = null;
    cinePressRef.current = false;
    setChargeAura(null);
    setUltCaster(null); setUltPhase(null); setWatch(null); setRemoteClip(null); setPeerStage(null);
  }, []);

  const applyUltEnd = useCallback((caster: Side, hit: boolean, name: string, damage: number) => {
    const b = battleRef.current;
    const victim = caster === 0 ? b.p2 : b.p1;
    if (hit) {
      const dealt = Math.min(victim.hp, damage);
      b.queueStrike(caster, dealt);
      skipGaugeRef.current = true;
      gaugesRef.current[caster] = 0;
      setGauges([...gaugesRef.current] as [number, number]);
      setUltCount(c => { const n = [...c] as [number, number]; n[caster]++; return n; });
      setImpact({ name, damage: dealt });
      later(() => setImpact(null), 2200);
    }
    clearUlt();
  }, [clearUlt]);

  /** Apply an ultimate event if this client has reached the phase it belongs to; otherwise hold it. */
  const handleUltEvent = useCallback((key: string, event: UltEvent) => {
    const active = ultActiveRef.current;
    const m = matchRef.current?.m ?? 0;
    const mine = active ? ultKey(m, roundRef.current, active.t) === key : false;
    const ready = mine && active && (
      (event.ev === 'progress') ||
      (event.ev === 'lock' && active.phase === 'call') ||
      (event.ev === 'abort') ||
      (event.ev === 'end' && active.phase === 'cinema'));
    if (!ready || !active) {
      const list = ultEvents.current.get(key) ?? [];
      list.push(event);
      ultEvents.current.set(key, list);
      return;
    }
    if (event.ev === 'progress') { if (active.caster !== meRef.current) setPeerStage(event.state ?? null); return; }
    if (event.ev === 'lock') {
      setPhaseOf('charging');
      setChargeAura(active.caster, active.caster === meRef.current ? '#34c3ff' : '#ff7a45');
      setChargeLabel(event.name ?? t('canvas.ultimate'));
      if (active.caster !== meRef.current) { setWatch({ playing: false, name: event.name, description: event.desc }); setPeerStage('connecting'); }
    }
    if (event.ev === 'abort') clearUlt();
    if (event.ev === 'end') applyUltEnd(active.caster, !!event.hit, event.name ?? t('cine.fallbackName'), event.damage ?? 0);
    flushUltEvents(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyUltEnd, clearUlt]);

  /** Re-run held events once the phase they were waiting for has been reached. */
  const flushUltEvents = (key: string) => {
    const list = ultEvents.current.get(key);
    if (!list?.length) return;
    ultEvents.current.delete(key);
    for (const event of list) handleUltEventRef.current(key, event);
  };
  const handleUltEventRef = useRef(handleUltEvent);
  handleUltEventRef.current = handleUltEvent;

  /** The caster's own events go through the same path as the opponent's, so both apply them identically. */
  const emitUlt = (event: UltEvent) => {
    const active = ultActiveRef.current;
    if (!active) return;
    const m = matchRef.current?.m ?? 0;
    send({ k: 'ult', ...event, m, r: roundRef.current, t: active.t });
    handleUltEventRef.current(ultKey(m, roundRef.current, active.t), event);
  };

  const onMessage = useCallback((msg: GameMessage, from: string) => {
    if (msg.k !== 'hello' && msg.k !== 'full' && from !== peerRef.current?.uid) return;
    if (from === peerRef.current?.uid) lastHeard.current = performance.now();
    switch (msg.k) {
      case 'in': {
        const batch = msg as unknown as InputBatch;
        const ls = lsRef.current;
        if (ls && batch.m === ls.match && batch.r === ls.round) ls.receive(batch);
        else if (!ls || batch.m > ls.match || (batch.m === ls.match && batch.r > ls.round)) pendingBatches.current.push(batch);
        break;
      }
      case 'hello': {
        if (msg.role === roleRef.current) { setError(roleRef.current === 'host' ? t('online.codeInUse') : t('online.twoGuests')); return; }
        const known = peerRef.current;
        if (known && known.uid !== from) { if (roleRef.current === 'host') send({ k: 'full', to: from }); return; }
        peerRef.current = { uid: from, fighter: normalizeFighterId(msg.fighter) };
        setPeer(peerRef.current);
        if (!known) { sayHello(); if (roleRef.current === 'host') send({ k: 'stage', stage: stageIdRef.current }); }
        break;
      }
      case 'full': if (roleRef.current === 'guest' && msg.to === roomRef.current?.uid) { const room = roomRef.current; roomRef.current = null; void room?.leave(); setHasMic(false); setGoneReason(t('online.full')); setView('gone'); } break;
      case 'pick': if (peerRef.current?.uid === from) { peerRef.current = { uid: from, fighter: normalizeFighterId(msg.fighter) }; setPeer(peerRef.current); } break;
      case 'stage': if (roleRef.current === 'guest') setStageId(String(msg.stage)); break;
      case 'start': if (roleRef.current === 'guest') startMatch(msg as unknown as MatchInfo); break;
      case 'lobby': if (roleRef.current === 'guest') { setView('lobby'); lsRef.current = null; } break;
      case 'ult': handleUltEvent(ultKey(Number(msg.m), Number(msg.r), Number(msg.t)), msg as unknown as UltEvent); break;
      case 'sum': {
        const local = hashes.current.get(Number(msg.t));
        if (local !== undefined && local !== msg.h && Number(msg.r) === roundRef.current) {
          console.warn('[agora-arena] lockstep desync at tick', msg.t);
          if (import.meta.env.DEV) ((window as unknown as { __desync?: number[] }).__desync ??= []).push(Number(msg.t));
        }
        break;
      }
      case 'ping': send({ k: 'pong', ts: msg.ts }); break;
      case 'pong': setPing(Math.round(performance.now() - Number(msg.ts))); break;
      case 'bye': if (peerRef.current?.uid === from) peerLeft(); break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleUltEvent, sayHello, startMatch]);

  const peerLeft = useCallback(() => {
    setError('');
    peerRef.current = null;
    setPeer(null);
    lsRef.current = null;
    castEpochRef.current++; voiceAbortRef.current?.abort(); voiceAbortRef.current = null;
    recorderRef.current?.cancel(); recorderRef.current = null;
    const h3 = h3Ref.current; h3Ref.current = null; void h3?.close();
    timers.current.forEach(clearTimeout); timers.current = [];
    referenceRef.current = null; streamRef.current = null;
    setStream(null); setUltStage(null); setCleanFrame(false); setMenuOpen(false); setRelease(false);
    clearUlt();
    if (viewRef.current === 'fight' || viewRef.current === 'result') {
      const room = roomRef.current; roomRef.current = null; void room?.leave();
      setHasMic(false); setView('gone');
    }
  }, [clearUlt]);

  const enterRoom = useCallback(async (asRole: Role, roomCode: string) => {
    setError('');
    roleRef.current = asRole;
    setRole(asRole);
    setCode(roomCode);
    setView('connecting');
    const room = new OnlineRoom(roomCode, {
      onMessage: (m, from) => onMessageRef.current(m, from),
      onPeerAudio: (uid, on) => setSpeaking(s => (s[uid] === on ? s : { ...s, [uid]: on })),
      onCinematic: (track, uid) => { if (uid === peerRef.current?.uid || track === null) setRemoteClip(track); },
      onPresence: (uid, here) => { if (here) sayHello(); else if (uid === peerRef.current?.uid) peerLeft(); },
      onError: message => setError(friendlyError(message)),
    });
    roomRef.current = room;
    try {
      await room.join(true);
      if (roomRef.current !== room) return;
      setHasMic(room.hasMic);
      history.replaceState(null, '', `${location.pathname}?room=${roomCode}`);
      setView('lobby');
      sayHello();
    } catch (e) {
      if (roomRef.current !== room) return;
      setError(t('online.joinFailed', { message: e instanceof Error ? e.message : String(e) }));
      setView('entry');
      await room.leave();
      roomRef.current = null;
    }
  }, [peerLeft, sayHello]);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => { if (initialCode) { const c = normalizeRoomCode(initialCode); if (c) void enterRoom('guest', c); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view === 'lobby') send({ k: 'pick', fighter: myFighter }); }, [myFighter, view]);
  useEffect(() => { if (view === 'lobby' && role === 'host') send({ k: 'stage', stage: stageId }); }, [stageId, view, role]);
  // Keep the opponent informed while waiting, and measure latency while connected.
  useEffect(() => {
    if (view !== 'lobby' && view !== 'fight' && view !== 'result') return;
    const id = window.setInterval(() => {
      if (!peerRef.current) { sayHello(); lastHeard.current = performance.now(); }
      else if (performance.now() - lastHeard.current > PEER_TIMEOUT_MS && view !== 'lobby') peerLeft();
      send({ k: 'ping', ts: performance.now() });
    }, 2000);
    return () => clearInterval(id);
  }, [view, sayHello, peerLeft]);

  const [confirmLeave, setConfirmLeave] = useState<{ title: string; confirm: string } | null>(null);
  const askLeave = (title: string, confirm: string) => setConfirmLeave({ title, confirm });
  // Close / reload asks first while connected; when the page really goes, say goodbye and release the room.
  useLeaveGuard(view === 'lobby' || view === 'fight' || view === 'result' || view === 'connecting', () => {
    castEpochRef.current++; voiceAbortRef.current?.abort();
    recorderRef.current?.cancel();
    void h3Ref.current?.close();
    void roomRef.current?.leave();
  });

  // Leave at once; the network cleanup (agent, FastH3, 'bye', RTC/RTM) finishes in the background.
  const leave = useCallback(async () => {
    timers.current.forEach(clearTimeout);
    setChargeAura(null);
    castEpochRef.current++; voiceAbortRef.current?.abort(); voiceAbortRef.current = null;
    const room = roomRef.current, h3 = h3Ref.current;
    recorderRef.current?.cancel();
    roomRef.current = null; recorderRef.current = null; h3Ref.current = null;
    history.replaceState(null, '', location.pathname);
    onExit();
    await Promise.allSettled([h3?.close()]);
    await room?.leave();
  }, [onExit]);

  const hostStart = () => {
    const p = peerRef.current;
    if (role !== 'host' || !p || p.fighter === myFighter) return;
    const info: MatchInfo = { m: (matchRef.current?.m ?? 0) + 1, p1: myFighter, p2: p.fighter, stage: stageId };
    send({ k: 'start', ...info });
    startMatch(info);
  };

  // ---------- lockstep ----------
  const sideNames = useMemo(() => [fighterById(match?.p1 ?? DEFAULT_SETUP.playerId).name, fighterById(match?.p2 ?? DEFAULT_SETUP.opponentId).name] as const, [match, lang]);

  const triggerUltimate = useCallback((caster: Side, t: number) => {
    ultActiveRef.current = { caster, t, phase: 'call' };
    setUltCaster(caster); setUltPhase('call');
    clearHeld(held);
    const key = ultKey(matchRef.current?.m ?? 0, roundRef.current, t);
    if (caster !== meRef.current) setWatch({ playing: false });
    else void startCastingRef.current();
    flushUltEvents(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held]);

  const step = useCallback((): [InputFrame, InputFrame] | null => {
    const ls = lsRef.current;
    const b = battleRef.current;
    const active = ultActiveRef.current;
    if (!ls || (active && active.phase !== 'charging')) return null;
    if (!ls.ready()) {
      const now = performance.now();
      if (now - inputRetryAt.current >= 250) {
        inputRetryAt.current = now;
        const retry = ls.batch(true); if (retry) send(retry as unknown as GameMessage);
      }
      if (!stallSince.current) stallSince.current = performance.now();
      else if (performance.now() - stallSince.current > 400) setStalled(true);
      return null;
    }
    if (stallSince.current) { stallSince.current = 0; setStalled(false); }
    const live = b.winner === null && !b.timeUp && !b.doubleKo;
    // The caster's clip is ready: both players stop on the same tick to watch it.
    if (active && live) {
      const peek = ls.peek()!;
      if (peek[active.caster].cine) {
        setPhaseOf('cinema');
        setChargeAura(null);
        if (active.caster !== meRef.current) { setRelease(true); later(() => setRelease(false), 900); }
        flushUltEvents(ultKey(matchRef.current?.m ?? 0, roundRef.current, active.t));
        return null;
      }
    }
    if (!active && live && ls.tick !== ultConsumedRef.current) {
      const peek = ls.peek()!;
      for (const side of [0, 1] as const) {
        if (peek[side].ult && gaugesRef.current[side] >= GAUGE_MAX) {
          ultConsumedRef.current = ls.tick;
          triggerUltimate(side, ls.tick);
          return null;
        }
      }
    }
    const local = menuRef.current ? NULL_INPUT : toInputFrame(held, previous);
    ls.schedule({ frame: local, ult: ultPressRef.current, cine: cinePressRef.current });
    ultPressRef.current = false;
    cinePressRef.current = false;
    const [a, c] = ls.take();
    const batch = ls.batch();
    if (batch) send(batch as unknown as GameMessage);
    return [a.frame, c.frame];
  }, [held, previous, triggerUltimate]);

  const resolveRound = useCallback((b: Battle) => {
    const w: [number, number] = [...winsRef.current];
    if (b.winner === 0 || b.winner === 1) w[b.winner]++;
    winsRef.current = w;
    setWins(w);
    const m = matchRef.current;
    if (!m) return;
    if (w[0] >= ROUNDS_TO_WIN || w[1] >= ROUNDS_TO_WIN) { lsRef.current = null; setView('result'); return; }
    beginRound(m.m, roundRef.current + 1);
  }, [beginRound]);

  const onTick = useCallback((b: Battle) => {
    const ls = lsRef.current;
    const now = { p1Hp: b.p1.hp, p2Hp: b.p2.hp };
    const over = b.winner !== null || b.doubleKo || b.timeUp;
    if (skipGaugeRef.current) skipGaugeRef.current = false;
    else if (!over) {
      const g = gaugesRef.current;
      g[0] = stepGauge(g[0], lastHpRef.current, now);
      g[1] = stepGauge(g[1], { p1Hp: lastHpRef.current.p2Hp, p2Hp: lastHpRef.current.p1Hp }, { p1Hp: now.p2Hp, p2Hp: now.p1Hp });
    }
    lastHpRef.current = now;
    if (b.frame % 6 === 0 || gaugesRef.current.some(v => v >= GAUGE_MAX)) setGauges(g => (Math.floor(g[0]) === Math.floor(gaugesRef.current[0]) && Math.floor(g[1]) === Math.floor(gaugesRef.current[1]) ? g : [...gaugesRef.current] as [number, number]));
    setClock(Math.ceil(b.timeLeft / 60));
    if (ls) {
      const t = ls.tick - 1;
      if (t % SUM_EVERY === 0) {
        const h = stateHash(b);
        hashes.current.set(t, h);
        send({ k: 'sum', m: ls.match, r: ls.round, t, h });
      }
    }
    if (over && !roundEndRef.current) {
      roundEndRef.current = true;
      setPhase('roundEnd');
      later(() => resolveRound(b), ROUND_END_MS);
    }
  }, [resolveRound]);

  useEffect(() => {
    if (view !== 'fight' || phase !== 'intro') return;
    const t = window.setTimeout(() => setPhase('play'), INTRO_MS);
    return () => clearTimeout(t);
  }, [view, phase, battleKey]);

  // ---------- casting an ultimate (this player) ----------
  const closeCast = useCallback(async () => {
    castEpochRef.current++; voiceAbortRef.current?.abort(); voiceAbortRef.current = null;
    recorderRef.current?.cancel(); recorderRef.current = null;
    const h3 = h3Ref.current; h3Ref.current = null;
    referenceRef.current = null;
    setUltStage(null); setH3State(null); setStream(null);
    setHeard(''); setMoveText(''); setUltimate(null); setVoiceState('idle'); setMicLevel(0);
    streamRef.current = null;
    await roomRef.current?.stopCast();
    await h3?.close();
  }, []);

  /** Finish this player's ultimate: land it (after the clip) or drop it (cancel / failure — the gauge is kept). */
  const endCast = useCallback(async (hit: boolean, name: string, message?: string) => {
    const active = ultActiveRef.current;
    if (!active || active.caster !== meRef.current || finishedRef.current) return;
    finishedRef.current = true;
    const victim = meRef.current === 0 ? battleRef.current.p2 : battleRef.current.p1;
    // A hit lands only once both games have paused for the clip (`end` waits for that phase); a cancel or a
    // failure just drops the ultimate, which never touches the battle state, so it is safe at any moment.
    if (hit) { markUlt('impact'); emitUlt({ ev: 'end', hit, name, damage: ultimateDamage(victim.def.hp, pumpsRef.current) }); }
    else emitUlt({ ev: 'abort' });
    await closeCast();
    if (message) setError(t('err.gaugeKept', { message: friendlyError(message).replace(/[.\s。]*$/, getLang() === 'zh' ? '。' : '.') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeCast]);

  const startCasting = useCallback(async () => {
    resetUltTimeline(); markUlt('open', { mode: 'online' });
    const epoch = ++castEpochRef.current;
    finishedRef.current = false;
    playedRef.current = false;
    setHeard(''); setMoveText(''); setError('');
    setUltStage('panel');
    const canvas = document.querySelector<HTMLCanvasElement>('.arena canvas');
    let ready: () => void = () => undefined;
    castReadyRef.current = new Promise<void>(resolve => { ready = resolve; });
    if (canvas) {
      try {
        setCleanFrame(true);
        battleRef.current.p1.flash = 0; battleRef.current.p2.flash = 0;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const reference = await captureGameFrame(canvas).finally(() => setCleanFrame(false));
        markUlt('frame-captured');
        if (epoch !== castEpochRef.current) { ready(); return; }
        { const b = battleRef.current, mine = meRef.current === 0 ? b.p1 : b.p2, theirs = meRef.current === 0 ? b.p2 : b.p1; casterSideRef.current = mine.x <= theirs.x ? 'left' : 'right'; }
        referenceRef.current = reference;
        const session = new H3Session({
          onState: state => {
            if (epoch !== castEpochRef.current) return;
            setH3State(state);
            if (ultActiveRef.current?.phase === 'charging') emitUlt({ ev: 'progress', state });
            if (state === 'playing') {
              // The clip is ready: show it here at once, relay it over Agora, and ask both games to pause on the
              // same tick (the `cine` flag rides on this player's next lockstep input).
              if (streamRef.current) void roomRef.current?.castStream(streamRef.current).catch(e => setError(t('online.castFailed', { message: e instanceof Error ? e.message : String(e) })));
              playedRef.current = true;
              cinePressRef.current = true;
              setChargeAura(null);
              setMenuOpen(false);
              setUltStage('cinema');
              setRelease(true); later(() => setRelease(false), 900);
            }
            if (state === 'finished') later(() => { if (epoch === castEpochRef.current) void endCast(true, ultimateNameRef.current); }, 700);
          },
          onStream: s => { if (epoch === castEpochRef.current) { streamRef.current = s; setStream(s); } },
          // Reactor closes the peer connection as the clip ends, which can beat `clip_finished` here.
          onError: message => { if (epoch === castEpochRef.current) void (playedRef.current ? endCast(true, ultimateNameRef.current) : endCast(false, ultimateNameRef.current, message)); },
        }, settings.clipSeconds);
        h3Ref.current = session;
        void session.prepare(reference);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    }
    ready();
    if (epoch === castEpochRef.current && settings.voice && roomRef.current?.hasMic) void listenRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endCast, settings.clipSeconds, settings.voice, sideNames]);
  startCastingRef.current = startCasting;

  const unleash = useCallback(async (u: ParsedUltimate) => {
    const epoch = castEpochRef.current;
    await castReadyRef.current;
    if (epoch !== castEpochRef.current) return;
    const session = h3Ref.current, reference = referenceRef.current, active = ultActiveRef.current;
    if (!session || !reference || !active) { void endCast(false, u.name, t('err.noFrame')); return; }
    ultimateNameRef.current = u.name;
    setUltimate(u);
    pumpsRef.current = 0; setPumps(0);
    recorderRef.current?.cancel(); recorderRef.current = null;
    // Back to the fight for both players; this one glows while FastH3 renders.
    setUltStage('charging');
    emitUlt({ ev: 'lock', name: u.name, desc: u.description });
    const m = matchRef.current;
    const [mineId, theirsId] = meRef.current === 0 ? [m?.p1, m?.p2] : [m?.p2, m?.p1];
    const prompt = buildUltimatePrompt({ caster: fighterById(mineId ?? DEFAULT_SETUP.playerId), target: fighterById(theirsId ?? DEFAULT_SETUP.opponentId), casterSide: casterSideRef.current, move: u, lang: getLang() });
    markUlt('unleash');
    session.generate(prompt, reference, u.name).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endCast, sideNames]);

  const pump = useCallback(() => {
    pumpsRef.current += 1;
    setPumps(pumpsRef.current);
    pumpChargeAura();
  }, []);

  // A round that ends while the ultimate is still rendering drops it (the gauge is kept).
  useEffect(() => {
    if (ultPhase === 'charging' && phase === 'roundEnd' && ultCaster === me) {
      void endCast(false, ultimateNameRef.current, t('err.roundEndedShort'));
    }
  }, [ultPhase, phase, ultCaster, me, endCast]);

  /** Record the shouted move from the room's own Agora mic track (the opponent hears it live), then speech-to-text. */
  const listen = useCallback(async () => {
    voiceAbortRef.current?.abort(); recorderRef.current?.cancel();
    const attempt = new AbortController(); voiceAbortRef.current = attempt;
    const epoch = castEpochRef.current;
    const track = roomRef.current?.micTrack;
    if (!track) { setVoiceState('error'); setError(t('err.noMicOnline')); return; }
    setError(''); setHeard(''); setVoiceState('connecting');
    if (voiceKeyRef.current.active && !voiceKeyRef.current.held) { setVoiceState('idle'); return; }
    try {
      const recorder = new LiveMoveTranscriber(track, getLang(), {
        onLevel: setMicLevel,
        onText: text => { if (!attempt.signal.aborted && epoch === castEpochRef.current) setHeard(text); },
        onReady: () => { if (!attempt.signal.aborted) { markUlt('voice-listening'); setVoiceState('listening'); } },
        onFinalizing: () => { if (!attempt.signal.aborted) setVoiceState('thinking'); },
      });
      recorderRef.current = recorder;
      if (voiceKeyRef.current.active && !voiceKeyRef.current.held) recorder.finish();
      const transcript = await recorder.result();
      if (attempt.signal.aborted || recorderRef.current !== recorder) return;
      recorderRef.current = null;
      setMicLevel(0);
      if (!transcript) { setVoiceState('error'); setError(t('err.noSpeech')); return; }
      setVoiceState('thinking');
      const [mine, theirs] = meRef.current === 0 ? sideNames : [sideNames[1], sideNames[0]];
      const move = await composeMove(transcript, mine, theirs, getLang(), attempt.signal);
      if (attempt.signal.aborted || epoch !== castEpochRef.current) return;
      setHeard(move.transcript);
      void unleashRef.current(move);
    } catch (e) {
      if (attempt.signal.aborted || epoch !== castEpochRef.current) return;
      recorderRef.current?.cancel(); recorderRef.current = null; setMicLevel(0);
      setVoiceState('error');
      setError(t('err.retryOnline', { message: e instanceof Error ? e.message : String(e) }));
    }
  }, [sideNames]);

  const listenRef = useRef(listen);
  listenRef.current = listen;
  const unleashRef = useRef(unleash);
  unleashRef.current = unleash;

  const submitText = () => {
    const text = moveText.trim();
    if (!text) return;
    recorderRef.current?.cancel(); recorderRef.current = null;
    voiceAbortRef.current?.abort();
    const attempt = new AbortController(); voiceAbortRef.current = attempt;
    const epoch = castEpochRef.current;
    setVoiceState('thinking');
    const [mine, theirs] = meRef.current === 0 ? sideNames : [sideNames[1], sideNames[0]];
    composeMove(text, mine, theirs, getLang(), attempt.signal).then(move => {
      if (!attempt.signal.aborted && epoch === castEpochRef.current) void unleash(move);
    }).catch(e => {
      if (!attempt.signal.aborted && epoch === castEpochRef.current) { setVoiceState('error'); setError(e instanceof Error ? e.message : String(e)); }
    });
  };

  const pressUltimate = useCallback((keyboard = false) => {
    const b = battleRef.current;
    const active = ultActiveRef.current;
    if (active?.phase === 'charging' && active.caster === meRef.current) { pump(); return; }
    if (view !== 'fight' || phase !== 'play' || active || menuRef.current) return;
    if (gaugesRef.current[meRef.current] < GAUGE_MAX || b.winner !== null || b.timeUp || b.doubleKo) return;
    voiceKeyRef.current = { active: keyboard, held: keyboard };
    ultPressRef.current = true;
  }, [view, phase, pump]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || view !== 'fight') return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyF') { e.preventDefault(); pressUltimate(true); }
      if ((e.code === 'Escape' || e.code === 'KeyP') && (ultPhase === null || ultPhase === 'charging')) { e.preventDefault(); setMenuOpen(o => !o); }
    };
    const release = () => {
      if (!voiceKeyRef.current.active || !voiceKeyRef.current.held) return;
      voiceKeyRef.current.held = false;
      recorderRef.current?.finish();
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'KeyF') release(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', release);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', release); };
  }, [view, pressUltimate, ultPhase]);

  // ---------- render ----------
  const peerFighter = peer ? fighterById(peer.fighter) : null;
  const meName = fighterById(myFighter).name;
  const inviteUrl = code ? `${location.origin}${location.pathname}?room=${code}` : '';
  const cinemaLive = h3State === 'playing' || h3State === 'finished';
  // The fight stops only while an ultimate is being called or its clip plays; it keeps going while it charges.
  const halted = ultPhase === 'call' || ultPhase === 'cinema';
  const paused = view !== 'fight' || phase === 'intro' || halted;
  const stage = stageById(stageId);
  const peerSpeaking = peer ? !!speaking[peer.uid] : false;
  const myWin = wins[me] >= ROUNDS_TO_WIN;

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); later(() => setCopied(false), 1800); } catch { setError(t('online.copyFailed')); }
  };

  return (
    <>
      <section className="arena" aria-label={t('online.aria')}>
        <GameCanvas key={battleKey} battle={battle} getP1={() => NULL_INPUT} getP2={() => NULL_INPUT} step={step}
          onTick={onTick} stage={stage.bg} paused={paused} hud={view === 'fight' && !cleanFrame} />
        {view === 'fight' && touch && !halted && <TouchLayer held={held} battle={battle} hideHints />}
      </section>

      {(view === 'entry' || view === 'connecting') && (
        <div className="setup-screen online-entry">
          <header className="setup-head">
            <button className="icon-button back" onClick={() => void leave()} aria-label={t('setup.back')}><ArrowLeft size={18} /></button>
            <div><div className="eyebrow">{t('online.eyebrow')}</div><h2>{t('online.heading')}</h2></div>
            <AgoraBrand compact />
          </header>
          <div className="online-entry-body">
            <p>{t('online.body')}</p>
            <div className="online-entry-actions">
              <button className="primary" disabled={view === 'connecting'} onClick={() => void enterRoom('host', newRoomCode())}><Radio size={16} /> {t('online.create')}</button>
              <div className="join-row">
                <input value={codeInput} onChange={e => setCodeInput(e.target.value)} placeholder={t('online.code')} maxLength={6} inputMode="numeric" pattern="[0-9]{6}" autoComplete="off" aria-label={t('online.codeAria')} disabled={view === 'connecting'}
                  onKeyDown={e => { const c = normalizeRoomCode(codeInput); if (e.key === 'Enter' && c && view !== 'connecting') void enterRoom('guest', c); }} />
                <button className="ghost" disabled={view === 'connecting' || !normalizeRoomCode(codeInput)} onClick={() => { const c = normalizeRoomCode(codeInput); if (c) void enterRoom('guest', c); }}><Users size={15} /> {t('online.join')}</button>
              </div>
            </div>
            {view === 'connecting' && <p className="online-status"><LoaderCircle className="spin" size={14} /> {t('online.joining', { code })}</p>}
            {error && <p className="panel-error">{error}</p>}
          </div>
        </div>
      )}

      {view === 'lobby' && (
        <div className="setup-screen online-lobby original-roster">
          <header className="setup-head">
            <button className="icon-button back" onClick={() => askLeave(t('online.leaveRoom.title'), t('online.leaveRoom'))} aria-label={t('online.leaveRoomAria')}><ArrowLeft size={18} /></button>
            <div><div className="eyebrow">{role === 'host' ? t('online.hosting') : t('online.joined')}</div><h2>{t('online.room')} <span className="room-code">{code}</span></h2></div>
            <AgoraBrand compact />
            <button className="ghost invite" onClick={() => void copyInvite()}><Copy size={14} /> {copied ? t('online.copied') : t('online.copy')}</button>
          </header>
          <div className="lobby-grid">
            <section className={`lobby-player${speaking.me ? ' speaking' : ''}`}>
              <h3>{t('online.you')} {role === 'host' ? t('online.p1') : t('online.p2')}</h3>
              <div className="fighter-select">
                {localizedRoster().map(f => (
                  <button key={f.id} className={`fighter-card${f.id === myFighter ? ' active' : ''}`} disabled={f.id === peer?.fighter}
                    onClick={() => setMyFighter(f.id)} aria-pressed={f.id === myFighter}>
                    <img src={f.portraitUrl} alt="" /><span>{f.name}</span><small>{f.id === peer?.fighter ? t('online.taken') : f.role}</small>
                  </button>
                ))}
              </div>
              <button className={`mic-toggle${muted ? ' off' : ''}`} disabled={!hasMic} onClick={() => { roomRef.current?.setMuted(!muted); setMuted(!muted); }}>
                {muted || !hasMic ? <MicOff size={14} /> : <Mic size={14} />} {hasMic ? (muted ? t('online.micMuted') : t('online.micLive')) : t('online.noMic')}
              </button>
            </section>
            <section className={`lobby-player${peerSpeaking ? ' speaking' : ''}`}>
              <h3>{t('online.opponent')} {role === 'host' ? t('online.p2') : t('online.p1')}</h3>
              {peerFighter ? (
                <div className="peer-card"><img src={peerFighter.portraitUrl} alt="" /><div><b>{peerFighter.name}</b><small>{peerSpeaking ? t('online.talking') : t('online.connected')}</small></div></div>
              ) : (
                <div className="peer-card waiting"><LoaderCircle className="spin" size={20} /><div><b>{t('online.waitingFriend')}</b><small>{t('online.share')} <em>{code}</em></small></div></div>
              )}
              {ping !== null && peer && <small className="ping"><Wifi size={12} /> {t('online.ping', { n: ping })}</small>}
            </section>
            <section className="lobby-stage">
              <h3>{t('online.stage')} {role === 'guest' && t('online.hostPicks')}</h3>
              <div className="stage-select">
                {GOAT_STAGES.map(st => (
                  <button key={st.id} className={`stage-card${st.id === stageId ? ' active' : ''}`} disabled={role !== 'host'} onClick={() => setStageId(st.id)}>
                    <img src={st.bg.artUrl} alt="" style={{ filter: st.preview }} /><span>{stageLabel(st).name}</span><small>{stageLabel(st).time}</small>
                  </button>
                ))}
              </div>
            </section>
          </div>
          <footer className="setup-foot">
            <div className="matchup-preview"><b>{role === 'host' ? meName : peerFighter?.name ?? '???'}</b><em>VS</em><b>{role === 'host' ? peerFighter?.name ?? '???' : meName}</b><i>·</i><span>{stageLabel(stage).time}</span><i>·</i><span>{t('setup.bestOf', { n: ROUNDS_TO_WIN * 2 - 1 })}</span></div>
            {role === 'host'
              ? <button className="primary" disabled={!peer || peer.fighter === myFighter} onClick={hostStart}><Swords size={16} /> {t('online.start')} <span>→</span></button>
              : <span className="online-status">{peer ? t('online.waitHost') : t('online.connectingHost')}</span>}
          </footer>
          {error && <div className="toast">{error}<button onClick={() => setError('')} aria-label={t('toast.dismiss')}><X size={14} /></button></div>}
        </div>
      )}

      {view === 'fight' && match && (
        <>
          <MatchHud round={round} wins={wins} stageLabel={t('online.stageLabel', { stage: `${stageLabel(stage).name} // ${stageLabel(stage).time}` })} seconds={clock} onPause={() => setMenuOpen(o => !o)} onControls={() => setControlsOpen(true)} controlsDisabled={ultCaster !== null} />
          <div className="online-tags" aria-hidden>
            {([0, 1] as const).map(side => {
              const uid = side === me ? 'me' : peer?.uid ?? '';
              return <span key={side} className={`side-${side}${speaking[uid] ? ' speaking' : ''}`}>{side === me ? t('online.you') : t('online.opponent')} {speaking[uid] ? <Mic size={11} /> : null}{side !== me && <i>FASTH3 {Math.floor(gauges[side])}%</i>}</span>;
            })}
          </div>
          {phase === 'intro' && <RoundBanner round={round} final={round >= ROUNDS_TO_WIN * 2 - 1 && round > 1} />}
          {(ultCaster === null || (ultPhase === 'charging' && ultCaster !== me)) && phase !== 'intro' && <FastH3Gauge value={gauges[me]} onTrigger={() => pressUltimate()} touch={touch} live={phase === 'play'} />}
          {settings.showControls && !touch && !halted && <ControlsLegend />}
          <PoweredBy />
          {impact && <ImpactBanner name={impact.name} damage={impact.damage} />}
          {stalled && !halted && <div className="net-stall"><LoaderCircle className="spin" size={14} /> {t('online.stall')}</div>}
          {menuOpen && (
            <div className="online-menu" role="dialog" aria-label={t('online.menuAria')}>
              <b>{t('online.menu')}</b>
              <button onClick={() => setMenuOpen(false)}>{t('online.resume')}</button>
              <button disabled={!hasMic} onClick={() => { roomRef.current?.setMuted(!muted); setMuted(!muted); }}>{muted ? t('online.unmute') : t('online.mute')}</button>
              <button onClick={() => askLeave(t('online.leaveMatch.title'), t('online.leaveMatch'))}><Home size={14} /> {t('online.leaveMatch')}</button>
            </div>
          )}
        </>
      )}

      {controlsOpen && view === 'fight' && <ControlsGuide touch={touch} online onClose={() => { setControlsOpen(false); clearHeld(held); }} />}

      {ultCaster !== null && ultCaster === me && ultStage === 'panel' && (
        <UltimatePanel fighterName={sideNames[me]} opponentName={sideNames[me === 0 ? 1 : 0]}
          voice={settings.voice && hasMic} voiceState={voiceState} level={micLevel} heard={heard} text={moveText} error={error}
          onText={value => { voiceKeyRef.current.active = false; voiceAbortRef.current?.abort(); recorderRef.current?.cancel(); recorderRef.current = null; setMicLevel(0); setVoiceState('idle'); setMoveText(value); }} onSubmitText={submitText}
          onDone={() => recorderRef.current?.finish()} onRetry={() => { voiceKeyRef.current.active = false; void listen(); }}
          onHoldStart={() => { voiceKeyRef.current = { active: true, held: true }; if (voiceState === 'idle' || voiceState === 'error') void listen(); }}
          onCancel={() => void endCast(false, t('cine.fallbackName'))} />
      )}
      {ultCaster === me && ultStage === 'charging' && ultimate && (
        <ChargingChip name={ultimate.name} state={h3State} presses={pumps} onPump={pump} onCancel={() => void endCast(false, ultimate.name)} />
      )}
      {ultCaster !== null && ultCaster !== me && ultPhase === 'charging' && (
        <div className="opponent-charging"><ChargingChip name={watch?.name ?? t('cine.fallbackName')} state={peerStage} who={sideNames[ultCaster]} /></div>
      )}
      {release && <UltimateRelease name={ultCaster === me ? ultimate?.name ?? '' : watch?.name ?? ''} />}
      {ultCaster === me && ultStage === 'cinema' && (
        <div className="cinematic">
          <video ref={videoRef} autoPlay playsInline />
          {!cinemaLive && (
            <div className="generation-state">
              <LoaderCircle className="spin" />
              <small>{t('online.liveToOpponent')}</small>
              <h3>{ultimate?.name}</h3><div className="progress"><i /></div><p>{ultimate?.description}</p>
              <button className="cinematic-cancel" onClick={() => void endCast(false, t('cine.fallbackName'))}><X size={14} /> {t('cine.cancel')}</button>
            </div>
          )}
          {cinemaLive && <div className="cinematic-label"><span>{t('online.streamingCredit', { name: sideNames[me] })}</span><b>{ultimate?.name}</b></div>}
          {cinemaLive && <button className="cinematic-close" onClick={() => void endCast(true, ultimate?.name ?? t('cine.fallbackName'))}><SkipForward size={14} /> {t('cine.skip')}</button>}
        </div>
      )}

      {ultCaster !== null && ultCaster !== me && watch && ultPhase !== 'charging' && (
        <div className="cinematic watch">
          <video ref={remoteVideoRef} autoPlay playsInline className={ultPhase === 'cinema' && remoteClip ? '' : 'hidden'} />
          {!(ultPhase === 'cinema' && remoteClip) && (
            <div className="generation-state">
              <Radio className={peerSpeaking ? 'pulse-icon' : ''} />
              <small>{ultPhase === 'cinema' ? t('online.clipIncoming') : t('online.incoming')}</small>
              <h3>{watch.name ?? t('online.calling', { name: sideNames[ultCaster] })}</h3>
              <p>{watch.description ?? (peerSpeaking ? t('online.shouting') : t('online.choosing'))}</p>
              <div className="progress"><i /></div>
            </div>
          )}
          {ultPhase === 'cinema' && remoteClip && <div className="cinematic-label"><span>{t('online.relayedCredit', { name: sideNames[ultCaster] })}</span><b>{watch.name}</b></div>}
        </div>
      )}

      {view === 'result' && (
        <div className="result-screen">
          <small>{myWin ? t('result.victory') : t('result.defeat')}</small>
          <h2>{t('result.wins', { name: sideNames[wins[0] >= ROUNDS_TO_WIN ? 0 : 1] })}</h2>
          <div className="result-score"><b>{wins[0]}</b><i>–</i><b>{wins[1]}</b></div>
          <p>{t('online.resultUlts', { mine: ultCount[me], theirs: ultCount[me === 0 ? 1 : 0] })}</p>
          <div className="menu-actions">
            {role === 'host'
              ? <><button className="primary" onClick={hostStart}><RotateCcw size={15} /> {t('result.rematch')}</button>
                <button className="ghost" onClick={() => { send({ k: 'lobby' }); setView('lobby'); }}><Users size={15} /> {t('result.setup')}</button></>
              : <span className="online-status">{t('online.waitRematch')}</span>}
            <button className="ghost" onClick={() => askLeave(t('online.leaveRoom.title'), t('online.leaveRoom'))}><Home size={15} /> {t('online.leaveRoom')}</button>
          </div>
        </div>
      )}

      {confirmLeave && (
        <ConfirmDialog title={confirmLeave.title} confirm={confirmLeave.confirm}
          body={peer ? t('online.leaveBody') : t('online.closeBody')}
          onCancel={() => setConfirmLeave(null)}
          onConfirm={() => { setConfirmLeave(null); void leave(); }} />
      )}
      {view === 'gone' && (
        <div className="result-screen">
          <small>{t('online.closed')}</small>
          <h2>{goneReason ? t('online.cantJoin') : t('online.left')}</h2>
          <p>{goneReason || t('online.leftBody')}</p>
          <div className="menu-actions"><button className="primary" onClick={() => void leave()}><Home size={15} /> {t('online.backTitle')}</button></div>
        </div>
      )}

      {error && view === 'fight' && !halted && <div className="toast">{error}<button onClick={() => setError('')} aria-label={t('toast.dismiss')}><X size={14} /></button></div>}
    </>
  );
}
