import { describe, it, expect } from 'vitest';
import { shouldSendState } from './multiplayer-math';

describe('shouldSendState', () => {
  it('permite enviar la primera vez (last = 0) si ya pasó el intervalo', () => {
    expect(shouldSendState(50, 0, 50)).toBe(true);
  });

  it('bloquea si no ha pasado el intervalo completo', () => {
    expect(shouldSendState(149, 100, 50)).toBe(false);
  });

  it('permite justo al cumplirse el intervalo (>=)', () => {
    expect(shouldSendState(150, 100, 50)).toBe(true);
  });

  it('permite muy por encima del intervalo', () => {
    expect(shouldSendState(1000, 100, 50)).toBe(true);
  });

  it('intervalo de 50ms ≈ 20Hz: a 49ms bloquea, a 50ms pasa', () => {
    expect(shouldSendState(149.9, 100, 50)).toBe(false);
    expect(shouldSendState(150.0, 100, 50)).toBe(true);
  });

  it('now anterior a last (reloj raro) no envía', () => {
    expect(shouldSendState(90, 100, 50)).toBe(false);
  });
});
