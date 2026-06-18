import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Car, Mail, MapPin, Phone } from 'lucide-react';
import { getUser, getUserClaims } from '@/lib/api';
import { formatCurrency, formatDate, humanize, initials } from '@/lib/format';
import { StatusBadge } from '@/components/claim-badges';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default async function UserClaimsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, claims] = await Promise.all([getUser(id), getUserClaims(id)]);

  if (!user) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/">
          <ArrowLeft className="size-4" /> All policyholders
        </Link>
      </Button>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <Avatar className="size-14 text-lg">
            <AvatarFallback>{initials(user.firstName, user.lastName)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {user.firstName} {user.lastName}
            </h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3.5" /> {user.email}
              </span>
              {user.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3.5" /> {user.phone}
                </span>
              )}
              {(user.city || user.state) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />{' '}
                  {[user.addressLine1, user.city, user.state, user.postalCode]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Claims <span className="text-muted-foreground">({claims.length})</span>
        </h2>

        {claims.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-muted-foreground">
              This policyholder has no claims on file.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Incident</TableHead>
                  <TableHead className="text-right">Estimated</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => (
                  <TableRow key={claim.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/claims/${claim.id}`} className="hover:underline">
                        {claim.claimNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{humanize(claim.type)}</TableCell>
                    <TableCell>
                      {claim.vehicle ? (
                        <span className="inline-flex items-center gap-1">
                          <Car className="size-3.5 text-muted-foreground" />
                          {claim.vehicle.year} {claim.vehicle.make} {claim.vehicle.model}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{formatDate(claim.incidentDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(claim.estimatedAmount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={claim.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
