import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Car, FileText, MapPin, ShieldCheck, TriangleAlert } from 'lucide-react';
import { getClaim } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, humanize } from '@/lib/format';
import { FaultBadge, StatusBadge } from '@/components/claim-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claim = await getClaim(id);

  if (!claim) {
    notFound();
  }

  const backHref = claim.user ? `/users/${claim.user.id}` : '/';

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={backHref}>
          <ArrowLeft className="size-4" />
          {claim.user ? `${claim.user.firstName} ${claim.user.lastName}'s claims` : 'Back'}
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{claim.claimNumber}</h1>
            <StatusBadge status={claim.status} />
          </div>
          <p className="mt-1 text-muted-foreground">
            {humanize(claim.type)} claim · reported {formatDate(claim.reportedDate)}
          </p>
        </div>
        {claim.injuryReported && (
          <Badge variant="warning" className="gap-1">
            <TriangleAlert className="size-3" /> Injury reported
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Incident details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed">{claim.description}</p>
              <Separator />
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Incident date" value={formatDate(claim.incidentDate)} />
                <Field label="Reported date" value={formatDate(claim.reportedDate)} />
                <Field label="Type" value={humanize(claim.type)} />
                <Field label="Fault" value={<FaultBadge fault={claim.faultDetermination} />} />
                <Field label="Police report" value={claim.policeReportNumber ?? '—'} />
                <Field label="Adjuster" value={claim.adjusterName ?? '—'} />
                <Field
                  label="Location"
                  value={
                    claim.incidentLocation ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5 text-muted-foreground" />
                        {claim.incidentLocation}
                      </span>
                    ) : (
                      '—'
                    )
                  }
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" /> Documents
                <span className="text-muted-foreground">({claim.documents?.length ?? 0})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {claim.documents && claim.documents.length > 0 ? (
                <ul className="divide-y">
                  {claim.documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <span className="inline-flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" />
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline"
                        >
                          {doc.fileName}
                        </a>
                      </span>
                      <Badge variant="outline">{humanize(doc.type)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No documents attached.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity &amp; notes</CardTitle>
            </CardHeader>
            <CardContent>
              {claim.notes && claim.notes.length > 0 ? (
                <ol className="space-y-4">
                  {claim.notes.map((note) => (
                    <li key={note.id} className="flex gap-3">
                      <div className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                      <div className="space-y-0.5">
                        <p className="text-sm">{note.body}</p>
                        <p className="text-xs text-muted-foreground">
                          {note.author} · {formatDateTime(note.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Financials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimated</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(claim.estimatedAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(claim.approvedAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deductible</span>
                <span className="font-medium tabular-nums">{formatCurrency(claim.deductible)}</span>
              </div>
            </CardContent>
          </Card>

          {claim.vehicle && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Car className="size-4" /> Vehicle
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="font-medium">
                  {claim.vehicle.year} {claim.vehicle.make} {claim.vehicle.model}
                </p>
                <dl className="space-y-2">
                  <Field label="VIN" value={claim.vehicle.vin} />
                  <Field label="Plate" value={claim.vehicle.licensePlate ?? '—'} />
                  <Field label="Color" value={claim.vehicle.color ?? '—'} />
                </dl>
              </CardContent>
            </Card>
          )}

          {claim.policy && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4" /> Policy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="font-medium">{claim.policy.policyNumber}</p>
                <dl className="space-y-2">
                  <Field label="Status" value={humanize(claim.policy.status)} />
                  <Field
                    label="Coverage limit"
                    value={formatCurrency(claim.policy.coverageLimit)}
                  />
                  <Field
                    label="Term"
                    value={`${formatDate(claim.policy.effectiveDate)} – ${formatDate(
                      claim.policy.expirationDate,
                    )}`}
                  />
                </dl>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
