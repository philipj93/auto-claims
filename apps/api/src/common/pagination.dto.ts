import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Reusable pagination query params for list endpoints: `?page=&limit=`.
 *
 * The global `ValidationPipe` runs with `transform: true`, so the incoming
 * string query values are coerced to numbers via `@Type(() => Number)` before
 * the `@IsInt` / `@Min` / `@Max` rules are checked. Both params are optional and
 * fall back to the defaults below when omitted.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 12;

  /** Rows to skip — derived from `page`/`limit` for TypeORM's `skip` option. */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
