/**
 * +1 & +2 Planner - Multi-Sensory Audio & Haptics Engine
 * Synthesizes pure Web Audio frequencies with zero external network audio files.
 * Provides instant, ultra-low latency acoustic and tactile reinforcement.
 */

class PlannerSensoryEngine {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
    try {
      this.isMuted = localStorage.getItem('planner_sound_muted') === 'true';
    } catch {
      this.isMuted = false;
    }
  }

  /** Initialize or resume AudioContext after first user interaction */
  _ensureContext() {
    if (this.isMuted) return null;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem('planner_sound_muted', String(this.isMuted));
    } catch {
      // Storage unavailable
    }
    return this.isMuted;
  }

  getMuted() {
    return this.isMuted;
  }

  /** Subtle haptic tick for mobile devices */
  triggerHaptic(pattern = 12) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore vibration errors on unsupported hardware
    }
  }

  /** Soft tactile click for button presses and tab switches */
  playTap() {
    this.triggerHaptic(8);
    const ctx = this._ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.03);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Audio playback failed safely
    }
  }

  /** Satisfying, crisp pop when checking or unchecking a study task */
  playTaskCheck(completed = true) {
    this.triggerHaptic(completed ? [15, 20, 15] : 10);
    const ctx = this._ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (completed) {
        // Melodious two-tone success ping (E5 -> B5)
        const notes = [659.25, 987.77];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.045);
          gain.gain.setValueAtTime(0.12, now + idx * 0.045);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.14);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.045);
          osc.stop(now + idx * 0.045 + 0.15);
        });
      } else {
        // Uncheck soft descending blip
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.05);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.07);
      }
    } catch {
      // Audio failure handled safely
    }
  }

  /** Dopamine celebration chime when all tasks of the day are 100% completed */
  playCelebration() {
    this.triggerHaptic([25, 40, 25, 40, 60]);
    const ctx = this._ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Vibrant Major 9th arpeggio: C5 (523.25), E5 (659.25), G5 (783.99), B5 (987.77), C6 (1046.50)
      const arpeggio = [523.25, 659.25, 783.99, 987.77, 1046.50];
      arpeggio.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        gain.gain.setValueAtTime(0.15, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.36);
      });
    } catch {
      // Audio failure handled safely
    }
  }

  /** Celebratory streak increase sound */
  playStreakLevelUp() {
    this.triggerHaptic([20, 30, 40]);
    const ctx = this._ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [440, 554.37, 659.25, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        gain.gain.setValueAtTime(0.14, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.22);
      });
    } catch {
      // Fallback
    }
  }
}

export const sensoryEngine = new PlannerSensoryEngine();
