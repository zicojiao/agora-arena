/** Real public-UI QA. No app-state overrides, debug hooks, intercepted APIs or physical microphones. */
import { chromium } from 'playwright-core';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `Online browser QA (uses paid speech/video APIs during a normal run):
  BASE=https://your-deployment.example CHROMIUM=/absolute/chromium \\
  FAKE_MIC_WAV=/absolute/looping-speech.wav npm run test:e2e
Required: explicit BASE, CHROMIUM and FAKE_MIC_WAV. No browser is downloaded.
Optional: E2E_MODES=voice,typed (default; each mode generates one real clip).
  --check-config validates configuration and WAV only; never opens a browser.
  --help shows this help. Results/screenshots: .artifacts/online-e2e/<run>/.
WAV must be PCM16, contain speech, and have less than 6s continuous quiet including loop edges.`;
if (process.argv.includes('--help')) { console.log(HELP); process.exit(0); }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = key => { if (!process.env[key]) throw new Error(`Missing ${key}. See --help.`); return process.env[key]; };

// A room's fake mic starts at join, long before F is pressed. A fixture with long trailing
// silence creates false "No speech" failures depending on the arbitrary point in its loop.
async function validateWav(file) {
  const bytes = await readFile(file);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('FAKE_MIC_WAV must be a RIFF WAV.');
  let fmt, data;
  for (let i = 12; i + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(i + 4), start = i + 8;
    if (start + size > bytes.length) throw new Error('Truncated WAV chunk.');
    const name = bytes.toString('ascii', i, i + 4);
    if (name === 'fmt ') fmt = bytes.subarray(start, start + size);
    if (name === 'data') data = bytes.subarray(start, start + size);
    i = start + size + (size % 2);
  }
  if (!fmt || fmt.length < 16 || !data || fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(14) !== 16) throw new Error('Use uncompressed PCM16 WAV audio.');
  const channels = fmt.readUInt16LE(2), rate = fmt.readUInt32LE(4);
  if (![1, 2].includes(channels) || rate < 8000) throw new Error('Use mono/stereo PCM16 at 8kHz or higher.');
  const block = Math.max(1, Math.floor(rate * .05)) * channels;
  const quiet = [];
  for (let start = 0; start < data.length / 2; start += block) {
    let sum = 0, count = 0;
    for (let i = start; i < Math.min(start + block, data.length / 2); i++) { sum += (data.readInt16LE(i * 2) / 32768) ** 2; count++; }
    quiet.push(Math.sqrt(sum / count) < .02);
  }
  if (quiet.filter(q => !q).length < 6) throw new Error('WAV needs at least 300ms audible speech.');
  let run = 0, longest = 0;
  for (const q of [...quiet, ...quiet]) { run = q ? run + 1 : 0; longest = Math.max(longest, run); }
  if (longest * .05 >= 6) throw new Error('WAV has a >=6s quiet gap across its loop. Trim trailing silence.');
}

let base, executable, wav, modes;
try {
  base = new URL(required('BASE'));
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('BASE must be a plain HTTP(S) app URL without credentials, query or fragment.');
  executable = required('CHROMIUM'); wav = required('FAKE_MIC_WAV');
  if (!path.isAbsolute(executable) || !path.isAbsolute(wav)) throw new Error('CHROMIUM and FAKE_MIC_WAV must be absolute paths.');
  await access(executable, constants.X_OK); await validateWav(wav);
  modes = (process.env.E2E_MODES || 'voice,typed').split(',');
  if (!modes.length || modes.some(mode => !['voice', 'typed'].includes(mode)) || new Set(modes).size !== modes.length) throw new Error('E2E_MODES must be voice, typed, or voice,typed.');
} catch (error) { console.error(error.code ? `Configuration failed (${error.code}). Check the supplied file paths.` : error.message); process.exit(2); }
if (process.argv.includes('--check-config')) { console.log('Configuration and looping speech WAV passed; no browser or paid API was used.'); process.exit(0); }

const artifactDir = path.join(root, '.artifacts', 'online-e2e', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(artifactDir, { recursive: true });
const checks = [], browsers = [], pages = [];
let currentStep = 'launch';
function check(name, passed, metrics = {}) {
  checks.push({ name, passed: Boolean(passed), ...metrics });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) throw new Error(`Assertion: ${name}`);
}
async function step(name, action) { currentStep = name; await action(); }
async function until(read, timeout = 20_000) {
  const end = Date.now() + timeout;
  do { if (await read()) return true; await sleep(100); } while (Date.now() < end);
  return false;
}
const visible = (page, selector) => page.locator(selector).first().isVisible();
const hud = page => page.evaluate(() => ({ clock: Number(document.querySelector('.round-clock')?.textContent), score: document.querySelector('.result-score')?.textContent?.replace(/\s/g, '') }));
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), mask: [page.locator('.room-code'), page.locator('input'), page.locator('.toast'), page.locator('.panel-error')] });
}
async function unlock(page) {
  if (await page.locator('input[name="password"]').isVisible()) {
    if (!process.env.ARENA_QA_PASSWORD) throw new Error('Set ARENA_QA_PASSWORD for the private preview.');
    await page.locator('input[name="password"]').fill(process.env.ARENA_QA_PASSWORD);
    await page.getByRole('button', { name: 'Enter Arena', exact: true }).click();
    await page.locator('input[name="password"]').waitFor({ state: 'hidden' });
  }
}
async function open() {
  const browser = await chromium.launch({ executablePath: executable, headless: true, args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required',
  ] });
  browsers.push(browser);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
  const page = await context.newPage(); page.setDefaultTimeout(20_000);
  const state = { pageErrors: 0, desync: 0 };
  // Only counters are retained: console payloads can contain room IDs or provider data.
  page.on('pageerror', () => state.pageErrors++);
  page.on('console', msg => { if (/lockstep desync/i.test(msg.text())) state.desync++; });
  pages.push({ page, state });
  return page;
}
async function press(page, key) { await page.keyboard.down(key); await sleep(100); await page.keyboard.up(key); await sleep(50); }
async function fightCycle(page) {
  // Fixed order and timing: repeatable inputs instead of Math.random mash.
  for (const key of ['KeyD', 'KeyD', 'KeyJ', 'KeyJ', 'KeyJ', 'KeyU', 'KeyI', 'KeyO']) await press(page, key);
}
async function waitPlaying(host, guest) {
  check('Both matches are active', await until(async () => await visible(host, '.round-clock') && await visible(guest, '.round-clock') && !await visible(host, '.round-banner') && !await visible(guest, '.round-banner'), 15_000));
}
async function rematch(host, guest) {
  await host.getByRole('button', { name: 'REMATCH', exact: true }).click();
  check('Rematch starts on both', await until(async () => await visible(host, '.round-clock') && await visible(guest, '.round-clock'), 15_000));
  await waitPlaying(host, guest);
}
async function charge(host, guest) {
  const end = Date.now() + 110_000;
  while (Date.now() < end) {
    if (await visible(host, '.result-screen')) break;
    if (await visible(host, '.fasth3-gauge.ready')) {
      if ((await hud(host)).clock >= 40 && !await visible(host, '.round-banner')) break;
      // Gauge carries over rounds. Wait for a fresh round instead of starting a paid
      // clip too near timeout and incorrectly treating valid round cleanup as a failure.
      await sleep(200);
    } else await fightCycle(host);
  }
  const [a, b] = await Promise.all([hud(host), hud(guest)]);
  check('Gauge charges through normal fighting with synchronized clocks', await visible(host, '.fasth3-gauge.ready') && Number.isFinite(a.clock) && Math.abs(a.clock - b.clock) <= 1);
}
async function finishMatch(host, guest) {
  const end = Date.now() + 240_000;
  while (Date.now() < end && !await visible(host, '.result-screen')) await fightCycle(host);
  check('Both reach the result screen', await until(async () => await visible(host, '.result-screen') && await visible(guest, '.result-screen'), 15_000));
  const [a, b] = await Promise.all([hud(host), hud(guest)]);
  check('Final match scores agree', Boolean(a.score) && a.score === b.score);
}

try {
  const host = await open(), guest = await open();
  await step('room and voice', async () => {
    await host.goto(base.href); await unlock(host); await host.locator('.start-screen').waitFor();
    await host.getByRole('button', { name: /PLAY ONLINE/ }).click();
    if (await host.locator('.controls-card').isVisible()) await host.getByRole('button', { name: 'CONTINUE TO LOBBY' }).click();
    await host.getByRole('button', { name: /CREATE ROOM/ }).click();
    await host.locator('.online-lobby').waitFor({ timeout: 40_000 });
    const code = (await host.locator('.room-code').textContent()).trim();
    check('Host creates a six-character room', /^[A-Z0-9]{6}$/.test(code));
    await host.getByRole('button', { name: /COPY INVITE LINK/ }).click();
    const invite = new URL(await host.evaluate(() => navigator.clipboard.readText()));
    check('Invite stays on the selected deployment', invite.origin === base.origin && invite.searchParams.get('room') === code);
    await guest.goto(invite.href); await unlock(guest);
    if (await guest.locator('.controls-card').isVisible()) await guest.getByRole('button', { name: 'CONTINUE TO LOBBY' }).click(); await guest.locator('.online-lobby').waitFor({ timeout: 40_000 });
    check('Both peers join', await until(async () => !await visible(host, '.peer-card.waiting') && !await visible(guest, '.peer-card.waiting')));
    const pick = guest.locator('.lobby-player').first().locator('.fighter-card').nth(2);
    const fighter = (await pick.locator('span').textContent()).trim(); await pick.click();
    check('Fighter choice syncs', await until(async () => (await host.locator('.peer-card b').textContent()) === fighter));
    check('Agora voice arrives in both directions', (await Promise.all([host, guest].map(page => until(() => page.locator('.lobby-player').nth(1).evaluate(element => element.classList.contains('speaking')), 30_000)))).every(Boolean));
    check('Network latency is displayed', await until(async () => /\d+ ms/.test(await host.locator('.ping').textContent())));
    await screenshot(host, '01-lobby');
    await host.getByRole('button', { name: /START MATCH/ }).click();
    await waitPlaying(host, guest);
  });

  for (const mode of modes) await step(`${mode} ultimate`, async () => {
    if (await visible(host, '.result-screen')) await rematch(host, guest);
    await charge(host, guest);
    // Observe short-lived impact UI concurrently so sequential polling cannot miss one peer.
    const observed = { frames: 0, hostImpact: '', guestImpact: '', error: false };
    const started = Date.now();
    let observing = true;
    const monitor = (async () => {
      while (observing) {
        const states = await Promise.all([host, guest].map(page => page.evaluate(() => {
          const video = document.querySelector('.cinematic.watch video');
          return { frames: video && !video.classList.contains('hidden') ? video.getVideoPlaybackQuality().totalVideoFrames : 0,
            impact: document.querySelector('.impact-banner b')?.textContent || '',
            error: Boolean(document.querySelector('.panel-error')?.textContent?.trim() || document.querySelector('.toast')?.textContent?.trim()) };
        })));
        observed.frames = Math.max(observed.frames, states[1].frames);
        observed.hostImpact ||= states[0].impact; observed.guestImpact ||= states[1].impact;
        observed.error ||= states.some(state => state.error);
        await sleep(100);
      }
    })();
    try {
      await host.keyboard.press('KeyF');
      check(`${mode}: host panel and guest incoming notice`, await until(async () => await visible(host, '.ultimate-panel') && await visible(guest, '.cinematic.watch'), 8_000));
      if (mode === 'typed') {
        await host.locator('.move-input textarea').fill('Amber Comet: I punch a glowing comet into my opponent');
        await host.getByRole('button', { name: 'LOCK MOVE', exact: true }).click();
      }
      // No typed fallback in voice mode: a failed speech path must fail the test.
      await until(async () => observed.error || await visible(host, '.charging-chip'), 45_000);
      check(`${mode}: move locks successfully`, !observed.error && await visible(host, '.charging-chip'), { elapsedMs: Date.now() - started });
      check(`${mode}: opponent sees charge`, await until(() => visible(guest, '.opponent-charging .charging-chip'), 10_000));
      const clock = (await hud(guest)).clock;
      check(`${mode}: combat clock continues while generating`, await until(async () => await visible(guest, '.opponent-charging .charging-chip') && (await hud(guest)).clock < clock, 6_000));
      await screenshot(host, `${mode}-charging`);
      await until(() => Promise.resolve(observed.error || observed.frames > 20), 120_000);
      check(`${mode}: Agora relays decoded video frames`, !observed.error && observed.frames > 20, { decodedFrames: observed.frames, elapsedMs: Date.now() - started });
      await screenshot(guest, `${mode}-remote-video`);
      check(`${mode}: same ultimate damage lands on both`, await until(() => Promise.resolve(Boolean(observed.hostImpact) && observed.hostImpact === observed.guestImpact), 25_000));
    } finally { observing = false; await monitor; }
    await finishMatch(host, guest);
    await screenshot(host, `${mode}-result`);
    await rematch(host, guest);
  });

  await step('exit confirmation and room cleanup', async () => {
    await guest.locator('.pause-button').click();
    await guest.getByRole('button', { name: 'LEAVE MATCH', exact: true }).click();
    const dialog = guest.getByRole('alertdialog', { name: 'Leave this match?' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'KEEP PLAYING', exact: true }).click();
    check('Cancelling leave keeps both players in the match', !await visible(guest, '[role="alertdialog"]') && await visible(guest, '.round-clock') && await visible(host, '.round-clock'));
    await guest.getByRole('button', { name: 'LEAVE MATCH', exact: true }).click();
    await dialog.getByRole('button', { name: 'LEAVE MATCH', exact: true }).click();
    check('Confirmed leave returns guest to title', await until(() => visible(guest, '.start-screen'), 5_000));
    check('Opponent is notified of the departure', await until(async () => /opponent left/i.test(await host.locator('body').innerText()), 20_000));
    await host.getByRole('button', { name: 'BACK TO TITLE', exact: true }).click();
    check('Both finish outside the room', await visible(host, '.start-screen') && await visible(guest, '.start-screen'));
  });
  check('No lockstep desynchronization', pages.every(({ state }) => state.desync === 0));
  check('No uncaught page errors', pages.every(({ state }) => state.pageErrors === 0));
} catch (error) {
  // Avoid persisting URLs, room codes, browser stacks, request bodies, or tokens from errors.
  if (!checks.some(check => !check.passed)) checks.push({ name: currentStep, passed: false, reason: error.name === 'TimeoutError' ? 'UI wait timed out' : 'Step failed; inspect masked screenshots' });
  console.error(`FAIL in ${currentStep}; see redacted artifacts.`);
  await Promise.allSettled(pages.map(({ page }, index) => screenshot(page, `failure-${index}`)));
} finally {
  await Promise.allSettled(browsers.map(browser => browser.close()));
  const passed = checks.length > 0 && checks.every(check => check.passed);
  await writeFile(path.join(artifactDir, 'results.json'), JSON.stringify({ passed, modes, checks, runtime: pages.map(({ state }) => state) }, null, 2));
  console.log(`${checks.filter(check => check.passed).length}/${checks.length} checks passed. Artifacts: ${path.relative(root, artifactDir)}`);
  process.exitCode = passed ? 0 : 1;
}
