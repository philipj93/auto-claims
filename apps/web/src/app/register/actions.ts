'use server';

import { redirect } from 'next/navigation';
import { setAuthCookies } from '@/lib/auth';
import { registerRequest, RateLimitError } from '@/lib/api';
import type { AuthFormState } from '../login/actions';

export async function register(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input = {
    username: String(formData.get('username') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
  };

  let tokens;
  try {
    tokens = await registerRequest(input);
  } catch (err) {
    if (err instanceof RateLimitError)
      return { error: 'Too many attempts. Please wait a moment and try again.' };
    return { error: err instanceof Error ? err.message : 'Registration failed' };
  }

  await setAuthCookies(tokens);
  redirect('/');
}
