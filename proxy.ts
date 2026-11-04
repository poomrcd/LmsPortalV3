const COOKIE_NAME = 'lms_auth';
const COOKIE_TTL = 60 * 60 * 24 * 30; // 30 days

export default function proxy(request: Request) {
  const LMS_PASSWORD = process.env.LMS_PASSWORD;
  const LMS_TOKEN = process.env.LMS_TOKEN;

  // Safety check for missing env vars
  if (!LMS_PASSWORD || !LMS_TOKEN) {
    return new Response('LMS misconfigured: Set LMS_PASSWORD and LMS_TOKEN in Vercel Environment Variables.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const url = new URL(request.url);
  
  // Parse the cookie header safely
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );

  // 1. If the auth cookie is present and correct, allow the request to continue
  if (cookies[COOKIE_NAME] === LMS_TOKEN) {
    return; // Returning undefined tells Vercel to serve the static file normally
  }

  // 2. Handle login attempt via URL (e.g., /?pw=alpaca501)
  const pwParam = url.searchParams.get('pw');
  if (pwParam) {
    if (pwParam === LMS_PASSWORD) {
      // Redirect to clean URL and set the secure cookie
      return new Response(null, {
        status: 303,
        headers: {
          'Location': '/',
          'Set-Cookie': `${COOKIE_NAME}=${LMS_TOKEN}; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_TTL}; Path=/`,
        },
      });
    }
    return htmlResponse(loginPage('Incorrect password. Please try again.'), 401);
  }

  // 3. Not authenticated → return the login page HTML
  return htmlResponse(loginPage(), 401);
}

// Helper to return HTML responses
function htmlResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// The login page HTML
function loginPage(error = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LMS Portal — Sign in</title>
<style>
  :root { --navy:#0B1F3A; --pearl:#FAF9F6; --muted:rgba(11,31,58,.62); }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: "Segoe UI", system-ui, sans-serif; background: var(--pearl); color: var(--navy); padding: 24px; }
  .card { width: 100%; max-width: 400px; background: #fff; padding: 32px;
    border-radius: 14px; border: 1px solid rgba(11,31,58,.18); box-shadow: 0 6px 24px rgba(11,31,58,.10); }
  h1 { margin: 0 0 4px; font-size: 1.5rem; }
  .sub { margin: 0 0 22px; font-size: .9rem; color: var(--muted); }
  label { display: block; font-size: .82rem; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
  input[type=password] { width: 100%; font: inherit; font-size: .95rem; padding: 11px 13px;
    border: 1.5px solid rgba(11,31,58,.18); border-radius: 10px; background: #F4F2ED; color: var(--navy); outline: none; transition: border-color .15s; }
  input[type=password]:focus { border-color: var(--navy); }
  button { width: 100%; margin-top: 16px; padding: 11px; font: inherit; font-weight: 600; font-size: .95rem;
    background: var(--navy); color: var(--pearl); border: 0; border-radius: 10px; cursor: pointer; transition: opacity .15s; }
  button:hover { opacity: .9; }
  .err { margin-top: 12px; padding: 10px 12px; font-size: .85rem; color: #B3453C; border: 1.5px solid #B3453C; border-radius: 8px; text-align: center; }
</style>
</head>
<body>
  <form class="card" method="GET" action="/">
    <h1>LMS Portal</h1>
    <p class="sub">Internal learning platform — sign in to continue</p>
    <label for="pw">Access password</label>
    <input id="pw" name="pw" type="password" required autofocus autocomplete="current-password">
    <button type="submit">Sign in</button>
    ${error ? `<div class="err">${error}</div>` : ''}
  </form>
</body>
</html>`;
}