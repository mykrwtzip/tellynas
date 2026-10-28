import { NextResponse, type NextRequest } from 'next/server';

// Reject browser cross-origin mutations, including login CSRF. Same-origin API
// clients without an Origin header are still supported.
export function middleware(request: NextRequest) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin) {
      try {
        const expectedHost = request.headers.get('host');
        if (!expectedHost || new URL(origin).host !== expectedHost) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
      } catch { return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 }); }
    }
  }
  return NextResponse.next();
}
export const config = { matcher: '/api/:path*' };
