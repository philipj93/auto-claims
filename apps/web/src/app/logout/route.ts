import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth';

export async function POST(request: Request) {
  (await cookies()).delete(ACCESS_TOKEN_COOKIE);
  return NextResponse.redirect(new URL('/login', request.url));
}
