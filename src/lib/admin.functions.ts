import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { findSection, SECTIONS } from "./admin-sections";

const LoginInput = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
});

const SectionInput = z.object({ section: z.string().trim().min(1).max(60) });

const RecordInput = z.object({
  section: z.string().trim().min(1).max(60),
  recordId: z.string().trim().max(200).optional(),
  value: z.string().max(200_000),
});

const DeleteInput = z.object({
  section: z.string().trim().min(1).max(60),
  recordId: z.string().trim().min(1).max(200),
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LoginInput.parse(input))
  .handler(async ({ data }) => {
    const { verifyCredentials, createSession } = await import("./admin-session.server");
    const ok = await verifyCredentials(data.username, data.password);
    if (!ok) return { ok: false as const, error: "Usuário ou senha inválidos" };
    await createSession(data.username);
    return { ok: true as const, username: data.username };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { destroySession } = await import("./admin-session.server");
  destroySession();
  return { ok: true as const };
});

export const adminMe = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminUser } = await import("./admin-session.server");
  return { username: await getAdminUser() };
});

export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin-session.server");
  await requireAdmin();
  const { rtdbGet } = await import("./firebase.server");

  const [users, plans, models, providers, api, cliProxy] = await Promise.all([
    rtdbGet<Record<string, Record<string, unknown>>>("users"),
    rtdbGet<Record<string, Record<string, unknown>>>("axionServer/config/plans"),
    rtdbGet<Record<string, Record<string, unknown>>>("axionServer/config/models"),
    rtdbGet<Record<string, Record<string, unknown>>>("axionServer/config/providers"),
    rtdbGet<Record<string, unknown>>("config/api"),
    rtdbGet<Record<string, unknown>>("config/cli-proxy"),
  ]);

  const userList = Object.values(users ?? {});
  const perPlan: Record<string, number> = {};
  for (const user of userList) {
    const plan = typeof user?.["plan"] === "string" ? (user["plan"] as string) : "sem plano";
    perPlan[plan] = (perPlan[plan] ?? 0) + 1;
  }

  return {
    totals: {
      users: userList.length,
      plans: Object.keys(plans ?? {}).length,
      models: Object.keys(models ?? {}).length,
      providers: Object.keys(providers ?? {}).length,
    },
    perPlan,
    apiOnline: Boolean(api?.["online"]),
    proxyOnline: Boolean(cliProxy?.["online"]),
    apiEndpoint: typeof api?.["endpoint"] === "string" ? (api["endpoint"] as string) : null,
    recentUsers: userList
      .map((user) => ({
        uid: String(user?.["uid"] ?? ""),
        name: String(user?.["name"] ?? "—"),
        email: String(user?.["email"] ?? "—"),
        plan: String(user?.["plan"] ?? "—"),
        createdAt: Number(user?.["createdAt"] ?? 0),
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5),
  };
});

export const getSectionData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SectionInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const section = findSection(data.section);
    if (!section) throw new Error("Seção inválida");
    const { rtdbGet } = await import("./firebase.server");
    const value = await rtdbGet<unknown>(section.path);

    if (section.kind === "single") {
      return {
        kind: "single" as const,
        json: JSON.stringify(value ?? {}, null, 2),
        records: [] as Array<{ id: string; json: string }>,
      };
    }
    const records = Object.entries((value ?? {}) as Record<string, unknown>).map(([id, item]) => ({
      id,
      json: JSON.stringify(item, null, 2),
    }));
    return { kind: "collection" as const, json: "", records };
  });


export const saveRecord = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RecordInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const section = findSection(data.section);
    if (!section) throw new Error("Seção inválida");

    let parsed: unknown;
    try {
      parsed = JSON.parse(data.value);
    } catch {
      return { ok: false as const, error: "JSON inválido" };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false as const, error: "O conteúdo precisa ser um objeto JSON" };
    }

    const { rtdbPut } = await import("./firebase.server");
    if (section.kind === "single") {
      await rtdbPut(section.path, parsed);
      return { ok: true as const };
    }
    const recordId = (data.recordId ?? "").trim();
    if (!recordId || /[.#$[\]/]/.test(recordId)) {
      return { ok: false as const, error: "Identificador inválido" };
    }
    await rtdbPut(`${section.path}/${recordId}`, parsed);
    return { ok: true as const };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const section = findSection(data.section);
    if (!section || section.kind !== "collection") throw new Error("Seção inválida");
    if (/[.#$[\]/]/.test(data.recordId)) return { ok: false as const, error: "ID inválido" };
    const { rtdbDelete } = await import("./firebase.server");
    await rtdbDelete(`${section.path}/${data.recordId}`);
    return { ok: true as const };
  });

export const sectionKeys = SECTIONS.map((section) => section.key);
