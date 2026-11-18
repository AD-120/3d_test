/**
 * 100% procedural Web Audio soundscape:
 * - Soft highland wind (filtered noise)
 * - Subtle harmonic resonance that warms near the monolith
 * - Crisp gravel footstep clicks synced to movement
 */
export class TourSoundscape {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private enabled = false;
  private stepAccumulator = 0;

  public setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      this.ensureInitialized();
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(0.28, this.ctx.currentTime, 0.25);
      }
    } else if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.18);
    }
  }

  private ensureInitialized(): void {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.masterGain = master;

    // Pink-ish noise buffer for wind & footsteps
    const bufferSize = ctx.sampleRate * 3;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }

    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 1.6;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.22;

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();

    this.windFilter = windFilter;
    this.windGain = windGain;

    // Subtle stone monolith harmonic hum (pure fifth sine pair)
    const droneOsc1 = ctx.createOscillator();
    droneOsc1.type = 'sine';
    droneOsc1.frequency.value = 110;

    const droneOsc2 = ctx.createOscillator();
    droneOsc2.type = 'triangle';
    droneOsc2.frequency.value = 164.81;

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 260;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.04;

    droneOsc1.connect(droneFilter);
    droneOsc2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(master);
    droneOsc1.start();
    droneOsc2.start();
    this.droneGain = droneGain;
  }

  public update(delta: number, speed: number, distanceToMonolith: number, elapsed: number): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    if (this.windFilter && this.windGain) {
      const gust = Math.sin(elapsed * 0.35) * 90 + Math.cos(elapsed * 0.19) * 50;
      this.windFilter.frequency.setTargetAtTime(320 + gust + speed * 25, now, 0.2);
      this.windGain.gain.setTargetAtTime(0.18 + Math.sin(elapsed * 0.4) * 0.05, now, 0.2);
    }

    if (this.droneGain) {
      // Gently swell resonant hum as explorer approaches within 10m of the monolith
      const proximity = Math.max(0, 1 - (distanceToMonolith - 3.0) / 11.0);
      this.droneGain.gain.setTargetAtTime(0.025 + proximity * 0.11, now, 0.25);
    }

    if (speed > 0.65) {
      this.stepAccumulator += delta * speed;
      if (this.stepAccumulator > 2.2) {
        this.stepAccumulator = 0;
        this.triggerFootstep();
      }
    } else {
      this.stepAccumulator = 1.4;
    }
  }

  private triggerFootstep(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115 + Math.random() * 25, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.075);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
