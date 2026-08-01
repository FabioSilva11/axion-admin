/**
 * Firebase Realtime Database REST access using the service account credentials
 * stored in the FIREBASE_SERVICE_ACCOUNT secret. Server-only.
 */

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

const SCOPES = [
  "https://www.googleapis.com/auth/firebase.database",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

let cachedToken: { token: string; expiresAt: number } | null = null;

function b64url(input: ArrayBuffer | string) {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string) {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf;
}

function readServiceAccount(): ServiceAccount {
  const raw = process.env["FIREBASE_SERVICE_ACCOUNT"];
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT não configurado");
  return JSON.parse(raw) as ServiceAccount;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token;

  const sa = readServiceAccount();
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPES,
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  const assertion = `${header}.${payload}.${b64url(signature)}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) {
    throw new Error("Falha ao autenticar com o Firebase");
  }
  cachedToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600),
  };
  return cachedToken.token;
}

function dbUrl(path: string, query = "") {
  const base = process.env["FIREBASE_DATABASE_URL"];
  if (!base) throw new Error("FIREBASE_DATABASE_URL não configurado");
  const clean = path.replace(/^\/+|\/+$/g, "");
  return `${base.replace(/\/+$/, "")}/${clean}.json${query}`;
}

async function request(path: string, init: RequestInit = {}, query = "") {
  const token = await getAccessToken();
  const res = await fetch(dbUrl(path, query), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Firebase ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export async function rtdbGet<T = unknown>(path: string): Promise<T | null> {
  return (await request(path)) as T | null;
}

export async function rtdbPut(path: string, value: unknown) {
  return request(path, { method: "PUT", body: JSON.stringify(value) });
}

export async function rtdbPatch(path: string, value: Record<string, unknown>) {
  return request(path, { method: "PATCH", body: JSON.stringify(value) });
}

export async function rtdbDelete(path: string) {
  return request(path, { method: "DELETE" });
}
