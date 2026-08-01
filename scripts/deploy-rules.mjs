import { readFile } from "node:fs/promises";

import { getFirebaseAdminApp } from "../src/lib/firebase.server.ts";

const file = new URL("../firebase.database.rules.json", import.meta.url);
const rules = JSON.parse(await readFile(file, "utf8"));
if (!rules || typeof rules.rules !== "object") throw new Error("Arquivo de regras inválido.");

const app = getFirebaseAdminApp();
const credential = app.options.credential;
if (!credential) throw new Error("Credencial Firebase Admin indisponível.");
const token = await credential.getAccessToken();
const databaseURL = String(app.options.databaseURL ?? "").replace(/\/+$/, "");
const rulesUrl = new URL(`${databaseURL}/.settings/rules.json`);
rulesUrl.searchParams.set("access_token", token.access_token);
const response = await fetch(rulesUrl, {
  method: "PUT",
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify(rules),
});
if (!response.ok) {
  const detail = (await response.text()).slice(0, 1_000);
  throw new Error(`Falha ao publicar regras: HTTP ${response.status}: ${detail}`);
}
console.log(JSON.stringify({ ok: true, databaseURL, rulesDeployed: true }));
process.exit(0);
