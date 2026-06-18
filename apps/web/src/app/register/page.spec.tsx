import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RegisterPage from './page';

vi.mock('./actions', () => ({ register: vi.fn(async () => ({ error: null })) }));

describe('RegisterPage', () => {
  it('renders all five fields and the submit button', () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });
});
