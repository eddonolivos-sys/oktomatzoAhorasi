import { describe, it, expect } from 'vitest';
import { dwellStep, type DwellState } from './dwell';

const fresh = (): DwellState => ({ inside: false, elapsed: 0 });

describe('dwellStep', () => {
  it('acumula tiempo mientras se está dentro', () => {
    let s = fresh();
    let r = dwellStep(s, true, 0.3, 1);
    expect(r.state.inside).toBe(true);
    expect(r.state.elapsed).toBeCloseTo(0.3, 6);
    expect(r.entered).toBe(false);

    r = dwellStep(r.state, true, 0.3, 1);
    expect(r.state.elapsed).toBeCloseTo(0.6, 6);
    expect(r.entered).toBe(false);
  });

  it('progress es elapsed/threshold acotado a [0,1]', () => {
    let r = dwellStep(fresh(), true, 0.5, 1);
    expect(r.progress).toBeCloseTo(0.5, 6);
    r = dwellStep(r.state, true, 0.9, 1); // 1.4s sobre umbral 1 → progress clamp 1
    expect(r.progress).toBe(1);
  });

  it('emite entered una sola vez al cruzar el umbral', () => {
    let r = dwellStep(fresh(), true, 0.6, 1);
    expect(r.entered).toBe(false);
    r = dwellStep(r.state, true, 0.6, 1); // 1.2s → cruza umbral
    expect(r.entered).toBe(true);
    // Siguiendo dentro: NO vuelve a emitir entered (latch hasta salir).
    r = dwellStep(r.state, true, 0.6, 1);
    expect(r.entered).toBe(false);
  });

  it('reinicia el timer al salir de la esfera', () => {
    let r = dwellStep(fresh(), true, 0.7, 1);
    expect(r.state.elapsed).toBeCloseTo(0.7, 6);
    r = dwellStep(r.state, false, 0.5, 1); // sale
    expect(r.state.inside).toBe(false);
    expect(r.state.elapsed).toBe(0);
    expect(r.progress).toBe(0);
    expect(r.entered).toBe(false);
  });

  it('cancela una entrada en curso si sale antes del umbral', () => {
    let r = dwellStep(fresh(), true, 0.9, 1);
    r = dwellStep(r.state, false, 0.1, 1); // sale a 0.9s → cancela
    expect(r.entered).toBe(false);
    expect(r.state.elapsed).toBe(0);
    // Vuelve a entrar: empieza de cero, debe re-armar y poder entrar de nuevo.
    r = dwellStep(r.state, true, 0.6, 1);
    r = dwellStep(r.state, true, 0.6, 1);
    expect(r.entered).toBe(true);
  });

  it('no entra si nunca se acumula tiempo dentro', () => {
    const r = dwellStep(fresh(), false, 0.3, 1);
    expect(r.entered).toBe(false);
    expect(r.progress).toBe(0);
  });
});
