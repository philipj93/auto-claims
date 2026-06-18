import type { Paginated, PaginationMeta } from '@repo/types';

/** Build the pagination envelope from a page of rows and the total row count. */
export function paginate<T>(data: T[], total: number, page: number, limit: number): Paginated<T> {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  const meta: PaginationMeta = {
    page,
    limit,
    total,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
  return { data, meta };
}
