import { describe, expect, it } from 'vitest';
import { ClaimStatus, FaultDetermination } from '@repo/types';
import {
  faultBadgeVariant,
  formatCurrency,
  formatDate,
  formatDateTime,
  humanize,
  initials,
  statusBadgeVariant,
} from './format';

describe('formatCurrency', () => {
  it('formats numbers as whole-dollar USD', () => {
    expect(formatCurrency(8200)).toBe('$8,200');
  });

  it('rounds to the nearest dollar (no fractional digits)', () => {
    expect(formatCurrency(450.75)).toBe('$451');
  });

  it('formats zero as $0', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  it.each([null, undefined])('renders an em dash for %s', (value) => {
    expect(formatCurrency(value)).toBe('—');
  });
});

describe('formatDate', () => {
  it('formats an ISO date as "Mon D, YYYY"', () => {
    // Use a midday UTC timestamp so the local-date rendering is timezone-stable.
    expect(formatDate('2026-05-01T12:00:00.000Z')).toBe('May 1, 2026');
  });

  it.each(['', null, undefined])('renders an em dash for %p', (value) => {
    expect(formatDate(value)).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('includes both date and time parts', () => {
    const out = formatDateTime('2026-05-02T12:10:00.000Z');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  it.each(['', null, undefined])('renders an em dash for %p', (value) => {
    expect(formatDateTime(value)).toBe('—');
  });
});

describe('humanize', () => {
  it('title-cases a single token', () => {
    expect(humanize('PAID')).toBe('Paid');
  });

  it('splits SNAKE_CASE into words', () => {
    expect(humanize('UNDER_REVIEW')).toBe('Under Review');
    expect(humanize('PERSONAL_INJURY')).toBe('Personal Injury');
  });
});

describe('initials', () => {
  it('returns the uppercased first letters', () => {
    expect(initials('Alice', 'Nguyen')).toBe('AN');
  });

  it('uppercases lowercase input', () => {
    expect(initials('bob', 'smith')).toBe('BS');
  });
});

describe('statusBadgeVariant', () => {
  it.each([
    [ClaimStatus.APPROVED, 'success'],
    [ClaimStatus.PAID, 'success'],
    [ClaimStatus.DENIED, 'destructive'],
    [ClaimStatus.UNDER_REVIEW, 'info'],
    [ClaimStatus.SUBMITTED, 'info'],
    [ClaimStatus.CLOSED, 'secondary'],
  ] as const)('maps %s to the %s variant', (status, variant) => {
    expect(statusBadgeVariant(status)).toBe(variant);
  });

  it('covers every ClaimStatus enum member', () => {
    for (const status of Object.values(ClaimStatus)) {
      expect(typeof statusBadgeVariant(status)).toBe('string');
    }
  });
});

describe('faultBadgeVariant', () => {
  it.each([
    [FaultDetermination.AT_FAULT, 'destructive'],
    [FaultDetermination.NOT_AT_FAULT, 'success'],
    [FaultDetermination.PARTIAL, 'warning'],
    [FaultDetermination.UNDETERMINED, 'secondary'],
  ] as const)('maps %s to the %s variant', (fault, variant) => {
    expect(faultBadgeVariant(fault)).toBe(variant);
  });
});
