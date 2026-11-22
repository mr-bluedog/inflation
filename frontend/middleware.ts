/**
 * Middleware Vercel (exécuté côté serveur avant chaque requête) : protection du site par mot de passe.
 * Logique et tests : src/edge/auth.ts. Variables Vercel : SITE_PASSWORD (obligatoire), SITE_SESSION_DAYS (option).
 * Sans effet en développement local (Vite ne l'exécute pas).
 */
import { next } from '@vercel/functions';
import { handleAuth } from './src/edge/auth';

export const config = { matcher: '/:path*' };

export default async function middleware(request: Request): Promise<Response> {
  const res = await handleAuth(request, {
    SITE_PASSWORD: process.env.SITE_PASSWORD,
    SITE_SESSION_SECRET: process.env.SITE_SESSION_SECRET,
    SITE_SESSION_DAYS: process.env.SITE_SESSION_DAYS,
  });
  return res ?? next();
}
