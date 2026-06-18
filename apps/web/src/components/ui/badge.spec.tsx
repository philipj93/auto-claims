import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge, badgeVariants } from './badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Approved</Badge>);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('applies the default variant classes when none is given', () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText('Default')).toHaveClass('bg-primary');
  });

  it('applies variant-specific classes', () => {
    render(<Badge variant="destructive">Denied</Badge>);
    expect(screen.getByText('Denied')).toHaveClass('bg-destructive');
  });

  it('merges a caller-provided className', () => {
    render(<Badge className="custom-class">Tagged</Badge>);
    expect(screen.getByText('Tagged')).toHaveClass('custom-class');
  });

  it('forwards arbitrary html attributes', () => {
    render(<Badge data-testid="b">x</Badge>);
    expect(screen.getByTestId('b')).toBeInTheDocument();
  });
});

describe('badgeVariants', () => {
  it('produces distinct class strings per variant', () => {
    expect(badgeVariants({ variant: 'success' })).toContain('emerald');
    expect(badgeVariants({ variant: 'warning' })).toContain('amber');
    expect(badgeVariants({ variant: 'info' })).toContain('sky');
  });
});
