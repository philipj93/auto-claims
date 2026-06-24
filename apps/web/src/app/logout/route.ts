import { NextResponse } from 'next/server';
import { clearAuthCookies, getRefreshToken } from '@/lib/auth';
import { logoutRequest } from '@/lib/refresh';

export async function POST(request: Request) {
  // Revoke the session server-side so the refresh token can't be replayed,
  // then drop both cookies. logoutRequest is best-effort and never throws.
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    await logoutRequest(refreshToken);
  }
  await clearAuthCookies();
  return NextResponse.redirect(new URL('/login', request.url));
}
