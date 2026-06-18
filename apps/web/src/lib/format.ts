import { ClaimStatus, FaultDetermination } from '@repo/types';
import type { BadgeProps } from '@/components/ui/badge';

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Turn an ENUM_VALUE into "Enum Value" for display. */
export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

type BadgeVariant = NonNullable<BadgeProps['variant']>;

export function statusBadgeVariant(status: ClaimStatus): BadgeVariant {
  switch (status) {
    case ClaimStatus.APPROVED:
    case ClaimStatus.PAID:
      return 'success';
    case ClaimStatus.DENIED:
      return 'destructive';
    case ClaimStatus.UNDER_REVIEW:
    case ClaimStatus.SUBMITTED:
      return 'info';
    case ClaimStatus.CLOSED:
      return 'secondary';
    default:
      return 'secondary';
  }
}

export function faultBadgeVariant(fault: FaultDetermination): BadgeVariant {
  switch (fault) {
    case FaultDetermination.AT_FAULT:
      return 'destructive';
    case FaultDetermination.NOT_AT_FAULT:
      return 'success';
    case FaultDetermination.PARTIAL:
      return 'warning';
    default:
      return 'secondary';
  }
}
