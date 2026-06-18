import { http, HttpResponse } from 'msw';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/msw/server';
import { API_BASE } from '@/test/msw/handlers';
import { paginated, usersWithCount } from '@/test/fixtures';
import HomePage from './page';

/**
 * `HomePage` is an async Server Component: it awaits `getUsers()` (intercepted
 * by MSW) and returns markup. We render the resolved element under jsdom. The
 * page reads the `page` query from `searchParams`, which Next passes as a promise.
 */
async function renderHome(page?: string) {
  render(await HomePage({ searchParams: Promise.resolve(page ? { page } : {}) }));
}

describe('HomePage', () => {
  it('renders a card per policyholder linking to their detail page', async () => {
    await renderHome();

    const alice = screen.getByText('Alice Nguyen');
    expect(alice).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();

    // The card is wrapped in a link to /users/:id.
    const link = alice.closest('a');
    expect(link).toHaveAttribute('href', '/users/11111111-1111-1111-1111-111111111111');
  });

  it('pluralizes the claim count correctly', async () => {
    await renderHome();
    // Alice has 2 claims, Bob has 0.
    expect(screen.getByText('2 claims')).toBeInTheDocument();
    expect(screen.getByText('0 claims')).toBeInTheDocument();
  });

  it('renders a singular label for a single claim', async () => {
    server.use(
      http.get(`${API_BASE}/users`, () =>
        HttpResponse.json(
          paginated([
            {
              id: 'solo',
              firstName: 'Cara',
              lastName: 'Diaz',
              email: 'cara@example.com',
              phone: null,
              addressLine1: null,
              city: 'Austin',
              state: 'TX',
              postalCode: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              claimCount: 1,
            },
          ]),
        ),
      ),
    );

    await renderHome();
    expect(screen.getByText('1 claim')).toBeInTheDocument();
    expect(screen.getByText('Austin, TX')).toBeInTheDocument();
  });

  it('shows an empty state with seeding instructions when there are no users', async () => {
    server.use(http.get(`${API_BASE}/users`, () => HttpResponse.json(paginated([]))));

    await renderHome();
    const empty = screen.getByText(/No policyholders found/i);
    expect(empty).toBeInTheDocument();
    expect(within(empty).getByText('pnpm db:seed')).toBeInTheDocument();
  });

  it('renders page controls and reflects the requested page', async () => {
    server.use(
      http.get(`${API_BASE}/users`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        return HttpResponse.json(paginated(usersWithCount, page, 12, 30));
      }),
    );

    await renderHome('2');
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    // On page 2 of 3, both Previous and Next should link to adjacent pages.
    expect(screen.getByRole('link', { name: /Previous/i })).toHaveAttribute('href', '/?page=1');
    expect(screen.getByRole('link', { name: /Next/i })).toHaveAttribute('href', '/?page=3');
  });
});
