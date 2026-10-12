import { signal } from '@angular/core';
import { toWav16k } from './wav-encoder';

export interface RecordedClip {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

/** Raisons d'échec du démarrage, traduites par l'écran. */
export type RecorderErrorCode = 'unsupported' | 'insecure' | 'denied' | 'unavailable';

export class RecorderError extends Error {
  constructor(readonly code: RecorderErrorCode) {
    super(code);
  }
}

/** Formats essayés dans l'ordre : webm (Chrome, Firefox, Android), ogg (Firefox), mp4 (Safari, iOS). */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];

/** Nombre de barres du visuel d'onde. */
export const WAVE_BARS = 36;

/**
 * Enregistreur du micro (MediaRecorder) avec niveau sonore en direct pour le visuel d'onde.
 * Une instance par écran : appeler {@link dispose} à la destruction pour libérer le micro.
 */
export class AudioRecorder {
  /** Derniers niveaux sonores (0 à 1), le plus récent à la fin. */
  readonly levels = signal<number[]>(new Array(WAVE_BARS).fill(0));
  /** Durée écoulée de l'enregistrement en cours, en millisecondes. */
  readonly elapsedMs = signal(0);
  readonly recording = signal(false);

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private frame = 0;
  private lastPaint = 0;
  private limitTimer: ReturnType<typeof setTimeout> | null = null;
  private finish: ((clip: RecordedClip) => void) | null = null;

  static isSupported(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /**
   * Demande le micro et démarre. `maxMs` arrête automatiquement ; le clip est alors livré par `onAutoStop`.
   * @throws RecorderError si le micro est indisponible ou refusé.
   */
  async start(maxMs: number, onAutoStop: (clip: RecordedClip) => void): Promise<void> {
    if (!AudioRecorder.isSupported()) {
      throw new RecorderError(window.isSecureContext ? 'unsupported' : 'insecure');
    }
    try {
      // Pas de suppression de bruit : pour des données d'entraînement on garde le signal brut ; le contrôle qualité
      // mesurera le bruit lui-même. L'annulation d'écho reste active (réécoute au haut-parleur).
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, noiseSuppression: false, echoCancellation: true },
      });
    } catch (error) {
      const name = (error as DOMException)?.name;
      throw new RecorderError(
        name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable',
      );
    }

    const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
    this.recorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);
    this.chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.onstop = () => {
      const durationMs = performance.now() - this.startedAt;
      const type = this.recorder?.mimeType || mimeType || 'audio/webm';
      const original: RecordedClip = { blob: new Blob(this.chunks, { type }), durationMs, mimeType: type };
      const done = this.finish;
      this.finish = null;
      this.release();
      // Conversion en WAV 16 kHz mono : le serveur peut alors mesurer l'audio (durée, niveau, saturation,
      // silence) et les données sont uniformes. Si le navigateur ne sait pas, on envoie le fichier d'origine.
      void toWav16k(original.blob).then((wav) => {
        done?.(
          wav ? { blob: wav.blob, durationMs: wav.durationMs, mimeType: 'audio/wav' } : original,
        );
      });
    };

    this.watchLevel();
    this.startedAt = performance.now();
    this.recorder.start();
    this.recording.set(true);
    this.finish = onAutoStop;
    this.limitTimer = setTimeout(() => this.recorder?.state === 'recording' && this.recorder.stop(), maxMs);
  }

  /** Arrête et renvoie le clip. */
  stop(): Promise<RecordedClip> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state !== 'recording') {
        reject(new Error('Aucun enregistrement en cours'));
        return;
      }
      this.finish = resolve;
      this.recorder.stop();
    });
  }

  /** Libère le micro sans produire de clip (changement d'écran, erreur). */
  dispose(): void {
    this.finish = null;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.release();
  }

  private release(): void {
    if (this.limitTimer) clearTimeout(this.limitTimer);
    this.limitTimer = null;
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
    this.analyser = null;
    this.recording.set(false);
    this.levels.set(new Array(WAVE_BARS).fill(0));
  }

  /** Lit le volume (RMS) environ 20 fois par seconde et le pousse dans la liste des niveaux. */
  private watchLevel(): void {
    if (!this.stream) return;
    this.context = new AudioContext();
    const source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);
    const samples = new Uint8Array(this.analyser.fftSize);

    const tick = (time: number): void => {
      if (!this.analyser) return;
      if (time - this.lastPaint >= 50) {
        this.lastPaint = time;
        this.analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        // Les voix ont un RMS faible : on amplifie pour que le visuel reste lisible
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
        this.levels.update((previous) => [...previous.slice(1), level]);
        this.elapsedMs.set(performance.now() - this.startedAt);
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
}
