import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './src/test/msw/server';

// --- MSW lifecycle -----------------------------------------------------------
// `onUnhandledRequest: 'error'` keeps the data layer honest: any fetch that
// isn't explicitly mocked fails the test instead of silently hitting the net.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

// --- next/link ---------------------------------------------------------------
// next/link is a client component that expects the App Router context. For
// component/page tests we only care that it renders a navigable anchor, so we
// swap in a plain <a>. (E2E exercises real navigation via Playwright.)
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

// --- next/headers ------------------------------------------------------------
// next/headers — server-only cookie store. Default to "no token" so apiGet
// omits the Authorization header and MSW intercepts the same URLs as before.
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  })),
}));
