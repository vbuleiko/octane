import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, schema } from './db';

const COOKIE = 'octane_session';
const MAX_AGE = 60 * 60 * 24 * 7;
const DUMMY_HASH = '$2b$12$fn6KpJHful/xWHpWS/7BxOBxX.Qgx9uawWXG0Ph1UFdiLcUCI2rou';

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value === 'change-me') {
    if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET must be set in production');
    return new TextEncoder().encode('octane-dev-secret-do-not-use-in-production');
  }
  return new TextEncoder().encode(value);
}

export type SessionUser = { id: number; email: string; name: string };

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  const user = db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase())).get();
  // Compare against a dummy hash when the user is unknown so timing doesn't reveal valid emails.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  return user && ok ? { id: user.id, email: user.email, name: user.name } : null;
}

export async function startSession(user: SessionUser) {
  const token = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = Number(payload.sub);
    // Make sure the account still exists (it may have been removed since the cookie was issued).
    const user = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    return user ? { id: user.id, email: user.email, name: user.name } : null;
  } catch {
    return null;
  }
}

/** Use at the top of every admin page and server action. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/admin/login');
  return user;
}
