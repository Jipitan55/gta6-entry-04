// Small WebAudio sound effects, synthesized — no audio files. Everything is
// created lazily on the first user gesture so browsers allow it.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.sirenNodes = null;
    this.engineNodes = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol, filterFreq) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  shot() {
    this.noise(0.14, 0.5, 2600);
    this.blip(160, 0.09, 'square', 0.22, 55);
  }

  punch() {
    this.noise(0.1, 0.35, 500);
  }

  pickup() {
    this.blip(660, 0.09, 'sine', 0.25);
    setTimeout(() => this.blip(990, 0.12, 'sine', 0.25), 70);
  }

  cash() {
    this.blip(880, 0.08, 'triangle', 0.22);
    setTimeout(() => this.blip(1320, 0.14, 'triangle', 0.22), 80);
  }

  missionComplete() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.28), i * 110));
  }

  busted() {
    this.blip(392, 0.3, 'sawtooth', 0.2, 196);
    setTimeout(() => this.blip(311, 0.5, 'sawtooth', 0.2, 155), 260);
  }

  carDoor() {
    this.noise(0.08, 0.25, 900);
    this.blip(120, 0.08, 'square', 0.15, 70);
  }

  startSiren() {
    if (!this.ensure() || this.sirenNodes) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 750;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 1.4;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    lfo.start();
    this.sirenNodes = { osc, lfo, gain };
  }

  stopSiren() {
    if (!this.sirenNodes) return;
    try {
      this.sirenNodes.osc.stop();
      this.sirenNodes.lfo.stop();
    } catch {
      // already stopped
    }
    this.sirenNodes = null;
  }

  startEngine() {
    if (!this.ensure() || this.engineNodes) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.engineNodes = { osc, gain };
  }

  setEngine(speedNorm) {
    if (!this.engineNodes) return;
    const t = this.ctx.currentTime;
    this.engineNodes.osc.frequency.setTargetAtTime(55 + speedNorm * 130, t, 0.08);
    this.engineNodes.gain.gain.setTargetAtTime(0.05 + speedNorm * 0.05, t, 0.1);
  }

  stopEngine() {
    if (!this.engineNodes) return;
    try {
      this.engineNodes.osc.stop();
    } catch {
      // already stopped
    }
    this.engineNodes = null;
  }
}
