import { NextResponse } from 'next/server';

export function middleware(req) {
  const { pathname, searchParams } = req.nextUrl;

  // 1. Allow access if the correct auth cookie is present
  const cookie = req.cookies.get('lms_auth')?.value;
  if (cookie === process.env.LMS_TOKEN) {
    return NextResponse.next();
  }

  // 2. Handle the login attempt via a query parameter (e.g., /?pw=yourpassword)
  const passwordAttempt = searchParams.get('pw');
  if (passwordAttempt === process.env.LMS_PASSWORD) {
    // If password is correct, set the cookie and redirect to the clean root URL
    const response = NextResponse.redirect(new URL('/', req.url));
    response.cookies.set('lms_auth', process.env.LMS_TOKEN, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    return response;
  }

  // 3. If no cookie and no valid password, block access
  return new NextResponse('Not authorised', { status: 401 });
}

// 4. Apply middleware to all paths except static assets and the login attempt itself
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};