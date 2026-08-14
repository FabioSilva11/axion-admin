import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { HttpError } from "./http.server";

const LANDING_PUBLIC = process.env["LANDING_PUBLIC_DIR"] ?? "/opt/axion-landing/public";
const LANDING_OUTPUT_PUBLIC = process.env["LANDING_OUTPUT_PUBLIC_DIR"] ?? "/opt/axion-landing/.output/public";
export const LANDING_BASE_URL = process.env["LANDING_BASE_URL"] ?? "https://www.axion-ide.online";

const ALLOWED_DIRS = new Set(["", "apk"]);

export type LandingFile = { name: string; size: number; mtime: number; active: boolean };

function sanitizeName(name: string) {
  const base = path.basename(name);
  if (!base || base === "." || base === ".." || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(base)) {
    throw new HttpError(400, "invalid_name", "Nome de arquivo inválido.");
  }
  if (base.length > 160) throw new HttpError(400, "invalid_name", "Nome muito longo.");
  return base;
}

function dirFolder(dir: string) {
  const clean = String(dir ?? "").replace(/^\/+|\/+$/g, "");
  if (!ALLOWED_DIRS.has(clean)) throw new HttpError(400, "invalid_dir", "Pasta inválida.");
  return clean;
}

function publicRoot() {
  const root = path.resolve(LANDING_PUBLIC);
  if (!fs.existsSync(root)) {
    throw new HttpError(500, "missing_landing", `Pasta pública da landing não encontrada: ${root}`);
  }
  return root;
}

function resolveTarget(dir: string, name: string) {
  const safeName = sanitizeName(name);
  const folder = dirFolder(dir);
  const root = publicRoot();
  const file = path.resolve(path.join(root, folder), safeName);
  if (!file.startsWith(root + path.sep)) {
    throw new HttpError(400, "invalid_path", "Caminho fora da pasta pública.");
  }
  const outputFile = path.resolve(path.join(path.resolve(LANDING_OUTPUT_PUBLIC), folder), safeName);
  return { file, outputFile, safeName, folder };
}

function listDir(folder: string) {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const stat = fs.statSync(path.join(folder, entry.name));
      return { name: entry.name, size: stat.size, mtime: stat.mtimeMs, active: entry.name === "axion.apk" };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listLandingFiles(dir: string): LandingFile[] {
  return listDir(path.join(publicRoot(), dirFolder(dir)));
}

function backupApk(file: string) {
  if (!fs.existsSync(file)) return;
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  fs.copyFileSync(file, path.join(path.dirname(file), `axion-${stamp}.apk`));
}

export async function uploadLandingFile(
  dir: string,
  name: string,
  body: ReadableStream<Uint8Array> | null,
  expectedSize?: number,
): Promise<LandingFile> {
  const { file, outputFile, safeName, folder } = resolveTarget(dir, name);
  if (!body) throw new HttpError(400, "empty_upload", "Nenhum conteúdo enviado.");
  const temp = `${file}.part-${process.pid}-${Date.now()}`;
  try {
    await pipeline(Readable.fromWeb(body as unknown as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(temp));
    const stat = fs.statSync(temp);
    if (stat.size === 0) throw new HttpError(400, "empty_file", "O arquivo enviado está vazio.");
    if (typeof expectedSize === "number" && expectedSize > 0 && stat.size !== expectedSize) {
      throw new HttpError(400, "size_mismatch", "O tamanho do arquivo não confere com o esperado.");
    }
    if (safeName === "axion.apk") backupApk(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.renameSync(temp, file);
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.copyFileSync(file, outputFile);
    const final = fs.statSync(file);
    return { name: safeName, size: final.size, mtime: final.mtimeMs, active: safeName === "axion.apk" };
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {}
    throw error;
  }
}

export function deleteLandingFile(dir: string, name: string) {
  const { file, outputFile, safeName } = resolveTarget(dir, name);
  if (safeName === "axion.apk") {
    throw new HttpError(400, "protected", "O aplicativo ativo (axion.apk) não pode ser excluído.");
  }
  if (!fs.existsSync(file)) throw new HttpError(404, "not_found", "Arquivo não encontrado.");
  fs.rmSync(file);
  try {
    fs.rmSync(outputFile, { force: true });
  } catch {}
  return { ok: true };
}

export function activateLandingFile(dir: string, name: string): LandingFile {
  const { file, outputFile } = resolveTarget(dir, name);
  if (!fs.existsSync(file)) throw new HttpError(404, "not_found", "Arquivo não encontrado.");
  const target = resolveTarget(dir, "axion.apk");
  backupApk(target.file);
  fs.mkdirSync(path.dirname(target.file), { recursive: true });
  fs.copyFileSync(file, target.file);
  fs.mkdirSync(path.dirname(target.outputFile), { recursive: true });
  fs.copyFileSync(target.file, target.outputFile);
  const stat = fs.statSync(target.file);
  return { name: "axion.apk", size: stat.size, mtime: stat.mtimeMs, active: true };
}

export function downloadLandingFile(dir: string, name: string) {
  const { file, safeName } = resolveTarget(dir, name);
  if (!fs.existsSync(file)) throw new HttpError(404, "not_found", "Arquivo não encontrado.");
  const stat = fs.statSync(file);
  return new Response(Readable.toWeb(fs.createReadStream(file)) as unknown as BodyInit, {
    headers: {
      "content-type": "application/vnd.android.package-archive",
      "content-disposition": `attachment; filename="${safeName}"`,
      "content-length": String(stat.size),
      "cache-control": "no-store",
    },
  });
}
