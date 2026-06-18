import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Auto Claims Portal',
  description: 'View and manage auto insurance claims by policyholder',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="min-h-screen bg-muted/30 antialiased">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShieldCheck className="size-4" />
              </span>
              Auto Claims Portal
            </Link>
            {user ? (
              <div className="ml-auto flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">
                  {user.firstName} {user.lastName}
                </span>
                <form action="/logout" method="post">
                  <button type="submit" className="font-medium underline">
                    Sign out
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
