import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Shared MSW server for Node-based (vitest) tests. */
export const server = setupServer(...handlers);
