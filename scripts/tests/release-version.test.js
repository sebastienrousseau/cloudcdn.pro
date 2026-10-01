import { describe, expect, it } from 'vitest';

import { nextVersion } from '../release/next-version.mjs';

describe('nextVersion', () => {
  it('increments repository iterations by 0.0.1', () => {
    expect(nextVersion('0.0.1')).toBe('0.0.2');
    expect(nextVersion('0.0.999')).toBe('0.1.0');
  });

  it('rejects incomplete or decorated versions', () => {
    expect(() => nextVersion('0.0')).toThrow('invalid version');
    expect(() => nextVersion('v0.0.1')).toThrow('invalid version');
  });
});
