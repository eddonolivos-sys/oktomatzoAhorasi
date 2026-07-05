import { describe, it, expect } from 'vitest';
import { shouldWarnDesktopOnly } from './device-warning';

describe('shouldWarnDesktopOnly', () => {
  it('warns when the primary pointer is coarse and no fine pointer is available (phone/tablet)', () => {
    expect(shouldWarnDesktopOnly(true, false)).toBe(true);
  });

  it('does not warn on a normal desktop (fine primary pointer)', () => {
    expect(shouldWarnDesktopOnly(false, true)).toBe(false);
  });

  it('does not warn on a touchscreen laptop (coarse primary, but a fine pointer is also present)', () => {
    expect(shouldWarnDesktopOnly(true, true)).toBe(false);
  });

  it('does not warn when neither pointer type is reported (matchMedia unsupported)', () => {
    expect(shouldWarnDesktopOnly(false, false)).toBe(false);
  });
});
