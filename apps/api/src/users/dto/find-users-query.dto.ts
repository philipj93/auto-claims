import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';

/**
 * Query params for `GET /api/users`: pagination plus an optional fuzzy `search`.
 * `search` is trimmed before validation so a whitespace-only value collapses to
 * an empty string, which the service treats as "no search".
 */
export class FindUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}
