import { store } from './utils.js';

// Tiny synthesised sound effects so the game ships without audio assets.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = store.get('hc_mute') === '1';
  }

  // Browsers only allow audio after a user gesture.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggle() {
    this.muted = !this.muted;
    store.set('hc_mute', this.muted ? '1' : '0');
    return this.muted;
  }

  tone(freq, dur, { type = 'sine', vol = 0.14, to = freq, delay = 0 } = {}) {
    const ac = this.ctx, t0 = ac.currentTime + delay;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, { vol = 0.12, freq = 1800, delay = 0 } = {}) {
    const ac = this.ctx, t0 = ac.currentTime + delay;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(), filt = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf;
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    g.gain.value = vol;
    src.connect(filt).connect(g).connect(ac.destination);
    src.start(t0);
  }

  play(name) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'shoot': this.noise(0.12, { freq: 2600 }); this.tone(520, 0.16, { type: 'triangle', to: 180 }); break;
      case 'bounce': this.tone(300, 0.07, { type: 'triangle', to: 220, vol: 0.1 }); break;
      case 'hit': this.tone(660, 0.08, { type: 'square', to: 420, vol: 0.07 }); this.tone(990, 0.12, { delay: 0.05, vol: 0.09 }); break;
      case 'die': this.tone(420, 0.2, { type: 'square', to: 110, vol: 0.07 }); this.tone(1320, 0.14, { delay: 0.06, vol: 0.09 }); break;
      case 'place': this.tone(200, 0.12, { type: 'triangle', to: 340, vol: 0.16 }); this.noise(0.06, { freq: 500, vol: 0.1 }); break;
      case 'sword': this.noise(0.09, { freq: 3800, vol: 0.1 }); break;
      case 'bow': this.tone(760, 0.09, { type: 'triangle', to: 380, vol: 0.08 }); break;
      case 'thud': this.tone(160, 0.12, { type: 'square', to: 80, vol: 0.07 }); break;
      case 'castle': this.tone(120, 0.3, { type: 'sawtooth', to: 50, vol: 0.16 }); this.noise(0.22, { freq: 300, vol: 0.2 }); break;
      case 'capture': this.tone(660, 0.1, { vol: 0.1 }); this.tone(880, 0.16, { delay: 0.09, vol: 0.1 }); break;
      case 'turn': this.tone(520, 0.1, { vol: 0.07 }); this.tone(780, 0.16, { delay: 0.08, vol: 0.07 }); break;
      case 'click': this.tone(600, 0.05, { type: 'triangle', vol: 0.08 }); break;
      case 'error': this.tone(170, 0.14, { type: 'square', vol: 0.06 }); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.26, { delay: i * 0.13, type: 'triangle', vol: 0.14 })); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, { delay: i * 0.16, type: 'triangle', vol: 0.14 })); break;
    }
  }
}
