import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envPath = join(root, ".env.local");
const credentialDirectory = join(root, "credencial firebase admin");

if (existsSync(envPath)) {
  throw new Error(".env.local já existe; nada foi sobrescrito.");
}

const credentialFile = readdirSync(credentialDirectory).find((name) =>
  name.toLowerCase().endsWith(".json"),
);
if (!credentialFile) throw new Error("Credencial Firebase Admin JSON não encontrada.");

const username = `axion_admin_${randomBytes(3).toString("hex")}`;
const password = randomBytes(24).toString("base64url");
const sessionSecret = randomBytes(48).toString("base64url");
const relativeCredential = `./credencial firebase admin/${credentialFile}`;

const env = [
  `ADMIN_USERNAME=${username}`,
  `ADMIN_PASSWORD=${password}`,
  `ADMIN_SESSION_SECRET=${sessionSecret}`,
  "FIREBASE_PROJECT_ID=axion-badfa",
  "FIREBASE_DATABASE_URL=https://axion-badfa-default-rtdb.firebaseio.com",
  `FIREBASE_SERVICE_ACCOUNT_PATH=${relativeCredential}`,
  "MERCADO_PAGO_MODE=sandbox",
  "MERCADO_PAGO_ACCESS_TOKEN=",
  "MERCADO_PAGO_WEBHOOK_SECRET=",
  "MERCADO_PAGO_PIX_EXPIRATION_MINUTES=30",
  "PUBLIC_BASE_URL=http://localhost:3000",
  "",
].join("\n");

writeFileSync(envPath, env, { encoding: "utf8", mode: 0o600, flag: "wx" });
writeFileSync(
  join(credentialDirectory, "admin-login.txt"),
  `Axion Admin local\nUsuário: ${username}\nSenha: ${password}\n`,
  { encoding: "utf8", mode: 0o600, flag: "wx" },
);

console.log("Ambiente local criado. Credenciais salvas no diretório privado configurado.");
