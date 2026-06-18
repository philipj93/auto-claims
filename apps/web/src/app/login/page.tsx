'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { login, type AuthFormState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

const initialState: AuthFormState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="mx-auto max-w-sm py-12">
      <Card className="p-6">
        <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
        <p className="mb-6 text-sm text-muted-foreground">Access the Auto Claims Portal.</p>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" autoComplete="username" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/register" className="font-medium underline">
            Create one
          </Link>
        </p>
      </Card>
    </div>
  );
}
