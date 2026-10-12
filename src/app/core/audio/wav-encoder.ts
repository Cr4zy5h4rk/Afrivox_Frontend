/** Fréquence d'échantillonnage envoyée au serveur : suffisante pour la parole et standard en reconnaissance vocale. */
export const TARGET_SAMPLE_RATE = 16_000;

/**
 * Encode des échantillons mono (valeurs de −1 à 1) en fichier WAV PCM 16 bits.
 * Sert à envoyer au serveur un format qu'il sait mesurer exactement (durée, niveau, saturation, silence) et à
 * livrer des données uniformes, quel que soit le navigateur (webm, ogg ou mp4 à l'enregistrement).
 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const text = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // taille du bloc fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // octets par seconde
  view.setUint16(32, 2, true); // octets par échantillon
  view.setUint16(34, 16, true); // bits par échantillon
  text(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    // Asymétrie voulue du PCM 16 bits : −32768 à 32767
    view.setInt16(offset, clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767), true);
  }
  return buffer;
}

export interface WavClip {
  blob: Blob;
  durationMs: number;
}

/**
 * Décode un enregistrement compressé (webm, ogg, mp4) et le convertit en WAV 16 kHz mono.
 * Renvoie `null` si le navigateur ne sait pas le faire : l'appelant envoie alors le fichier d'origine, que le
 * serveur accepte mais ne mesure pas.
 */
export async function toWav16k(blob: Blob): Promise<WavClip | null> {
  const Context = typeof AudioContext === 'undefined' ? undefined : AudioContext;
  if (!Context || typeof OfflineAudioContext === 'undefined') return null;
  const decoder = new Context();
  try {
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    if (decoded.length === 0) return null;
    const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
    // Le rendu hors ligne rééchantillonne et mélange en mono (un seul canal de sortie)
    const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    return {
      blob: new Blob([encodeWav(samples, TARGET_SAMPLE_RATE)], { type: 'audio/wav' }),
      durationMs: Math.round((samples.length * 1000) / TARGET_SAMPLE_RATE),
    };
  } catch {
    return null;
  } finally {
    void decoder.close();
  }
}
