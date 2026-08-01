import { verifyFirebaseIdToken } from "./firebase.server";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function requireFirebaseUser(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (!header.startsWith("Bearer ")) {
    throw new HttpError(401, "authentication_required", "Entre na sua conta para continuar.");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new HttpError(401, "invalid_token", "Token Firebase ausente.");
  try {
    return await verifyFirebaseIdToken(token);
  } catch {
    throw new HttpError(401, "invalid_token", "Sua sessão expirou. Entre novamente.");
  }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  console.error(error);
  return Response.json(
    { error: { code: "internal_error", message: "Falha interna no servidor Axion." } },
    { status: 500 },
  );
}

export function noStoreJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
