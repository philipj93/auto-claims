import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { FindUsersQueryDto } from './dto/find-users-query.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /api/users?page=&limit=&search= — a page of users, each with a claim count. */
  @Get()
  findAll(@Query() query: FindUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  /** GET /api/users/:id — a single user with vehicles and policies. */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  /** GET /api/users/:id/claims — all claims belonging to a user. */
  @Get(':id/claims')
  findClaims(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findClaims(id);
  }
}
