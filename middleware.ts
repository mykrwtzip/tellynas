import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

const PUBLIC_API = ['/api/auth/login', '/api/auth/logout', '/api/auth/session'];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  const isApi = pathname.startsWith('/api');
  const isPublicApi = PUBLIC_API.some((route) => pathname.startsWith(route));

  if (isApi) {
    if (!session && !isPublicApi) {
      return NextResponse.json(
        { error: 'Your session expired. Please sign in again.' },
        { status: 401 },
      );
    }
    return NextResponse.next();
  }

  if (!session && pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (session && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|apple-icon.png).*)'],
};
