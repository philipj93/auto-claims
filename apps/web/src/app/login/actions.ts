'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth';
import { loginRequest, UnauthorizedError } from '@/lib/api';

export type AuthFormState = { error: string | null };

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');

  let token: string;
  try {
    const { accessToken } = await loginRequest({ username, password });
    token = accessToken;
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: 'Invalid username or password' };
    return { error: 'Something went wrong. Please try again.' };
  }

  (await cookies()).set(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24, // 1 day, matching JWT_EXPIRES_IN
  });
  redirect('/');
}
