/**
 * Performance marks for one FastH3 ultimate, from pressing F to the hit landing. Invisible to players; read them
 * with `performance.getEntriesByType('mark')` (names start with `ult:`) to see where the wait goes.
 */
export function markUlt(step: string, detail?: Record<string, unknown>) {
  try { performance.mark(`ult:${step}`, detail ? { detail } : undefined); } catch { /* marks are diagnostics only */ }
}

export function resetUltTimeline() {
  try {
    for (const entry of performance.getEntriesByType('mark')) if (entry.name.startsWith('ult:')) performance.clearMarks(entry.name);
  } catch { /* marks are diagnostics only */ }
}

/** Measure a presented frame, rather than treating the server's clip_started event as visible playback. */
export function markFirstVideoFrame(video: HTMLVideoElement, step = 'video-first-frame') {
  if (typeof video.requestVideoFrameCallback !== 'function') return () => undefined;
  const id = video.requestVideoFrameCallback(() => markUlt(step));
  return () => video.cancelVideoFrameCallback(id);
}
