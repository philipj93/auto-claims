'use server';

import { redirect } from 'next/navigation';
import { setAuthCookies } from '@/lib/auth';
import { loginRequest, RateLimitError, UnauthorizedError } from '@/lib/api';

export type AuthFormState = { error: string | null };

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');

  let tokens;
  try {
    tokens = await loginRequest({ username, password });
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: 'Invalid username or password' };
    if (err instanceof RateLimitError)
      return { error: 'Too many attempts. Please wait a moment and try again.' };
    return { error: 'Something went wrong. Please try again.' };
  }

  await setAuthCookies(tokens);
  redirect('/');
}
