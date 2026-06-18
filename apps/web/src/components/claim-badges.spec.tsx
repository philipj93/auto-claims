import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClaimStatus, FaultDetermination } from '@repo/types';
import { FaultBadge, StatusBadge } from './claim-badges';

describe('StatusBadge', () => {
  it('humanizes the status label', () => {
    render(<StatusBadge status={ClaimStatus.UNDER_REVIEW} />);
    expect(screen.getByText('Under Review')).toBeInTheDocument();
  });

  it('uses the success variant for approved claims', () => {
    render(<StatusBadge status={ClaimStatus.APPROVED} />);
    expect(screen.getByText('Approved')).toHaveClass('bg-emerald-100');
  });

  it('uses the destructive variant for denied claims', () => {
    render(<StatusBadge status={ClaimStatus.DENIED} />);
    expect(screen.getByText('Denied')).toHaveClass('bg-destructive');
  });
});

describe('FaultBadge', () => {
  it('humanizes the fault label', () => {
    render(<FaultBadge fault={FaultDetermination.NOT_AT_FAULT} />);
    expect(screen.getByText('Not At Fault')).toBeInTheDocument();
  });

  it('uses the destructive variant when at fault', () => {
    render(<FaultBadge fault={FaultDetermination.AT_FAULT} />);
    expect(screen.getByText('At Fault')).toHaveClass('bg-destructive');
  });

  it('uses the warning variant for partial fault', () => {
    render(<FaultBadge fault={FaultDetermination.PARTIAL} />);
    expect(screen.getByText('Partial')).toHaveClass('bg-amber-100');
  });
});
