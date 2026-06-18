import { describe, expect, it } from 'vitest';
import { numericTransformer } from './numeric.transformer';

describe('NumericTransformer', () => {
  describe('from (DB string -> JS number)', () => {
    it('parses numeric strings to numbers', () => {
      expect(numericTransformer.from('12.50')).toBe(12.5);
      expect(numericTransformer.from('0')).toBe(0);
      expect(numericTransformer.from('1000000.99')).toBe(1000000.99);
    });

    it('passes null through unchanged', () => {
      expect(numericTransformer.from(null)).toBeNull();
    });
  });

  describe('to (JS number -> DB)', () => {
    it('passes numbers through unchanged', () => {
      expect(numericTransformer.to(42)).toBe(42);
      expect(numericTransformer.to(0)).toBe(0);
    });

    it('passes null through unchanged', () => {
      expect(numericTransformer.to(null)).toBeNull();
    });
  });
});
