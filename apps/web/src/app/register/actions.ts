'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth';
import { registerRequest } from '@/lib/api';
import type { AuthFormState } from '../login/actions';

export async function register(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input = {
    username: String(formData.get('username') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
  };

  let token: string;
  try {
    const { accessToken } = await registerRequest(input);
    token = accessToken;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Registration failed' };
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
