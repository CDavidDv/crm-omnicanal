import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

const COOKIE = "crm_session";
const key = new TextEncoder().encode(env.SESSION_SECRET);

export interface Session {
  email: string;
}

export async function createSession(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, key);
    return { email: payload.email as string };
  } catch {
    return null;
  }
}

/** Sesión actual en Server Components y route handlers. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;

/** MVP mono-usuario contra .env. Sustituir por tabla users al crecer el equipo. */
export function checkCredentials(email: string, password: string): boolean {
  return email === env.ADMIN_EMAIL && password === env.ADMIN_PASSWORD;
}
