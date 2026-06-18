import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders a <button> by default', () => {
    render(<Button>Save</Button>);
    const el = screen.getByRole('button', { name: 'Save' });
    expect(el.tagName).toBe('BUTTON');
  });

  it('fires onClick when pressed', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Click' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Nope' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies size and variant classes', () => {
    render(
      <Button variant="ghost" size="sm">
        Ghost
      </Button>,
    );
    const el = screen.getByRole('button', { name: 'Ghost' });
    expect(el).toHaveClass('h-8');
    expect(el.className).toContain('hover:bg-accent');
  });

  it('renders as its child element when asChild is set (Slot)', () => {
    render(
      <Button asChild>
        <a href="/home">Home</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link).toHaveAttribute('href', '/home');
    // The button styling is forwarded onto the anchor.
    expect(link.className).toContain('inline-flex');
  });
});
