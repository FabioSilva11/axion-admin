/**
 * Minimal signed-cookie session for the single admin account.
 * Credentials live in ADMIN_USERNAME / ADMIN_PASSWORD secrets.
 */
import { getCookie, setCookie, deleteCookie, getRequest } from "@tanstack/react-start/server";
import { HttpError } from "./http.server";

export const SESSION_COOKIE = "axion_admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
let loginFailures: number[] = [];

function secret() {
  const value = process.env["ADMIN_SESSION_SECRET"];
  if (!value) throw new Error("ADMIN_SESSION_SECRET não configurado");
  return value;
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyCredentials(username: string, password: string) {
  const now = Date.now();
  loginFailures = loginFailures.filter((time) => now - time < LOGIN_WINDOW_MS);
  if (loginFailures.length >= MAX_LOGIN_FAILURES) {
    throw new Error("Muitas tentativas de login. Aguarde 15 minutos.");
  }
  const expectedUser = process.env["ADMIN_USERNAME"] ?? "";
  const expectedPass = process.env["ADMIN_PASSWORD"] ?? "";
  if (!expectedUser || !expectedPass) {
    throw new Error("Credenciais seguras do admin não configuradas");
  }
  const accepted = safeEqual(username, expectedUser) && safeEqual(password, expectedPass);
  if (accepted) loginFailures = [];
  else loginFailures.push(now);
  return accepted;
}

export async function createSession(username: string) {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${username}.${expires}`;
  const token = `${payload}.${await sign(payload)}`;
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: isHttpsRequest(),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

function isHttpsRequest() {
  const req = getRequest();
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  return new URL(req.url).protocol === "https:";
}

export function destroySession() {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export async function getAdminUser(): Promise<string | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [username, expires, signature] = parts as [string, string, string];
  if (!Number(expires) || Number(expires) < Date.now()) return null;
  const expected = await sign(`${username}.${expires}`);
  if (!safeEqual(signature, expected)) return null;
  return username;
}

export async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }
  }
  return cookies;
}

export async function getAdminUserFromRequest(request: Request): Promise<string | null> {
  const token = parseCookieHeader(request.headers.get("cookie"))[SESSION_COOKIE];
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [username, expires, signature] = parts as [string, string, string];
  if (!Number(expires) || Number(expires) < Date.now()) return null;
  const expected = await sign(`${username}.${expires}`);
  if (!safeEqual(signature, expected)) return null;
  return username;
}

export async function requireAdminRequest(request: Request) {
  const user = await getAdminUserFromRequest(request);
  if (!user) throw new HttpError(401, "unauthorized", "Sessão expirada. Entre novamente.");
  return user;
}
