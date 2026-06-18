import { http, HttpResponse } from 'msw';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw/server';
import { API_BASE } from '@/test/msw/handlers';
import { alice, aliceId } from '@/test/fixtures';
import UserClaimsPage from './page';

// notFound() throws in real Next.js to halt rendering; mirror that here so we
// can assert the not-found branch.
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

afterEach(() => vi.clearAllMocks());

function renderPage(id: string) {
  return UserClaimsPage({ params: Promise.resolve({ id }) });
}

describe('UserClaimsPage', () => {
  it('renders the policyholder header and contact details', async () => {
    render(await renderPage(aliceId));

    expect(screen.getByRole('heading', { name: 'Alice Nguyen' })).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('555-0100')).toBeInTheDocument();
    expect(screen.getByText(/San Francisco, CA/)).toBeInTheDocument();
  });

  it('lists the user’s claims in a table with links to each claim', async () => {
    render(await renderPage(aliceId));

    expect(screen.getByRole('heading', { name: /Claims/ })).toBeInTheDocument();
    const firstClaim = screen.getByRole('link', { name: 'CLM-2026-0001' });
    expect(firstClaim).toHaveAttribute('href', '/claims/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    // Humanized type + formatted vehicle + currency render in the row.
    const row = firstClaim.closest('tr')!;
    expect(within(row).getByText('Collision')).toBeInTheDocument();
    expect(within(row).getByText(/2021 Toyota Camry/)).toBeInTheDocument();
    expect(within(row).getByText('$8,200')).toBeInTheDocument();
  });

  it('shows the empty state when the user has no claims', async () => {
    server.use(
      http.get(`${API_BASE}/users/:id`, () => HttpResponse.json(alice)),
      http.get(`${API_BASE}/users/:id/claims`, () => HttpResponse.json([])),
    );

    render(await renderPage(aliceId));
    expect(screen.getByText(/no claims on file/i)).toBeInTheDocument();
  });

  it('calls notFound() when the user does not exist', async () => {
    const { notFound } = await import('next/navigation');
    await expect(renderPage('unknown-id')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
