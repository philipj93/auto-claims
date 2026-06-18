import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok with an ISO timestamp', () => {
    const before = Date.now();
    const result = new HealthController().check();

    expect(result.status).toBe('ok');
    const ts = Date.parse(result.timestamp);
    expect(Number.isNaN(ts)).toBe(false);
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
  });
});
