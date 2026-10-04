/** Tiny synthesized notification sounds — no audio files to ship. */
let ctx: AudioContext | null = null;

function tone(freqs: number[], duration = 0.12, gap = 0.08, volume = 0.08) {
  try {
    ctx ??= new AudioContext();
    const start = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t0 = start + i * (duration + gap);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    });
  } catch {
    /* audio unavailable */
  }
}

export const sounds = {
  chat: () => tone([880, 1175], 0.09, 0.03),
  join: () => tone([660, 880], 0.12, 0.05),
  hand: () => tone([988, 988, 1319], 0.08, 0.05),
  leave: () => tone([660, 440], 0.12, 0.05),
};
