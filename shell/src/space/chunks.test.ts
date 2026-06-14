import { describe, it, expect } from 'vitest';
import { chunkKey, hashChunk, seededRng, neededChunkKeys, chunkCoord } from './layout';

describe('chunk math', () => {
  it('chunkCoord usa floor', () => {
    expect(chunkCoord(-1, 100)).toBe(-1);
    expect(chunkCoord(250, 100)).toBe(2);
    expect(chunkCoord(0, 100)).toBe(0);
  });

  it('chunkKey es estable', () => {
    expect(chunkKey(1, -2, 3)).toBe('1_-2_3');
  });

  it('hashChunk es determinista y positivo', () => {
    expect(hashChunk(1, 2, 3)).toBe(hashChunk(1, 2, 3));
    expect(hashChunk(1, 2, 3)).toBeGreaterThan(0);
    expect(hashChunk(-5, 10, -20)).toBeGreaterThan(0);
  });

  it('seededRng es determinista en [0,1)', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    for (let i = 0; i < 8; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('seededRng distinto por semilla', () => {
    expect(seededRng(1)()).not.toBe(seededRng(2)());
  });

  it('neededChunkKeys cubre (2r+1)^3 celdas', () => {
    expect(neededChunkKeys(0, 0, 0, 2).length).toBe(125);
    expect(neededChunkKeys(0, 0, 0, 1).length).toBe(27);
  });
});
