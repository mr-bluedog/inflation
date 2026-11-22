/**
 * Protection du site par mot de passe, exécutée par le middleware Vercel (côté serveur, avant toute réponse).
 *
 * - Le mot de passe est la variable d'environnement SITE_PASSWORD (Vercel → Settings → Environment Variables).
 *   Il n'est JAMAIS envoyé au navigateur ni inclus dans le JavaScript (pas de préfixe VITE_).
 * - Après connexion, un cookie de session signé (HMAC-SHA256, HttpOnly, Secure) est posé pour SITE_SESSION_DAYS
 *   jours (30 par défaut). Changer SITE_PASSWORD déconnecte tout le monde.
 * - Tout est protégé : pages, données (/data/*) et scripts ; seuls /login, /logout et l'icône sont publics.
 * - Sans SITE_PASSWORD, le site reste FERMÉ (message explicite) : une erreur de configuration ne l'ouvre pas.
 */

export const COOKIE = 'site_auth';
const enc = new TextEncoder();

export interface AuthEnv {
  SITE_PASSWORD?: string;
  SITE_SESSION_SECRET?: string;
  SITE_SESSION_DAYS?: string;
}

export interface AuthOptions {
  now?: number;
  /** pause après un mauvais mot de passe (ralentit les essais en série) */
  failDelayMs?: number;
}

function b64url(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

async function sha256(s: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Comparaison à temps constant (chaînes de même longueur). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const secretOf = (env: AuthEnv) => `${env.SITE_SESSION_SECRET || env.SITE_PASSWORD}|session`;

export async function makeToken(env: AuthEnv, now: number): Promise<string> {
  const days = Number(env.SITE_SESSION_DAYS) > 0 ? Number(env.SITE_SESSION_DAYS) : 30;
  const exp = now + days * 86_400_000;
  return `${exp}.${await hmac(secretOf(env), `v1:${exp}`)}`;
}

export async function verifyToken(env: AuthEnv, token: string | undefined, now: number): Promise<boolean> {
  if (!token) return false;
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp <= now) return false;
  return safeEqual(sig, await hmac(secretOf(env), `v1:${exp}`));
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Cible de redirection après connexion : chemin interne uniquement (pas de redirection ouverte). */
export function safeNext(n: string | null | undefined): string {
  return n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/';
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function loginPage(next: string, error: string | null): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Inflation HICPxT — accès</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>
  :root { color-scheme: light; --bg: #f9f9f7; --card: #fcfcfb; --ink: #0b0b0b; --ink2: #52514e; --border: rgba(11,11,11,.12); --accent: #2a78d6; --danger: #d03b3b; }
  @media (prefers-color-scheme: dark) { :root { color-scheme: dark; --bg: #0d0d0d; --card: #1a1a19; --ink: #f0efec; --ink2: #c3c2b7; --border: rgba(255,255,255,.12); --accent: #3987e5; --danger: #e66767; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 16px; }
  main { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 28px 24px; }
  .brand { display: flex; gap: 10px; align-items: center; margin-bottom: 18px; }
  h1 { font-size: 18px; margin: 0; }
  p { color: var(--ink2); margin: 0 0 16px; font-size: 14px; }
  label { display: block; font-size: 13px; color: var(--ink2); margin-bottom: 6px; }
  input { width: 100%; font: inherit; padding: 9px 11px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--ink); }
  input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  button { margin-top: 14px; width: 100%; font: inherit; font-weight: 600; padding: 10px; border: 0; border-radius: 6px; background: var(--accent); color: #fff; cursor: pointer; }
  .err { color: var(--danger); font-size: 13px; margin: 10px 0 0; }
</style>
</head>
<body>
<main>
  <div class="brand"><img src="/favicon.svg" width="28" height="28" alt="" /><h1>Inflation HICPxT</h1></div>
  <p>Terminal de recherche privé. Saisir le mot de passe pour accéder au site.</p>
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${escapeHtml(next)}" />
    <label for="password">Mot de passe</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
    ${error ? `<p class="err" role="alert">${escapeHtml(error)}</p>` : ''}
    <button type="submit">Entrer</button>
  </form>
</main>
</body>
</html>`;
}

const html = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

const redirect = (location: string, extra: Record<string, string> = {}) =>
  new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store', ...extra } });

function cookieHeader(value: string, maxAge: number): string {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

const PUBLIC = new Set(['/favicon.svg']);

/** Réponse à renvoyer, ou null pour laisser passer la requête vers le site. */
export async function handleAuth(
  req: Request,
  env: AuthEnv,
  opts: AuthOptions = {},
): Promise<Response | null> {
  const now = opts.now ?? Date.now();
  const url = new URL(req.url);
  const path = url.pathname;
  if (PUBLIC.has(path)) return null;

  if (!env.SITE_PASSWORD)
    return html(
      '<!doctype html><meta charset="utf-8"><title>Accès fermé</title><p style="font-family:system-ui;padding:24px">Site fermé : la protection par mot de passe n\'est pas configurée (variable SITE_PASSWORD absente sur Vercel).</p>',
      503,
    );

  const authed = await verifyToken(env, readCookie(req, COOKIE), now);

  if (path === '/logout') return redirect('/login', { 'Set-Cookie': cookieHeader('', 0) });

  if (path === '/login') {
    if (req.method === 'POST') {
      const form = await req.formData();
      const given = String(form.get('password') ?? '');
      const next = safeNext(String(form.get('next') ?? '/'));
      // empreintes de même longueur : comparaison à temps constant sans révéler la longueur du mot de passe
      if (safeEqual(await sha256(given), await sha256(env.SITE_PASSWORD))) {
        const days = Number(env.SITE_SESSION_DAYS) > 0 ? Number(env.SITE_SESSION_DAYS) : 30;
        return redirect(next, { 'Set-Cookie': cookieHeader(await makeToken(env, now), days * 86_400) });
      }
      await new Promise((r) => setTimeout(r, opts.failDelayMs ?? 700));
      return html(loginPage(next, 'Mot de passe incorrect.'), 401);
    }
    const next = safeNext(url.searchParams.get('next'));
    return authed ? redirect(next) : html(loginPage(next, null), 200);
  }

  if (authed) return null;
  // données et fichiers : refus net (pas de page HTML à la place d'un JSON) ; pages : vers la connexion
  if (path.startsWith('/data/') || path.startsWith('/assets/'))
    return new Response('Authentification requise', {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  return redirect(`/login?next=${encodeURIComponent(path + url.search)}`);
}
