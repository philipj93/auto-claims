import { http, HttpResponse } from 'msw';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaimStatus, ClaimType, FaultDetermination, type Claim } from '@repo/types';
import { server } from '@/test/msw/server';
import { API_BASE } from '@/test/msw/handlers';
import { claim, claimId } from '@/test/fixtures';
import ClaimDetailPage from './page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

afterEach(() => vi.clearAllMocks());

function renderPage(id: string) {
  return ClaimDetailPage({ params: Promise.resolve({ id }) });
}

describe('ClaimDetailPage', () => {
  it('renders the claim header with number, status, and type', async () => {
    render(await renderPage(claimId));

    expect(screen.getByRole('heading', { name: 'CLM-2026-0001' })).toBeInTheDocument();
    expect(screen.getByText('Under Review')).toBeInTheDocument();
    expect(screen.getByText(/Collision claim/)).toBeInTheDocument();
  });

  it('links back to the claim owner’s page', async () => {
    render(await renderPage(claimId));
    const back = screen.getByRole('link', { name: /Alice Nguyen's claims/ });
    expect(back).toHaveAttribute('href', '/users/11111111-1111-1111-1111-111111111111');
  });

  it('shows the injury-reported banner when applicable', async () => {
    render(await renderPage(claimId));
    expect(screen.getByText('Injury reported')).toBeInTheDocument();
  });

  it('renders incident details including fault, adjuster, and location', async () => {
    render(await renderPage(claimId));
    expect(screen.getByText('Rear-ended at a stoplight on Main St.')).toBeInTheDocument();
    expect(screen.getByText('Not At Fault')).toBeInTheDocument();
    expect(screen.getByText('Dana Lopez')).toBeInTheDocument();
    expect(screen.getByText('Main St & 5th Ave')).toBeInTheDocument();
    expect(screen.getByText('PR-7788')).toBeInTheDocument();
  });

  it('lists documents with download links', async () => {
    render(await renderPage(claimId));
    const doc = screen.getByRole('link', { name: 'damage-front.jpg' });
    expect(doc).toHaveAttribute('href', 'https://files.example.com/doc-1');
    expect(doc).toHaveAttribute('target', '_blank');
  });

  it('renders activity notes with author', async () => {
    render(await renderPage(claimId));
    expect(screen.getByText('Opened claim and requested repair estimate.')).toBeInTheDocument();
    // The note's byline combines author + timestamp ("Dana Lopez · …").
    expect(screen.getByText(/Dana Lopez ·/)).toBeInTheDocument();
  });

  it('renders the financials, vehicle, and policy sidebars', async () => {
    render(await renderPage(claimId));

    // Estimated amount formatted as currency.
    expect(screen.getByText('$8,200')).toBeInTheDocument();
    // Vehicle card.
    expect(screen.getByText('1HGCM82633A004352')).toBeInTheDocument();
    // Policy card.
    expect(screen.getByText('POL-55512')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders fallbacks when optional relations and fields are absent', async () => {
    const sparse: Claim = {
      ...claim,
      faultDetermination: FaultDetermination.UNDETERMINED,
      type: ClaimType.THEFT,
      status: ClaimStatus.CLOSED,
      incidentLocation: null,
      policeReportNumber: null,
      adjusterName: null,
      injuryReported: false,
      user: undefined,
      vehicle: undefined,
      policy: null,
      documents: [],
      notes: [],
    };
    server.use(http.get(`${API_BASE}/claims/:id`, () => HttpResponse.json(sparse)));

    render(await renderPage(claimId));

    // No owner -> back link points home and reads "Back".
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/');
    // No injury banner.
    expect(screen.queryByText('Injury reported')).not.toBeInTheDocument();
    // Empty collections show their placeholder copy.
    expect(screen.getByText('No documents attached.')).toBeInTheDocument();
    expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument();
    // Optional vehicle/policy sidebars are omitted entirely.
    expect(screen.queryByText('Vehicle')).not.toBeInTheDocument();
    expect(screen.queryByText('Policy')).not.toBeInTheDocument();
    // Missing scalar fields render an em dash.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('calls notFound() for an unknown claim', async () => {
    const { notFound } = await import('next/navigation');
    await expect(renderPage('unknown-id')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
