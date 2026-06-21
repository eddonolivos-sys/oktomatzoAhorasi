import { describe, it, expect } from 'vitest';
import { formatAltitude, formatHeading } from './hud-format';

describe('formatAltitude', () => {
  it('formats zero as +0 u', () => {
    expect(formatAltitude(0)).toBe('+0 u');
  });
  it('rounds to the nearest unit and keeps a + sign above the plane', () => {
    expect(formatAltitude(123.4)).toBe('+123 u');
    expect(formatAltitude(123.6)).toBe('+124 u');
  });
  it('keeps a − sign below the plane (real unicode minus)', () => {
    expect(formatAltitude(-50)).toBe('−50 u');
  });
  it('groups thousands for large altitudes', () => {
    expect(formatAltitude(12345)).toBe('+12 345 u');
    expect(formatAltitude(-12345)).toBe('−12 345 u');
  });
});

describe('formatHeading', () => {
  it('maps yaw 0 to 000', () => {
    expect(formatHeading(0)).toBe('000');
  });
  it('wraps into 0..359 and pads to 3 digits', () => {
    expect(formatHeading(Math.PI / 2)).toBe('090');
    expect(formatHeading(Math.PI)).toBe('180');
  });
  it('wraps negative yaw into the positive range', () => {
    expect(formatHeading(-Math.PI / 2)).toBe('270');
  });
  it('wraps yaw beyond 2π', () => {
    expect(formatHeading(2 * Math.PI + Math.PI / 2)).toBe('090');
  });
  it('never returns 360 (folds back to 000)', () => {
    // yaw just under a full turn rounds to 360 -> must fold to 000
    expect(formatHeading(2 * Math.PI - 0.0001)).toBe('000');
  });
});
