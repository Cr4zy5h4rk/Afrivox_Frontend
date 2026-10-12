import { describe, expect, it } from 'vitest';
import { TARGET_SAMPLE_RATE, encodeWav } from './wav-encoder';

function ascii(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
}

describe('encodeWav', () => {
  it('écrit un en-tête WAV PCM 16 bits mono valide', () => {
    const view = new DataView(encodeWav(new Float32Array(100), TARGET_SAMPLE_RATE));

    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(28, true)).toBe(32_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(200);
    expect(view.getUint32(4, true)).toBe(36 + 200);
    expect(view.byteLength).toBe(44 + 200);
  });

  it('convertit les échantillons et plafonne ce qui dépasse', () => {
    const view = new DataView(encodeWav(Float32Array.from([0, 0.5, -0.5, 1, -1, 2, -2]), 16_000));
    const at = (i: number): number => view.getInt16(44 + i * 2, true);

    expect(at(0)).toBe(0);
    expect(at(1)).toBe(16384);
    expect(at(2)).toBe(-16384);
    expect(at(3)).toBe(32767);
    expect(at(4)).toBe(-32768);
    expect(at(5)).toBe(32767); // dépassement : écrêté, jamais « enroulé »
    expect(at(6)).toBe(-32768);
  });

  it('gère un enregistrement vide', () => {
    const view = new DataView(encodeWav(new Float32Array(0), 16_000));

    expect(view.byteLength).toBe(44);
    expect(view.getUint32(40, true)).toBe(0);
  });
});
