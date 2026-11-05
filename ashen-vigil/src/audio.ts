// Procedural sound effects (Web Audio), shared by combat, loot and inventory.
// --- sound (Web Audio, procedural; starts after the first input) --------
export class Sfx {
  ctx: AudioContext | null = null;
  out: GainNode | null = null;
  muted = false;
  noise: AudioBuffer | null = null;
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 0.5;
    this.out.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  toggle() {
    this.muted = !this.muted;
    if (this.out) this.out.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private burst(type: BiquadFilterType, f0: number, f1: number, dur: number, peak: number) {
    if (!this.ctx || !this.out || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = 1.2;
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, peak, dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0) {
    if (!this.ctx || !this.out) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.005, peak, dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  swing() { this.burst('bandpass', 900, 2600, 0.16, 0.35); }
  hit() { this.tone('sine', 140, 55, 0.12, 0.8); this.burst('lowpass', 2200, 300, 0.09, 0.5); }
  crit() { this.hit(); this.tone('triangle', 1400, 900, 0.18, 0.25, 0.01); }
  death() { this.burst('lowpass', 1200, 80, 0.7, 0.5); this.tone('sawtooth', 110, 40, 0.5, 0.15); }
  hurt() { this.tone('square', 220, 90, 0.14, 0.18); this.burst('lowpass', 900, 200, 0.12, 0.35); }
  // items and progression
  drop() { this.tone('triangle', 520, 260, 0.12, 0.2); this.burst('lowpass', 1500, 400, 0.08, 0.2); }
  dropRare() { [660, 880, 1320].forEach((f, i) => this.tone('sine', f, f * 1.01, 0.5, 0.18, i * 0.07)); }
  pickup() { this.tone('triangle', 400, 700, 0.07, 0.25); }
  equip() { this.burst('bandpass', 600, 300, 0.12, 0.4); this.tone('square', 180, 120, 0.08, 0.12); }
  gold() { [1800, 2400].forEach((f, i) => this.tone('sine', f, f, 0.09, 0.14, i * 0.05)); }
  levelUp() { [392, 523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.35, 0.22, i * 0.09)); }
  // skills (M2-b)
  denied() { this.tone('square', 160, 120, 0.08, 0.12); }
  slashSkill() { this.burst('bandpass', 700, 3200, 0.2, 0.45); this.tone('sawtooth', 300, 120, 0.15, 0.08); }
  whirl() { this.burst('bandpass', 500, 2400, 0.55, 0.35); }
  charge() { this.burst('lowpass', 400, 2000, 0.3, 0.5); this.tone('sawtooth', 90, 180, 0.3, 0.12); }
  emberCast() { this.tone('triangle', 900, 1400, 0.1, 0.15); this.burst('highpass', 3000, 6000, 0.08, 0.15); }
  explode() { this.burst('lowpass', 1800, 120, 0.35, 0.55); this.tone('sine', 120, 50, 0.25, 0.4); }
  ring() { this.burst('bandpass', 300, 1600, 0.6, 0.45); this.tone('sawtooth', 80, 160, 0.5, 0.1); }
  purge() { this.burst('lowpass', 600, 2500, 0.9, 0.4); this.tone('sawtooth', 70, 110, 0.8, 0.1); }
  armor() { this.burst('bandpass', 2000, 500, 0.6, 0.3); this.tone('sine', 220, 330, 0.5, 0.15); }
  dread() { this.tone('sawtooth', 110, 55, 0.9, 0.2); this.burst('lowpass', 500, 80, 0.9, 0.35); }
  vigil() { [196, 262, 392, 523].forEach((f, i) => this.tone('triangle', f, f, 0.6, 0.25, i * 0.06)); this.burst('lowpass', 2500, 100, 0.8, 0.6); }
  potion() { this.tone('sine', 300, 600, 0.18, 0.2); this.burst('bandpass', 800, 1200, 0.15, 0.15); }
}

/** One shared instance; starts on the first user input (browsers require a gesture). */
export const sfx = new Sfx();
const unlock = () => sfx.start();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

