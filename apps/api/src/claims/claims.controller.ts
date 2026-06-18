import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ClaimsService } from './claims.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimStatusDto } from './dto/update-claim-status.dto';
import { QueryClaimsDto } from './dto/query-claims.dto';

@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  /** GET /api/claims?userId=&status=&type= — list claims, optionally filtered. */
  @Get()
  findAll(@Query() query: QueryClaimsDto) {
    return this.claimsService.findAll(query);
  }

  /** GET /api/claims/:id — full claim detail (user, vehicle, policy, docs, notes). */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.claimsService.findOne(id);
  }

  /** POST /api/claims — file a new claim. */
  @Post()
  create(@Body() dto: CreateClaimDto) {
    return this.claimsService.create(dto);
  }

  /** PATCH /api/claims/:id/status — advance a claim's status. */
  @Patch(':id/status')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClaimStatusDto) {
    return this.claimsService.updateStatus(id, dto);
  }
}
