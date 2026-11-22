import { COOKIE, handleAuth, makeToken, safeNext, verifyToken, type AuthEnv } from '../../middleware';

const ENV: AuthEnv = { SITE_PASSWORD: 'correct horse battery staple' };
const NOW = Date.UTC(2026, 10, 22, 12);
const opts = { now: NOW, failDelayMs: 0 };
const BASE = 'https://inflation.example.vercel.app';

const get = (path: string, cookie?: string) =>
  new Request(BASE + path, { headers: cookie ? { cookie: `${COOKIE}=${encodeURIComponent(cookie)}` } : {} });

const post = (password: string, next = '/') =>
  new Request(BASE + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, next }).toString(),
  });

function cookieFrom(res: Response): string {
  const set = res.headers.get('set-cookie') ?? '';
  return decodeURIComponent(/site_auth=([^;]*)/.exec(set)?.[1] ?? '');
}

describe('protection par mot de passe (middleware Vercel)', () => {
  it('reste fermé si SITE_PASSWORD est absent', async () => {
    const r = await handleAuth(get('/'), {}, opts);
    expect(r?.status).toBe(503);
  });

  it('renvoie les pages vers la connexion et refuse les données sans session', async () => {
    const r = await handleAuth(get('/simulateur?ttf=30'), ENV, opts);
    expect(r?.status).toBe(303);
    expect(r?.headers.get('location')).toBe('/login?next=%2Fsimulateur%3Fttf%3D30');
    expect((await handleAuth(get('/data/headline/EA.json'), ENV, opts))?.status).toBe(401);
    expect((await handleAuth(get('/assets/index.js'), ENV, opts))?.status).toBe(401);
    expect(await handleAuth(get('/favicon.svg'), ENV, opts)).toBeNull(); // icône publique
  });

  it('affiche la page de connexion sans divulguer le mot de passe', async () => {
    const r = (await handleAuth(get('/login?next=/pays'), ENV, opts))!;
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('name="password"');
    expect(body).toContain('value="/pays"');
    expect(body).not.toContain(ENV.SITE_PASSWORD);
  });

  it('refuse un mauvais mot de passe', async () => {
    const r = (await handleAuth(post('mauvais'), ENV, opts))!;
    expect(r.status).toBe(401);
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(await r.text()).toContain('Mot de passe incorrect');
  });

  it('accepte le bon mot de passe, pose un cookie sûr et ouvre le site', async () => {
    const r = (await handleAuth(post(ENV.SITE_PASSWORD!, '/pass-through'), ENV, opts))!;
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('/pass-through');
    const set = r.headers.get('set-cookie')!;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Secure/);
    expect(set).toMatch(/SameSite=Lax/);
    const token = cookieFrom(r);
    expect(await handleAuth(get('/', token), ENV, opts)).toBeNull();
    expect(await handleAuth(get('/data/meta.json', token), ENV, opts)).toBeNull();
    // déjà connecté : /login renvoie vers la page demandée
    expect((await handleAuth(get('/login?next=/pays', token), ENV, opts))?.headers.get('location')).toBe(
      '/pays',
    );
  });

  it('rejette un cookie expiré, falsifié ou signé avec un autre mot de passe', async () => {
    const tok = await makeToken(ENV, NOW);
    expect(await verifyToken(ENV, tok, NOW + 31 * 86_400_000)).toBe(false); // 30 jours par défaut
    const [exp, sig] = tok.split('.');
    expect(await verifyToken(ENV, `${Number(exp) + 86_400_000}.${sig}`, NOW)).toBe(false);
    expect(await verifyToken({ SITE_PASSWORD: 'autre' }, tok, NOW)).toBe(false);
    expect(await verifyToken(ENV, 'n.importe.quoi', NOW)).toBe(false);
  });

  it('déconnexion : efface le cookie', async () => {
    const r = (await handleAuth(get('/logout'), ENV, opts))!;
    expect(r.status).toBe(303);
    expect(r.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });

  it("n'autorise que des redirections internes", () => {
    expect(safeNext('/pays?x=1')).toBe('/pays?x=1');
    expect(safeNext('//site-malveillant.example')).toBe('/');
    expect(safeNext('https://site-malveillant.example')).toBe('/');
    expect(safeNext('/\\site-malveillant.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
