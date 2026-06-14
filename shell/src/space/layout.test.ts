import { describe, it, expect } from 'vitest';
import { sectorOf } from './layout';

describe('sectorOf', () => {
  it('mapea origen a 0:0', () => {
    expect(sectorOf(0, 0)).toEqual({ sx: 0, sz: 0 });
  });
  it('mapea negativos con floor', () => {
    expect(sectorOf(-10, -60)).toEqual({ sx: -1, sz: -2 });
  });
  it('respeta el tamaño', () => {
    expect(sectorOf(120, 0, 50)).toEqual({ sx: 2, sz: 0 });
  });
});
