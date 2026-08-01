/**
 * Firebase Admin boundary. This module is server-only and must never be
 * imported by a browser component.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase, type DataSnapshot } from "firebase-admin/database";

let adminApp: App | undefined;

function parseServiceAccount(): ServiceAccount | null {
  const inline = process.env["FIREBASE_SERVICE_ACCOUNT"]?.trim();
  if (inline) return JSON.parse(inline) as ServiceAccount;

  const configuredPath =
    process.env["FIREBASE_SERVICE_ACCOUNT_PATH"]?.trim() ||
    process.env["GOOGLE_APPLICATION_CREDENTIALS"]?.trim();
  if (!configuredPath) return null;

  const absolutePath = resolve(process.cwd(), configuredPath);
  return JSON.parse(readFileSync(absolutePath, "utf8")) as ServiceAccount;
}

export function getFirebaseAdminApp() {
  if (adminApp) return adminApp;
  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    return adminApp;
  }

  const databaseURL = process.env["FIREBASE_DATABASE_URL"]?.trim();
  if (!databaseURL) throw new Error("FIREBASE_DATABASE_URL não configurado");
  const serviceAccount = parseServiceAccount();
  adminApp = initializeApp({
    credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    databaseURL,
    projectId: process.env["FIREBASE_PROJECT_ID"]?.trim() || undefined,
  });
  return adminApp;
}

function reference(path: string) {
  return getDatabase(getFirebaseAdminApp()).ref(path.replace(/^\/+|\/+$/g, ""));
}

export async function verifyFirebaseIdToken(idToken: string) {
  return getAuth(getFirebaseAdminApp()).verifyIdToken(idToken, true);
}

export async function rtdbGet<T = unknown>(path: string): Promise<T | null> {
  const snapshot = await reference(path).get();
  return snapshot.exists() ? (snapshot.val() as T) : null;
}

export async function rtdbPut(path: string, value: unknown) {
  await reference(path).set(value);
  return value;
}

export async function rtdbPatch(path: string, value: Record<string, unknown>) {
  await reference(path).update(value);
  return value;
}

export async function rtdbDelete(path: string) {
  await reference(path).remove();
  return null;
}

export async function rtdbTransaction<T = unknown>(
  path: string,
  update: (current: T | null) => T | null | undefined,
) {
  const result = await reference(path).transaction(
    (current) => update((current ?? null) as T | null),
    undefined,
    false,
  );
  return {
    committed: result.committed,
    value: snapshotValue<T>(result.snapshot),
  };
}

function snapshotValue<T>(snapshot: DataSnapshot): T | null {
  return snapshot.exists() ? (snapshot.val() as T) : null;
}
