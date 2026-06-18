import { vi } from 'vitest';
import type { Repository } from 'typeorm';

/**
 * A TypeORM `Repository` with every method replaced by a vitest mock fn.
 * Use `Partial`-friendly typing so specs only configure the methods they touch.
 */
export type MockRepository<T extends object = any> = Partial<
  Record<keyof Repository<T>, ReturnType<typeof vi.fn>>
> & {
  createQueryBuilder: ReturnType<typeof vi.fn>;
};

/** Builds a fresh mock repository. Each call returns independent mock fns. */
export function createMockRepository<
  T extends object = any,
>(): MockRepository<T> {
  return {
    find: vi.fn(),
    findAndCount: vi.fn(),
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    save: vi.fn(),
    // `create` is synchronous in TypeORM and commonly just merges its input.
    create: vi.fn((dto) => dto),
    merge: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createQueryBuilder: vi.fn(),
  };
}

/**
 * A chainable mock of TypeORM's `SelectQueryBuilder`. Every builder method
 * returns the same object, and `getRawMany`/`getMany` resolve to the value you
 * pass in, so services that build queries fluently can be tested without a DB.
 */
export function createMockQueryBuilder(result: {
  raw?: unknown;
  entities?: unknown;
  count?: number;
}) {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orWhere',
    'setParameters',
    'groupBy',
    'orderBy',
    'addOrderBy',
    'offset',
    'limit',
    'leftJoinAndSelect',
    'innerJoin',
  ];
  for (const method of chain) {
    qb[method] = vi.fn(() => qb);
  }
  qb.getRawMany = vi.fn(async () => result.raw ?? []);
  qb.getMany = vi.fn(async () => result.entities ?? []);
  qb.getOne = vi.fn(async () => (result.entities as unknown[])?.[0] ?? null);
  qb.getManyAndCount = vi.fn(async () => [
    (result.entities as unknown[]) ?? [],
    result.count ?? (result.entities as unknown[])?.length ?? 0,
  ]);
  return qb;
}
