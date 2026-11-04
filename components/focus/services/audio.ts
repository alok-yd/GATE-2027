// Web Audio API synthesized chimes for pleasant, non-jarring productivity feedback

class AudioNotificationService {
  private ctx: AudioContext | null = null;

  /**
   * Call from the Start Session click so browsers can unlock Web Audio
   * before the completion sound is needed later.
   */
  unlock(): void {
    const ctx = this.getContext();
    if (ctx?.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    // Warm the browser's available voice list while the page has user
    // interaction. The actual encouragement is spoken when the session ends.
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.getVoices();
      }
    } catch {
      // Speech synthesis is optional; the musical notification still works.
    }
  }

  private getContext(): AudioContext | null {
    try {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  playFocusRestored(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Two quick ascending chime tones: C5 (523.25) -> G5 (783.99)
    this.playTone(ctx, 523.25, now, 0.15, 'sine', 0.08);
    this.playTone(ctx, 783.99, now + 0.12, 0.25, 'sine', 0.08);
  }

  playWarning(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Single subtle mellow tone
    this.playTone(ctx, 392.00, now, 0.2, 'triangle', 0.06);
  }

  playAutoPaused(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Descending mellow tone: E4 (329.63) -> C4 (261.63)
    this.playTone(ctx, 329.63, now, 0.15, 'sine', 0.07);
    this.playTone(ctx, 261.63, now + 0.12, 0.25, 'sine', 0.07);
  }

  playTargetReached(): void {
    const ctx = this.getContext();

    if (ctx) {
      const now = ctx.currentTime;
      // Short, upbeat completion melody: C5 -> E5 -> G5 -> C6 -> G5 -> C6.
      // The overlapping soft harmony gives the completion cue a fuller,
      // musical sound without downloading or playing external media.
      const melody: Array<{ frequency: number; offset: number; duration: number }> = [
        { frequency: 523.25, offset: 0, duration: 0.22 },
        { frequency: 659.25, offset: 0.19, duration: 0.22 },
        { frequency: 783.99, offset: 0.38, duration: 0.26 },
        { frequency: 1046.50, offset: 0.60, duration: 0.38 },
        { frequency: 783.99, offset: 0.94, duration: 0.24 },
        { frequency: 1046.50, offset: 1.15, duration: 0.55 },
      ];

      melody.forEach((note, index) => {
        this.playTone(ctx, note.frequency, now + note.offset, note.duration, 'sine', 0.085);
        if (index === 2 || index === 5) {
          this.playTone(ctx, note.frequency / 2, now + note.offset, note.duration + 0.08, 'triangle', 0.025);
        }
      });
    }

    // Voice is intentionally independent of AudioContext availability.
    this.speakCompletionEncouragement();
  }

  private speakCompletionEncouragement(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      const synthesis = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance('Great Job, keep Hustling!');
      utterance.lang = 'en-IN';
      utterance.rate = 0.96;
      utterance.pitch = 1.08;
      utterance.volume = 1;

      const voices = synthesis.getVoices();
      const selectedVoice =
        voices.find((voice) => voice.lang.toLowerCase() === 'en-in') ||
        voices.find((voice) => voice.lang.toLowerCase().startsWith('en-us')) ||
        voices.find((voice) => voice.lang.toLowerCase().startsWith('en'));

      if (selectedVoice) utterance.voice = selectedVoice;

      // Let the completion melody finish before the spoken encouragement.
      window.setTimeout(() => {
        try {
          synthesis.speak(utterance);
        } catch {
          // Unsupported or unavailable speech output must not affect the timer.
        }
      }, 1850);
    } catch {
      // Speech synthesis is optional; session completion must always succeed.
    }
  }

  playBreakEnd(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.playTone(ctx, 440.00, now, 0.2, 'sine', 0.08);
    this.playTone(ctx, 554.37, now + 0.18, 0.25, 'sine', 0.08);
  }

  private playTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    maxGain: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(maxGain, startTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
}

export const soundFx = new AudioNotificationService();
