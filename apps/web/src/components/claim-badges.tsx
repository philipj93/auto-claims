import type { ClaimStatus, FaultDetermination } from '@repo/types';
import { Badge } from '@/components/ui/badge';
import { faultBadgeVariant, humanize, statusBadgeVariant } from '@/lib/format';

export function StatusBadge({ status }: { status: ClaimStatus }) {
  return <Badge variant={statusBadgeVariant(status)}>{humanize(status)}</Badge>;
}

export function FaultBadge({ fault }: { fault: FaultDetermination }) {
  return <Badge variant={faultBadgeVariant(fault)}>{humanize(fault)}</Badge>;
}
