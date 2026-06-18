import Link from 'next/link';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { getUsers } from '@/lib/api';
import { initials } from '@/lib/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function parsePage(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const { data: users, meta } = await getUsers(parsePage(page));

  const rangeStart = meta.total === 0 ? 0 : meta.limit * (meta.page - 1) + 1;
  const rangeEnd = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Policyholders</h1>
        <p className="text-muted-foreground">
          Select a policyholder to review their auto insurance claims.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => (
          <Link key={user.id} href={`/users/${user.id}`} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-accent/40">
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <Avatar>
                  <AvatarFallback>{initials(user.firstName, user.lastName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate">
                    {user.firstName} {user.lastName}
                  </CardTitle>
                  <CardDescription className="truncate">{user.email}</CardDescription>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{[user.city, user.state].filter(Boolean).join(', ') || '—'}</span>
                <Badge variant="secondary" className="gap-1">
                  <FileText className="size-3" />
                  {user.claimCount} claim{user.claimCount === 1 ? '' : 's'}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {meta.total > 0 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeStart}</span>–
            <span className="font-medium text-foreground">{rangeEnd}</span> of{' '}
            <span className="font-medium text-foreground">{meta.total}</span> policyholders
          </p>
          <div className="flex items-center gap-2">
            {meta.hasPreviousPage ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/?page=${meta.page - 1}`}>
                  <ChevronLeft className="size-4" /> Previous
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft className="size-4" /> Previous
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              Page {meta.page} of {meta.totalPages}
            </span>
            {meta.hasNextPage ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/?page=${meta.page + 1}`}>
                  Next <ChevronRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Next <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {meta.total === 0 && (
        <p className="text-muted-foreground">
          No policyholders found. Run <code>pnpm db:seed</code> to load sample data.
        </p>
      )}
    </div>
  );
}
