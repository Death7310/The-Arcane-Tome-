// Procedural sound effects built with the Web Audio API. Nothing is sampled, so
// there are no audio files to license or download, and every sound can scale with
// spell level. Browsers only allow audio after a user gesture; every call here is
// made from a click, and the context is created lazily on the first one.

import type { ActionMotion, Element, Outcome, Shape } from './types';

type Ctx = AudioContext;

interface NoiseOpts {
  at?: number;
  dur: number;
  type?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  gain?: number;
  attack?: number;
}

interface ToneOpts {
  at?: number;
  dur: number;
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  gain?: number;
  attack?: number;
  detune?: number;
}

class SoundEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;
  private volume = 0.7;

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  private ensure(): Ctx | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private env(ctx: Ctx, at: number, dur: number, peak: number, attack = 0.01): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.min(attack, dur * 0.9));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    g.connect(this.master!);
    return g;
  }

  private n(o: NoiseOpts) {
    const ctx = this.ctx!;
    const at = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, at);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, at + o.dur);
    f.Q.value = o.q ?? 1;
    src.connect(f).connect(this.env(ctx, at, o.dur, o.gain ?? 0.5, o.attack));
    src.start(at, Math.random() * 1.5);
    src.stop(at + o.dur + 0.05);
  }

  private t(o: ToneOpts) {
    const ctx = this.ctx!;
    const at = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, at);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, at + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    osc.connect(this.env(ctx, at, o.dur, o.gain ?? 0.3, o.attack));
    osc.start(at);
    osc.stop(at + o.dur + 0.05);
  }

  /** Many tiny clicks: fire crackle, electrical sparking, sizzling. */
  private crackle(at: number, dur: number, perSecond: number, gain: number, freq = 2500) {
    const count = Math.round(dur * perSecond);
    for (let i = 0; i < count; i++) {
      this.n({ at: at + Math.random() * dur, dur: 0.012 + Math.random() * 0.03, type: 'bandpass', freq: freq * (0.6 + Math.random()), q: 3, gain: gain * (0.4 + Math.random() * 0.6), attack: 0.002 });
    }
  }

  private chimes(at: number, notes: number[], gap: number, gain: number, dur = 0.6) {
    notes.forEach((f, i) => {
      this.t({ at: at + i * gap, dur, freq: f, gain, attack: 0.005 });
      this.t({ at: at + i * gap, dur: dur * 0.7, freq: f * 2.01, gain: gain * 0.25, attack: 0.005 });
    });
  }

  /** Sound for a spell or attack. `travel` is the delay before impact in seconds. */
  element(el: Element, o: { power?: number; outcome?: Outcome; shape?: Shape; travel?: number } = {}) {
    if (!this.ensure()) return;
    const p = Math.max(0, Math.min(9, o.power ?? 1));
    const big = 1 + p * 0.12; // louder/longer for bigger slots
    const hit = o.travel ?? 0;
    const miss = o.outcome === 'miss';

    // A launch "whoosh" for anything that travels.
    if (o.shape === 'bolt' || o.shape === 'ray' || o.shape === 'cone') {
      this.n({ dur: 0.35 + hit, type: 'bandpass', freq: 500, freqEnd: 2200, q: 0.8, gain: 0.18 * big, attack: 0.05 });
    }
    if (miss) {
      this.n({ at: hit, dur: 0.5, type: 'lowpass', freq: 1200, freqEnd: 200, q: 0.7, gain: 0.15 });
      return;
    }

    switch (el) {
      case 'fire':
        this.n({ at: hit, dur: 0.9 * big, type: 'lowpass', freq: 900, freqEnd: 200, q: 0.5, gain: 0.55 * big, attack: 0.02 });
        this.n({ at: hit, dur: 0.6 * big, type: 'bandpass', freq: 1400, freqEnd: 500, q: 0.6, gain: 0.25 });
        this.crackle(hit, 1.1 * big, 35, 0.3, 3000);
        if (p >= 3) this.t({ at: hit, dur: 0.8, freq: 70, freqEnd: 35, gain: 0.5 });
        break;
      case 'cold':
        this.n({ at: hit, dur: 0.7 * big, type: 'highpass', freq: 5000, q: 0.5, gain: 0.2 });
        this.chimes(hit, [2093, 2637, 3136, 2349, 3520].slice(0, 3 + Math.min(2, p)), 0.045, 0.06, 0.5);
        this.n({ at: hit, dur: 0.18, type: 'bandpass', freq: 3000, q: 2, gain: 0.3, attack: 0.002 });
        break;
      case 'lightning':
        this.n({ at: hit, dur: 0.12, type: 'highpass', freq: 1800, q: 0.5, gain: 0.9, attack: 0.001 });
        this.crackle(hit, 0.45, 70, 0.45, 4000);
        this.n({ at: hit + 0.15, dur: 1.6 * big, type: 'lowpass', freq: 220, freqEnd: 60, q: 0.4, gain: 0.6 * big, attack: 0.08 });
        break;
      case 'thunder':
        this.n({ at: hit, dur: 1.5 * big, type: 'lowpass', freq: 260, freqEnd: 50, q: 0.6, gain: 0.9 * big, attack: 0.005 });
        this.t({ at: hit, dur: 0.9, freq: 60, freqEnd: 30, gain: 0.7 });
        this.n({ at: hit, dur: 0.08, type: 'bandpass', freq: 1200, q: 1, gain: 0.5, attack: 0.001 });
        break;
      case 'acid':
        this.n({ at: hit, dur: 0.9, type: 'highpass', freq: 3500, q: 0.7, gain: 0.25, attack: 0.02 });
        for (let i = 0; i < 10 + p * 2; i++) {
          const f = 250 + Math.random() * 700;
          this.t({ at: hit + Math.random() * 0.8, dur: 0.07, freq: f, freqEnd: f * 1.8, gain: 0.12, attack: 0.004 });
        }
        break;
      case 'poison':
        this.n({ at: hit, dur: 1.2 * big, type: 'bandpass', freq: 1800, freqEnd: 900, q: 0.8, gain: 0.25, attack: 0.15 });
        for (let i = 0; i < 6; i++) this.t({ at: hit + Math.random() * 0.9, dur: 0.12, freq: 160 + Math.random() * 200, freqEnd: 260, gain: 0.12 });
        break;
      case 'necrotic':
      case 'shadow':
        this.t({ at: hit, dur: 1.3 * big, type: 'sawtooth', freq: 73, freqEnd: 55, gain: 0.14, attack: 0.2 });
        this.t({ at: hit, dur: 1.3 * big, type: 'sawtooth', freq: 77, freqEnd: 52, gain: 0.12, attack: 0.25 });
        this.n({ at: hit, dur: 1.1, type: 'lowpass', freq: 600, freqEnd: 120, q: 1, gain: 0.35, attack: 0.3 });
        break;
      case 'radiant':
        [440, 554.37, 659.25, 880].forEach((f, i) => this.t({ at: hit + i * 0.02, dur: 1.4 * big, type: i % 2 ? 'triangle' : 'sine', freq: f, gain: 0.08, attack: 0.18 }));
        this.chimes(hit + 0.1, [1760, 2217, 2637], 0.07, 0.04, 0.8);
        break;
      case 'force':
      case 'arcane':
        this.t({ at: hit, dur: 0.35, freq: 140, freqEnd: 700, gain: 0.3, attack: 0.01 });
        this.t({ at: hit, dur: 0.35, type: 'triangle', freq: 280, freqEnd: 1400, gain: 0.12 });
        this.t({ at: hit + 0.05, dur: 0.25, freq: 90, freqEnd: 45, gain: 0.4 });
        if (el === 'arcane') this.chimes(hit + 0.1, [1318, 1568, 1976], 0.05, 0.05);
        break;
      case 'psychic': {
        const ctx = this.ctx!;
        const at = ctx.currentTime + hit;
        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        osc.frequency.value = 520;
        lfo.frequency.value = 7;
        depth.gain.value = 90;
        lfo.connect(depth).connect(osc.frequency);
        osc.connect(this.env(ctx, at, 0.9 * big, 0.2, 0.1));
        osc.start(at);
        lfo.start(at);
        osc.stop(at + 1.2 * big);
        lfo.stop(at + 1.2 * big);
        this.t({ at: hit, dur: 0.9, freq: 1040, freqEnd: 1300, gain: 0.05, detune: 30 });
        break;
      }
      case 'slashing':
        this.n({ dur: 0.2, type: 'bandpass', freq: 900, freqEnd: 3500, q: 1.2, gain: 0.5, attack: 0.02 });
        this.t({ at: 0.12, dur: 0.35, type: 'triangle', freq: 2400, gain: 0.07 });
        this.t({ at: 0.12, dur: 0.3, type: 'sine', freq: 3620, gain: 0.04 });
        break;
      case 'piercing':
        this.n({ dur: 0.12, type: 'bandpass', freq: 1500, freqEnd: 4000, q: 1.5, gain: 0.4, attack: 0.01 });
        this.t({ at: hit + 0.1, dur: 0.12, freq: 220, freqEnd: 80, gain: 0.5 });
        break;
      case 'bludgeoning':
        this.t({ at: hit, dur: 0.28, freq: 130, freqEnd: 45, gain: 0.8 });
        this.n({ at: hit, dur: 0.18, type: 'lowpass', freq: 500, q: 0.7, gain: 0.6, attack: 0.002 });
        break;
      case 'healing':
        this.chimes(hit, [523.25, 659.25, 783.99, 1046.5, 1318.5].slice(0, 4 + (p > 2 ? 1 : 0)), 0.08, 0.09, 0.9);
        this.n({ at: hit, dur: 1, type: 'highpass', freq: 6000, q: 0.5, gain: 0.05, attack: 0.3 });
        break;
      case 'nature':
        for (let i = 0; i < 8; i++) this.n({ at: hit + i * 0.07, dur: 0.12, type: 'bandpass', freq: 2500 + Math.random() * 2000, q: 1, gain: 0.12 });
        this.t({ at: hit, dur: 0.15, type: 'triangle', freq: 330, freqEnd: 220, gain: 0.25 });
        break;
    }
    if (o.outcome === 'crit') this.chimes(hit + 0.05, [1318.5, 1760, 2637], 0.06, 0.1, 0.7);
  }

  dice(count = 1) {
    if (!this.ensure()) return;
    const clicks = Math.min(14, 4 + count * 2);
    for (let i = 0; i < clicks; i++) {
      const at = Math.pow(i / clicks, 1.4) * 0.45;
      this.n({ at, dur: 0.018, type: 'bandpass', freq: 2200 + Math.random() * 2500, q: 4, gain: 0.35 * (1 - i / (clicks * 1.4)), attack: 0.001 });
    }
  }

  natural(kind: 'nat20' | 'nat1') {
    if (!this.ensure()) return;
    if (kind === 'nat20') this.chimes(0.45, [1046.5, 1318.5, 1568, 2093], 0.06, 0.1, 0.9);
    else this.t({ at: 0.45, dur: 0.7, type: 'triangle', freq: 220, freqEnd: 110, gain: 0.25 });
  }

  action(m: ActionMotion) {
    if (!this.ensure()) return;
    switch (m) {
      case 'move':
        for (let i = 0; i < 4; i++) {
          this.n({ at: i * 0.22, dur: 0.09, type: 'lowpass', freq: 420, q: 0.8, gain: 0.5, attack: 0.004 });
          this.n({ at: i * 0.22 + 0.02, dur: 0.05, type: 'bandpass', freq: 2500, q: 2, gain: 0.06 });
        }
        break;
      case 'dash':
        this.n({ dur: 0.8, type: 'bandpass', freq: 300, freqEnd: 1600, q: 0.7, gain: 0.4, attack: 0.2 });
        break;
      case 'dodge':
      case 'disengage':
        this.n({ dur: 0.25, type: 'bandpass', freq: 700, freqEnd: 2600, q: 1, gain: 0.35, attack: 0.02 });
        this.chimes(0.1, [1568, 1976], 0.05, 0.05, 0.4);
        break;
      case 'hide':
        this.n({ dur: 0.6, type: 'lowpass', freq: 900, freqEnd: 200, q: 0.5, gain: 0.4, attack: 0.03 });
        break;
      case 'help':
        this.chimes(0, [784, 988, 1175], 0.07, 0.08, 0.6);
        break;
      case 'search':
        this.t({ dur: 0.5, freq: 600, freqEnd: 1200, gain: 0.1, attack: 0.05 });
        this.t({ at: 0.25, dur: 0.4, freq: 900, freqEnd: 1600, gain: 0.08, attack: 0.05 });
        break;
      default:
        this.chimes(0, [880, 1318.5], 0.06, 0.06, 0.4);
    }
  }

  hurt(amount: number) {
    if (!this.ensure()) return;
    const big = Math.min(2, 1 + amount / 30);
    this.t({ dur: 0.3 * big, freq: 110, freqEnd: 50, gain: 0.7 });
    this.n({ dur: 0.2, type: 'lowpass', freq: 700, q: 0.7, gain: 0.5, attack: 0.002 });
  }

  click() {
    if (!this.ensure()) return;
    this.n({ dur: 0.03, type: 'bandpass', freq: 1800, q: 3, gain: 0.15, attack: 0.002 });
  }
}

export const sound = new SoundEngine();
