/** Limites alignées sur le serveur (PromptDTO : 500 caractères par phrase). */
export const MAX_SENTENCE_LENGTH = 500;
/** Au-delà, on découpe en plusieurs envois : évite de saturer l'API et de perdre le fil des échecs. */
export const MAX_SENTENCES_PER_BATCH = 1000;

export interface ParsedSentences {
  /** Phrases prêtes à envoyer (sans lignes vides, sans doublons, longueur correcte). */
  valid: string[];
  /** Lignes ignorées car déjà présentes plus haut dans la liste (casse ignorée). */
  duplicates: number;
  /** Lignes ignorées car plus longues que la limite. */
  tooLong: number;
}

/** Analyse un texte « une phrase par ligne » et sépare ce qui est envoyable de ce qui sera ignoré. */
export function parseSentences(text: string): ParsedSentences {
  const seen = new Set<string>();
  const valid: string[] = [];
  let duplicates = 0;
  let tooLong = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.length > MAX_SENTENCE_LENGTH) {
      tooLong++;
      continue;
    }
    const key = line.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    valid.push(line);
  }
  return { valid, duplicates, tooLong };
}
