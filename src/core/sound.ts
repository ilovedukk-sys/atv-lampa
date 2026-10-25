/**
 * Звуки навигации в духе tvOS: тихий щелчок при перемещении, клик при выборе,
 * глухой «тук» при упоре в край. Синтезируются на лету (Web Audio) — без звуковых файлов.
 * Включаются/выключаются ЖЁЛТОЙ кнопкой пульта (на компьютере — F3), выбор запоминается.
 */

type AudioCtx = AudioContext;

let ctx: AudioCtx | null = null;
let enabled = true;
try {
  enabled = localStorage.getItem('sounds') !== '0';
} catch (e) {
  /* по умолчанию включены */
}

function audio(): AudioCtx | null {
  if (!ctx) {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor() as AudioCtx;
  }
  return ctx;
}

/** Короткий тон с быстрым затуханием. */
function tone(freq: number, duration: number, volume: number, type: OscillatorType = 'sine', drop = 0.6) {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * drop, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(a.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export const sound = {
  move: () => tone(2400, 0.025, 0.035),
  select: () => tone(1100, 0.07, 0.07, 'sine', 0.5),
  back: () => tone(700, 0.06, 0.05, 'sine', 0.8),
  bump: () => tone(160, 0.09, 0.12, 'triangle', 0.7),
};

export function soundsEnabled() {
  return enabled;
}

export function toggleSounds() {
  enabled = !enabled;
  try {
    localStorage.setItem('sounds', enabled ? '1' : '0');
  } catch (e) {
    /* без запоминания */
  }
  if (enabled) sound.select();
  return enabled;
}
