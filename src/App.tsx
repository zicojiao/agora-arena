import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, RotateCcw, SkipForward, X } from 'lucide-react';
import { Battle } from './engine/battle';
import { createAi } from './engine/ai';
import { NULL_INPUT } from './engine/types';
import { GameCanvas } from './ui/GameCanvas';
import { TouchLayer } from './ui/TouchLayer';
import { createHeld, keyboardBind, toInputFrame, clearHeld } from './ui/input';
import { composeMove } from './game/voiceMove';
import { markFirstVideoFrame, markUlt, resetUltTimeline } from './game/timeline';
import { LiveMoveTranscriber } from './game/liveVoiceMove';
import { captureGameFrame, H3Session, H3_TIMEOUT_MESSAGE, type H3State } from './h3-session';
import { setMuted, unlockAudio } from './render/sfx';
import { setArenaDuck, startArenaBgm, stopArenaBgm } from './render/arenaBgm';
import {
  GAUGE_MAX, gaugeReady, stepGauge, ultimateDamage, type ParsedUltimate,
} from './game/fasth3';
import {
  ROUNDS_TO_WIN, difficultyById, fighterById, loadSettings, loadSetup, opponentDef, saveSettings, saveSetup, stageById, stageLabel,
  type MatchSetup, type Settings,
} from './game/setup';
import { ConfirmDialog, HowToModal, LoadingScreen, PauseMenu, ResultScreen, SettingsModal, SetupScreen, TitleScreen, useLeaveGuard } from './ui/goat/Menus';
import { TechnologyModal } from './ui/goat/TechnologyModal';
import { preloadFighters, preloadGameAssets } from './game/assets';
import { ChargingChip, ControlsLegend, FastH3Gauge, ImpactBanner, MatchHud, PoweredBy, RoundBanner, UltimateRelease } from './ui/goat/Hud';
import { pumpChargeAura, setChargeAura, setChargeLabel } from './render/renderer';
import { buildUltimatePrompt } from './game/ultimatePrompt';
import { getLang, t, useLang } from './i18n';
import { UltimatePanel, type VoiceState } from './ui/goat/UltimatePanel';
import { OnlineMode } from './ui/online/OnlineMode';
import { ControlsGuide } from './ui/goat/ControlsGuide';
import './styles.css';

type Screen = 'title' | 'setup' | 'fight' | 'result' | 'online';
type Phase = 'intro' | 'play' | 'roundEnd';
/** panel: speaking the move (fight paused) · charging: the fight goes on while FastH3 renders, with an aura on the
 * caster · cinema: the clip plays (fight paused), then the hit lands. */
type UltStage = 'panel' | 'charging' | 'cinema';
type Match = { round: number; wins: [number, number]; ultimates: number };

const NEW_MATCH: Match = { round: 1, wins: [0, 0], ultimates: 0 };
const INTRO_MS = 1500;
/** KO / time-up outro on the canvas (slow-mo, win quote) before the next round starts. */
const ROUND_END_MS = 3400;
/** Logic frames after a built-in super ends before its darkened screen has faded back. */
const SUPER_FADE_FRAMES = 45;
/** A pre-warmed Reactor session is released if F is not pressed this long after its GPU became ready (billing
 * runs per second from then): at most ~$0.38 per unused warm-up at $0.75/min. */
const WARM_IDLE_MS = 30_000;
type WarmSession = { session: H3Session; clipSeconds: number; idle?: ReturnType<typeof setTimeout> };

/** Mic and network failures read as instructions, not SDK error codes. */
function friendlyVoiceError(message: string) {
  if (/PERMISSION_DENIED|NotAllowedError|Permission denied/i.test(message)) return t('err.micBlocked');
  if (/NotFoundError|DEVICE_NOT_FOUND/i.test(message)) return t('err.noMic');
  if (/not configured/i.test(message)) return t('err.voiceNotConfigured');
  return t('err.voiceFailed', { message });
}

/** Reactor failures the player can act on read as a sentence, not a raw API body. */
function friendlyFastH3Error(message: string) {
  if (/credits_depleted|balance is depleted|\b402\b/i.test(message)) return t('err.credits');
  if (/\b429\b|rate limit|concurrent/i.test(message)) return t('err.busy');
  if (message === H3_TIMEOUT_MESSAGE) return t('err.timeout');
  return t('err.h3Failed', { message: message.replace(/[.\s。]+$/, '') });
}

const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

function h3Label(state: H3State | null) {
  return t(`cine.state.${state || 'connecting'}` as 'cine.state.connecting');
}

export function App() {
  // Re-render everything (menus, HUD, panels) when the player switches language.
  useLang();
  const [screen, setScreen] = useState<Screen>('title');
  const [setup, setSetup] = useState<MatchSetup>(loadSetup);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [modal, setModal] = useState<'settings' | 'howto' | 'technology' | null>(null);
  const [preflight, setPreflight] = useState<'cpu' | 'online' | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlsSeen = useRef(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  /** A pending 'leave this match?' question and what to do if confirmed. */
  const [confirmLeave, setConfirmLeave] = useState<{ title: string; confirm: string; run: () => void } | null>(null);
  const [match, setMatch] = useState<Match>(NEW_MATCH);
  const [battleKey, setBattleKey] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [gauge, setGauge] = useState(0);
  const [clock, setClock] = useState(60);
  const [cleanFrame, setCleanFrame] = useState(false);
  const [error, setError] = useState('');
  const [touch] = useState(isTouchDevice);
  const [loading, setLoading] = useState<{ done: number; total: number } | null>({ done: 0, total: 0 });
  /** An invite link (?room=CODE) opens straight into that online room once assets are loaded. */
  const [inviteCode] = useState(() => new URLSearchParams(location.search).get('room'));
  useEffect(() => { if (inviteCode) setPreflight('online'); }, [inviteCode]);

  const [ultStage, setUltStage] = useState<UltStage | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [micLevel, setMicLevel] = useState(0);
  const [heard, setHeard] = useState('');
  const [moveText, setMoveText] = useState('');
  const [ultimate, setUltimate] = useState<ParsedUltimate | null>(null);
  const [h3State, setH3State] = useState<H3State | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [impact, setImpact] = useState<{ name: string; damage: number } | null>(null);
  const [pumps, setPumps] = useState(0);
  const pumpsRef = useRef(0);
  const [release, setRelease] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<LiveMoveTranscriber | null>(null);
  const voiceKeyRef = useRef({ active: false, held: false });
  const voiceAbortRef = useRef<AbortController | null>(null);
  const castEpochRef = useRef(0);
  const micRef = useRef<MediaStream | null>(null);
  const h3Ref = useRef<H3Session | null>(null);
  /** Reactor session connected ahead of time once the gauge fills, so pressing F only has to upload the frame. */
  const warmRef = useRef<WarmSession | null>(null);
  /** One warm-up per gauge fill: after an idle release, F falls back to connecting on demand. */
  const warmedFillRef = useRef(false);
  const referenceRef = useRef<File | null>(null);
  const gaugeRef = useRef(0);
  const lastHpRef = useRef({ p1Hp: 0, p2Hp: 0 });
  const skipGaugeRef = useRef(false);
  const roundEndRef = useRef(false);
  const finishedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const ultimateNameRef = useRef('');
  const superUntilRef = useRef(0);
  const superBusyRef = useRef(false);
  const [superBusy, setSuperBusy] = useState(false);
  /** Resolves once the fight frame is captured and the FastH3 session exists (a fast typist can beat it). */
  const captureReadyRef = useRef<Promise<void>>(Promise.resolve());
  /** Where the player stood in the captured opening frame, so the prompt puts the attacker on the right side. */
  const casterSideRef = useRef<'left' | 'right'>('left');
  /** The clip has started playing; from then on a dropped connection means it is over, not that it failed. */
  const playedRef = useRef(false);

  const player = fighterById(setup.playerId);
  const opponent = fighterById(setup.opponentId);
  const stage = stageById(setup.stageId);
  const held = useMemo(createHeld, [battleKey]);
  const previous = useMemo(createHeld, [battleKey]);
  // A new Battle per round (battleKey); setup is read at that moment, so mid-match changes apply next round.
  const battle = useMemo(() => {
    const b = new Battle(structuredClone(player), opponentDef(setup), 285, 675, false);
    lastHpRef.current = { p1Hp: b.p1.hp, p2Hp: b.p2.hp };
    roundEndRef.current = false;
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleKey]);
  const ai = useMemo(() => createAi(difficultyById(setup.difficulty).ai, 914 + battleKey * 71),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [battleKey]);

  const paused = screen !== 'fight' || controlsOpen || pauseOpen || modal !== null || phase === 'intro' || ultStage === 'panel' || ultStage === 'cinema';

  const later = (fn: () => void, ms: number) => { timersRef.current.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };

  useEffect(() => {
    let live = true;
    void preloadGameAssets([setup.playerId, setup.opponentId], (done, total) => { if (live) setLoading({ done, total }); }).then(() => { if (live) setLoading(null); });
    return () => { live = false; };
  }, []);
  useEffect(() => keyboardBind(held, false), [held]);
  useEffect(() => { setClock(Math.ceil(battle.timeLeft / 60)); }, [battle]);
  // Each round is a new Battle whose frame counter restarts at 0: a super from the previous round must not keep
  // the FastH3 ultimate locked (it did, for up to a whole round, showing a full bar with no prompt).
  useEffect(() => { superUntilRef.current = 0; superBusyRef.current = false; setSuperBusy(false); }, [battle]);
  // Dev-only handle for frame-by-frame animation review; stripped from production builds.
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __battle?: Battle }).__battle = battle; }, [battle]);
  useEffect(() => { setMuted(!settings.sound); saveSettings(settings); }, [settings]);
  useEffect(() => { saveSetup(setup); }, [setup]);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => undefined);
      if (ultStage === 'cinema') return markFirstVideoFrame(videoRef.current);
    }
  }, [stream, ultStage]);
  useEffect(() => () => { clearTimers(); voiceAbortRef.current?.abort(); recorderRef.current?.cancel(); micRef.current?.getTracks().forEach(t => t.stop()); void h3Ref.current?.close(); void warmRef.current?.session.close(); stopArenaBgm(); }, []);
  // Held keys are dropped whenever control leaves the fight, so nobody keeps walking after a menu.
  useEffect(() => { if (paused) clearHeld(held); }, [paused, held]);

  // Music: the electronic fight track in fights (faster each round), its half-time version on menus. Browsers
  // only start audio after a user gesture, so the title stays quiet until the first click.
  const [audioOn, setAudioOn] = useState(false);
  useEffect(() => {
    if (!audioOn || screen === 'online') return; // online mode drives its own music
    if (screen === 'fight') startArenaBgm('fight', Math.min(2, match.round - 1));
    else startArenaBgm('menu');
  }, [audioOn, screen, match.round]);
  // Duck under menus, drop low while the player talks to the announcer, and go silent under the FastH3 clip
  // (it brings its own sound).
  useEffect(() => {
    setArenaDuck(ultStage === 'cinema' ? 0 : ultStage === 'panel' ? 0.22 : pauseOpen || modal ? 0.4 : 1);
  }, [ultStage, pauseOpen, modal]);

  // Round intro: banner, then hand control over.
  useEffect(() => {
    if (screen !== 'fight' || phase !== 'intro' || controlsOpen) return;
    const t = window.setTimeout(() => setPhase('play'), INTRO_MS);
    return () => clearTimeout(t);
  }, [screen, phase, battleKey, controlsOpen]);

  const closeVoice = useCallback(async () => {
    voiceAbortRef.current?.abort(); voiceAbortRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    micRef.current?.getTracks().forEach(t => t.stop());
    micRef.current = null;
    setVoiceState('idle'); setMicLevel(0);
  }, []);

  const closeUltimate = useCallback(async () => {
    castEpochRef.current++;
    await closeVoice();
    const h3 = h3Ref.current;
    h3Ref.current = null;
    referenceRef.current = null;
    setUltStage(null); setHeard('');
    setH3State(null); setStream(null); setMoveText(''); setUltimate(null);
    setChargeAura(null);
    await h3?.close();
  }, [closeVoice]);

  const dropWarm = useCallback(() => {
    const warm = warmRef.current;
    warmRef.current = null;
    if (!warm) return;
    clearTimeout(warm.idle);
    void warm.session.close();
  }, []);

  const resetMatchState = useCallback(async () => {
    clearTimers();
    dropWarm();
    await closeUltimate();
    setPauseOpen(false); setModal(null); setImpact(null); setError('');
    gaugeRef.current = 0; setGauge(0);
  }, [closeUltimate, dropWarm]);

  // Fetch the picked fighters' sprite sheets while the player is still on the setup screen.
  useEffect(() => { void preloadFighters([setup.playerId, setup.opponentId]); }, [setup.playerId, setup.opponentId]);

  const startMatch = useCallback(async () => {
    unlockAudio();
    setAudioOn(true);
    await preloadFighters([setupRef.current.playerId, setupRef.current.opponentId]);
    await resetMatchState();
    setMatch(NEW_MATCH);
    setPhase('intro');
    setBattleKey(k => k + 1);
    setScreen('fight');
  }, [resetMatchState]);

  const requestFight = () => { if (controlsSeen.current) void startMatch(); else setPreflight('cpu'); };
  const requestOnline = () => { if (controlsSeen.current) setScreen('online'); else setPreflight('online'); };
  const beginAfterGuide = () => { const next = preflight; controlsSeen.current = true; setPreflight(null); if (next === 'cpu') void startMatch(); else setScreen('online'); };

  const goTo = useCallback(async (next: Screen) => {
    await resetMatchState();
    setScreen(next);
  }, [resetMatchState]);

  // Side effects stay out of state updaters (StrictMode runs those twice and would skip a round).
  const matchRef = useRef(match);
  matchRef.current = match;
  const resolveRound = useCallback((b: Battle) => {
    const m = matchRef.current;
    const wins: [number, number] = [...m.wins];
    if (b.winner === 0 || b.winner === 1) wins[b.winner]++;
    if (wins[0] >= ROUNDS_TO_WIN || wins[1] >= ROUNDS_TO_WIN) {
      setMatch({ ...m, wins });
      setScreen('result');
      return;
    }
    setMatch({ ...m, wins, round: m.round + 1 });
    setPhase('intro');
    setBattleKey(k => k + 1);
  }, []);

  const onTick = useCallback((b: Battle) => {
    const now = { p1Hp: b.p1.hp, p2Hp: b.p2.hp };
    const over = b.winner !== null || b.doubleKo || b.timeUp;
    if (skipGaugeRef.current) skipGaugeRef.current = false; // the ultimate's own damage does not refill the gauge
    else if (!over && gaugeRef.current < GAUGE_MAX) gaugeRef.current = stepGauge(gaugeRef.current, lastHpRef.current, now);
    lastHpRef.current = now;
    // The built-in super darkens the screen and hides the target; keep the FastH3 ultimate closed until it and
    // its fade-out are over, or the clip would start from a black frame.
    if (b.inSuperCinematic()) superUntilRef.current = b.frame + SUPER_FADE_FRAMES;
    const busy = b.frame < superUntilRef.current;
    if (busy !== superBusyRef.current) { superBusyRef.current = busy; setSuperBusy(busy); }
    if (b.frame % 6 === 0 || gaugeRef.current >= GAUGE_MAX) setGauge(g => (Math.floor(g) === Math.floor(gaugeRef.current) ? g : gaugeRef.current));
    setClock(Math.ceil(b.timeLeft / 60));
    if (over && !roundEndRef.current) {
      roundEndRef.current = true;
      setPhase('roundEnd');
      later(() => resolveRound(b), ROUND_END_MS);
    }
  }, [resolveRound]);

  // Pre-warm Reactor as soon as the gauge is full in a live fight: the GPU assignment (~8 s) then overlaps the
  // player getting ready, and F only uploads the frame. Released after WARM_IDLE_MS of GPU time without a cast.
  const gaugeFull = gauge >= GAUGE_MAX;
  useEffect(() => {
    // Leaving the fight (result screen, menus) releases a warm GPU straight away rather than after the idle cap.
    if (screen !== 'fight') dropWarm();
    if (!gaugeFull) { warmedFillRef.current = false; return; }
    if (screen !== 'fight' || phase !== 'play' || ultStage || warmRef.current || warmedFillRef.current) return;
    warmedFillRef.current = true;
    const session = new H3Session(undefined, settings.clipSeconds);
    const warm: WarmSession = { session, clipSeconds: settings.clipSeconds };
    warmRef.current = warm;
    session.connect().then(() => {
      if (warmRef.current !== warm) return;
      warm.idle = setTimeout(() => { if (warmRef.current === warm) dropWarm(); }, WARM_IDLE_MS);
    }, () => { if (warmRef.current === warm) warmRef.current = null; });
  }, [gaugeFull, screen, phase, ultStage, settings.clipSeconds, dropWarm]);

  /** Stream one spoken turn, then compose only its confirmed final text. */
  const startVoice = useCallback(async () => {
    voiceAbortRef.current?.abort(); recorderRef.current?.cancel();
    const attempt = new AbortController(); voiceAbortRef.current = attempt;
    const epoch = castEpochRef.current;
    setError(''); setHeard(''); setVoiceState('connecting');
    if (voiceKeyRef.current.active && !voiceKeyRef.current.held) { setVoiceState('idle'); return; }
    try {
      markUlt('mic-request');
      const mic = micRef.current ?? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      markUlt('mic-ready');
      if (attempt.signal.aborted || epoch !== castEpochRef.current) { if (mic !== micRef.current) mic.getTracks().forEach(t => t.stop()); return; }
      micRef.current = mic;
      const recorder = new LiveMoveTranscriber(mic.getAudioTracks()[0], getLang(), {
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
      micRef.current?.getTracks().forEach(t => t.stop()); micRef.current = null;
      if (!transcript) { setVoiceState('error'); setError(t('err.noSpeech')); return; }
      setVoiceState('thinking');
      const move = await composeMove(transcript, player.name, opponent.name, getLang(), attempt.signal);
      if (attempt.signal.aborted || epoch !== castEpochRef.current) return;
      setHeard(move.transcript);
      void unleashRef.current(move);
    } catch (e) {
      if (attempt.signal.aborted || epoch !== castEpochRef.current) return;
      recorderRef.current?.cancel(); recorderRef.current = null;
      micRef.current?.getTracks().forEach(t => t.stop()); micRef.current = null;
      setMicLevel(0); setVoiceState('error');
      setError(friendlyVoiceError(e instanceof Error ? e.message : String(e)));
    }
  }, [player.name, opponent.name]);

  const finishUltimate = useCallback(async (name: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markUlt('impact');
    await closeUltimate();
    const damage = Math.min(battle.p2.hp, ultimateDamage(battle.p2.def.hp, pumpsRef.current));
    battle.queueStrike(0, damage);
    skipGaugeRef.current = true;
    gaugeRef.current = 0; setGauge(0);
    setMatch(m => ({ ...m, ultimates: m.ultimates + 1 }));
    setImpact({ name, damage });
    later(() => setImpact(null), 2200);
  }, [battle, closeUltimate]);

  const abortUltimate = useCallback(async (message: string) => {
    // A failed generation refunds nothing because nothing was spent: the gauge stays full.
    await closeUltimate();
    setError(t('err.gaugeKept', { message: friendlyFastH3Error(message) }));
  }, [closeUltimate]);

  const openUltimate = useCallback(async (keyboard = false) => {
    if (screen !== 'fight' || phase !== 'play' || pauseOpen || controlsOpen || modal || ultStage) return;
    if (!gaugeReady(gaugeRef.current) || battle.winner !== null || battle.timeUp || battle.doubleKo) return;
    if (superBusyRef.current || battle.inSuperCinematic()) return;
    voiceKeyRef.current = { active: keyboard, held: keyboard };
    resetUltTimeline(); markUlt('open');
    const epoch = ++castEpochRef.current;
    setError(''); setHeard(''); setMoveText('');
    finishedRef.current = false;
    playedRef.current = false;
    setUltStage('panel');
    const canvas = document.querySelector<HTMLCanvasElement>('.arena canvas');
    let ready: () => void = () => undefined;
    captureReadyRef.current = new Promise<void>(resolve => { ready = resolve; });
    if (canvas) {
      try {
        // Freeze the fight frame now and start the slow FastH3 connect while the player is still talking.
        // The clip starts from this frame, so draw it once without health bars, hit counters or banners;
        // otherwise the video carries a frozen copy of the game HUD.
        setCleanFrame(true);
        // A white hit flash would also carry into the clip (the fighter stays white); the fight is paused, so
        // clearing it only skips the last frame or two of the flash.
        battle.p1.flash = 0; battle.p2.flash = 0;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const reference = await captureGameFrame(canvas).finally(() => setCleanFrame(false));
        markUlt('frame-captured');
        if (epoch !== castEpochRef.current) { ready(); return; }
        casterSideRef.current = battle.p1.x <= battle.p2.x ? 'left' : 'right';
        referenceRef.current = reference;
        // Reuse the session connected when the gauge filled (same clip length, still healthy); else connect now.
        const warm = warmRef.current;
        warmRef.current = null;
        if (warm) clearTimeout(warm.idle);
        const reuse = warm && warm.session.usable && warm.clipSeconds === settings.clipSeconds ? warm.session : null;
        if (warm && !reuse) void warm.session.close();
        markUlt('h3-session', { prewarmed: Boolean(reuse) });
        const session = reuse ?? new H3Session(undefined, settings.clipSeconds);
        session.attach({
          onState: state => {
            if (epoch !== castEpochRef.current) return;
            setH3State(state);
            // The rendered clip is ready: only now does the fight stop for the cinematic.
            if (state === 'playing') {
              playedRef.current = true;
              setChargeAura(null);
              setPauseOpen(false); setModal(null);
              setUltStage(s => (s === 'charging' ? 'cinema' : s));
              setRelease(true); later(() => setRelease(false), 900);
            }
            if (state === 'finished') later(() => { if (epoch === castEpochRef.current) void finishUltimate(ultimateNameRef.current); }, 700);
          },
          onStream: stream => { if (epoch === castEpochRef.current) setStream(stream); },
          // Reactor closes the peer connection as the clip ends, which can beat `clip_finished` here.
          onError: message => { if (epoch === castEpochRef.current) void (playedRef.current ? finishUltimate(ultimateNameRef.current) : abortUltimate(message)); },
        });
        h3Ref.current = session;
        void session.prepare(reference);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    ready();
    if (epoch === castEpochRef.current && settings.voice) void startVoice();
  }, [screen, phase, pauseOpen, controlsOpen, modal, ultStage, battle, settings.voice, settings.clipSeconds, startVoice, finishUltimate, abortUltimate]);

  const unleash = useCallback(async (u: ParsedUltimate) => {
    const epoch = castEpochRef.current;
    await captureReadyRef.current;
    if (epoch !== castEpochRef.current) return;
    const session = h3Ref.current, reference = referenceRef.current;
    if (!session || !reference) { void abortUltimate(t('err.noFrame')); return; }
    ultimateNameRef.current = u.name;
    setUltimate(u);
    await closeVoice();
    if (epoch !== castEpochRef.current) return;
    // Straight back into the fight: the caster glows while FastH3 renders; the cinematic interrupts only when ready.
    setUltStage('charging');
    pumpsRef.current = 0; setPumps(0);
    setChargeAura(0);
    setChargeLabel(u.name);
    const prompt = buildUltimatePrompt({ caster: player, target: opponent, casterSide: casterSideRef.current, move: u, lang: getLang() });
    markUlt('unleash');
    session.generate(prompt, reference, u.name).catch(() => undefined);
  }, [abortUltimate, closeVoice, player.name, opponent.name]);
  const unleashRef = useRef(unleash);
  unleashRef.current = unleash;

  // A round that ends while the ultimate is still rendering takes it with it (the gauge is kept).
  useEffect(() => {
    if (ultStage !== 'charging' || phase === 'play') return;
    void closeUltimate().then(() => setError(t('err.roundEnded')));
  }, [ultStage, phase, closeUltimate]);

  // Mashing F while the clip renders pumps a little more power into the hit (and flares the aura).
  const pump = useCallback(() => {
    pumpsRef.current += 1;
    setPumps(pumpsRef.current);
    pumpChargeAura();
  }, []);

  // Typed moves take the same path as spoken ones (so Chinese or name-less input still becomes a clean move).
  const submitText = () => {
    const text = moveText.trim();
    if (!text) return;
    void closeVoice();
    const attempt = new AbortController(); voiceAbortRef.current = attempt;
    const epoch = castEpochRef.current;
    setVoiceState('thinking');
    composeMove(text, player.name, opponent.name, getLang(), attempt.signal).then(move => {
      if (!attempt.signal.aborted && epoch === castEpochRef.current) void unleash(move);
    }).catch(e => {
      if (!attempt.signal.aborted && epoch === castEpochRef.current) { setVoiceState('error'); setError(e instanceof Error ? e.message : String(e)); }
    });
  };

  // Keyboard: F unleashes when charged, Esc / P pauses. Menus handle their own keys.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || screen !== 'fight') return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyF') { e.preventDefault(); if (ultStage === 'charging') pump(); else void openUltimate(true); }
      if ((e.code === 'Escape' || e.code === 'KeyP') && !pauseOpen && !modal && (!ultStage || ultStage === 'charging') && phase !== 'roundEnd') {
        e.preventDefault(); setPauseOpen(true);
      }
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
  }, [screen, openUltimate, pauseOpen, controlsOpen, modal, ultStage, phase, pump]);

  // Closing / reloading the tab mid-match asks first; when the page really goes, release the mic and FastH3.
  useLeaveGuard(screen === 'fight' || ultStage !== null, () => { voiceAbortRef.current?.abort(); recorderRef.current?.cancel(); micRef.current?.getTracks().forEach(t => t.stop()); void h3Ref.current?.close(); void warmRef.current?.session.close(); });

  // Leaving the tab mid-fight pauses instead of letting the AI play on.
  useEffect(() => {
    const hide = () => { if (document.hidden && screen === 'fight' && !ultStage && phase === 'play') setPauseOpen(true); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [screen, ultStage, phase]);

  const playerWonMatch = match.wins[0] >= ROUNDS_TO_WIN;
  const finalRound = match.round >= ROUNDS_TO_WIN * 2 - 1;
  const cinemaLive = h3State === 'playing' || h3State === 'finished';

  if (screen === 'online' && !loading) {
    return (
      <main className="app-shell">
        <OnlineMode settings={settings} touch={touch} initialCode={inviteCode} onExit={() => setScreen('title')} />
        {modal === 'settings' && <SettingsModal settings={settings} onChange={setSettings} onClose={() => setModal(null)} />}
        <div className="rotate-device"><RotateCcw /><b>{t('rotate.title')}</b><span>{t('rotate.body')}</span></div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="arena" aria-label={t('online.fightAria')}>
        <GameCanvas
          key={battleKey}
          battle={battle}
          getP1={() => paused ? NULL_INPUT : toInputFrame(held, previous)}
          getP2={() => paused ? NULL_INPUT : ai(battle, 1)}
          onTick={onTick}
          stage={stage.bg}
          paused={paused}
          hud={screen === 'fight' && !cleanFrame}
        />
        {screen === 'fight' && touch && !paused && <TouchLayer held={held} battle={battle} hideHints />}
      </section>

      {loading && <LoadingScreen done={loading.done} total={loading.total} />}
      {!loading && screen === 'title' && <TitleScreen onPlay={() => { unlockAudio(); setAudioOn(true); setScreen('setup'); }} onOnline={() => { unlockAudio(); setAudioOn(true); requestOnline(); }} onSettings={() => setModal('settings')} onHowTo={() => setModal('howto')} onTechnology={() => setModal('technology')} />}
      {screen === 'setup' && <SetupScreen setup={setup} onChange={setSetup} onFight={requestFight} onBack={() => setScreen('title')} />}

      {screen === 'fight' && (
        <>
          <MatchHud round={match.round} wins={match.wins} stageLabel={`${stageLabel(stage).name} // ${stageLabel(stage).time}`} seconds={clock} onPause={() => { if (!ultStage) setPauseOpen(true); }} onControls={() => setControlsOpen(true)} controlsDisabled={Boolean(ultStage)} />
          {phase === 'intro' && <RoundBanner round={match.round} final={finalRound && match.round > 1} />}
          {!ultStage && phase !== 'intro' && <FastH3Gauge value={gauge} onTrigger={() => void openUltimate()} touch={touch} live={phase === 'play' && !superBusy} />}
          {settings.showControls && !touch && ultStage !== 'panel' && <ControlsLegend />}
          <PoweredBy />
          {impact && <ImpactBanner name={impact.name} damage={impact.damage} />}
        </>
      )}

      {ultStage === 'panel' && (
        <UltimatePanel
          fighterName={player.name} opponentName={opponent.name}
          voice={settings.voice} voiceState={voiceState} level={micLevel} heard={heard}
          text={moveText} error={error}
          onText={value => { voiceKeyRef.current.active = false; void closeVoice(); setMoveText(value); }} onSubmitText={submitText}
          onDone={() => recorderRef.current?.finish()}
          onRetry={() => { voiceKeyRef.current.active = false; void startVoice(); }}
          onHoldStart={() => { voiceKeyRef.current = { active: true, held: true }; if (voiceState === 'idle' || voiceState === 'error') void startVoice(); }}
          onCancel={() => void closeUltimate()}
        />
      )}

      {ultStage === 'charging' && ultimate && (
        <ChargingChip name={ultimate.name} state={h3State} presses={pumps} onPump={pump} onCancel={() => void closeUltimate()} />
      )}

      {release && ultimate && <UltimateRelease name={ultimate.name} />}
      {ultStage === 'cinema' && (
        <div className="cinematic">
          <video ref={videoRef} autoPlay playsInline />
          {!cinemaLive && (
            <div className="generation-state">
              <LoaderCircle className="spin" />
              <small>{t('cine.seconds', { n: Math.round(settings.clipSeconds) })}</small>
              <h3>{ultimate?.name}</h3>
              <h4>{h3Label(h3State)}</h4>
              <div className="progress"><i /></div>
              <p>{ultimate?.description}</p>
              <button className="cinematic-cancel" onClick={() => void closeUltimate()}><X size={14} /> {t('cine.cancel')}</button>
            </div>
          )}
          {cinemaLive && <div className="cinematic-label"><span>{t('cine.credit', { name: player.name })}</span><b>{ultimate?.name}</b></div>}
          {cinemaLive && <button className="cinematic-close" onClick={() => void finishUltimate(ultimate?.name ?? t('cine.fallbackName'))}><SkipForward size={14} /> {t('cine.skip')}</button>}
        </div>
      )}

      {confirmLeave && (
        <ConfirmDialog title={confirmLeave.title} confirm={confirmLeave.confirm}
          body={ultStage ? t('confirm.ultLost') : t('confirm.matchLost')}
          onCancel={() => setConfirmLeave(null)}
          onConfirm={() => { const go = confirmLeave.run; setConfirmLeave(null); go(); }} />
      )}
      {pauseOpen && !modal && !confirmLeave && (
        <PauseMenu
          onResume={() => setPauseOpen(false)}
          onRestart={() => setConfirmLeave({ title: t('confirm.restart.title'), confirm: t('confirm.restart'), run: () => void startMatch() })}
          onSetup={() => setConfirmLeave({ title: t('confirm.setup.title'), confirm: t('confirm.setup'), run: () => void goTo('setup') })}
          onQuit={() => setConfirmLeave({ title: t('confirm.quit.title'), confirm: t('confirm.quit'), run: () => void goTo('title') })}
          onSettings={() => setModal('settings')}
          onHowTo={() => setModal('howto')}
        />
      )}
      {modal === 'settings' && (
        <SettingsModal settings={settings} onChange={setSettings} onClose={() => setModal(null)}
          difficulty={screen === 'fight' ? setup.difficulty : undefined}
          onDifficulty={d => setSetup(s => ({ ...s, difficulty: d }))} />
      )}
      {preflight && <ControlsGuide touch={touch} beforeMatch online={preflight === 'online'} onClose={() => setPreflight(null)} onStart={beginAfterGuide} />}
      {controlsOpen && <ControlsGuide touch={touch} onClose={() => setControlsOpen(false)} />}
      {modal === 'howto' && <HowToModal onClose={() => setModal(null)} />}
      {modal === 'technology' && <TechnologyModal onClose={() => setModal(null)} />}

      {screen === 'result' && (
        <ResultScreen
          winnerName={playerWonMatch ? player.name : opponent.name}
          score={match.wins} playerWon={playerWonMatch} ultimates={match.ultimates}
          onRematch={() => void startMatch()} onSetup={() => void goTo('setup')} onQuit={() => void goTo('title')}
        />
      )}

      {error && !ultStage && <div className="toast">{error}<button onClick={() => setError('')} aria-label={t('toast.dismiss')}><X size={14} /></button></div>}
      <div className="rotate-device"><RotateCcw /><b>{t('rotate.title')}</b><span>{t('rotate.body')}</span></div>
    </main>
  );
}
