import { createServerFn } from "@tanstack/react-start";

import { findSection } from "./admin-sections";
import {
  CheckoutSyncInput,
  CreditAdjustmentInput,
  DeleteInput,
  LoginInput,
  RecordInput,
  SectionInput,
  UserPlanInput,
} from "./admin-schemas";

export const adminLogin = createServerFn({ method: "POST" })
  .validator((input: unknown) => LoginInput.parse(input))
  .handler(async ({ data }) => {
    const { verifyCredentials, createSession } = await import("./admin-session.server");
    try {
      const ok = await verifyCredentials(data.username, data.password);
      if (!ok) return { ok: false as const, error: "Usuário ou senha inválidos" };
      await createSession(data.username);
      return { ok: true as const, username: data.username };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login indisponível";
      return { ok: false as const, error: message };
    }
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

  const [users, plans, models, providers, payments, api, cliProxy] = await Promise.all([
    rtdbGet<Record<string, Record<string, unknown>>>("users"),
    rtdbGet<Record<string, Record<string, unknown>>>("config/plans"),
    rtdbGet<Record<string, Record<string, unknown>>>("axionSettings/config/models"),
    rtdbGet<Record<string, Record<string, unknown>>>("axionSettings/config/providers"),
    rtdbGet<Record<string, Record<string, unknown>>>("axionSettings/private/payments"),
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
      payments: Object.keys(payments ?? {}).length,
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
  .validator((input: unknown) => SectionInput.parse(input))
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
        json: JSON.stringify(redactSecrets(data.section, value ?? {}), null, 2),
        records: [] as Array<{ id: string; json: string }>,
      };
    }
    const records = Object.entries((value ?? {}) as Record<string, unknown>).map(([id, item]) => ({
      id,
      json: JSON.stringify(redactSecrets(data.section, item), null, 2),
    }));
    return { kind: "collection" as const, json: "", records };
  });

export const saveRecord = createServerFn({ method: "POST" })
  .validator((input: unknown) => RecordInput.parse(input))
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

    const { rtdbGet, rtdbPut } = await import("./firebase.server");
    if (section.kind === "single") {
      const existing = await rtdbGet<Record<string, unknown>>(section.path);
      await rtdbPut(section.path, restoreSecrets(data.section, parsed, existing));
      return { ok: true as const };
    }
    const recordId = (data.recordId ?? "").trim();
    if (!recordId || /[.#$[\]/]/.test(recordId)) {
      return { ok: false as const, error: "Identificador inválido" };
    }
    const recordPath = `${section.path}/${recordId}`;
    const existing = await rtdbGet<Record<string, unknown>>(recordPath);
    await rtdbPut(recordPath, restoreSecrets(data.section, parsed, existing));
    return { ok: true as const };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .validator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const section = findSection(data.section);
    if (!section || section.kind !== "collection" || section.allowDelete === false) {
      throw new Error("Seção não permite exclusão");
    }
    if (/[.#$[\]/]/.test(data.recordId)) return { ok: false as const, error: "ID inválido" };
    const { rtdbDelete } = await import("./firebase.server");
    await rtdbDelete(`${section.path}/${data.recordId}`);
    return { ok: true as const };
  });

export const setUserPlan = createServerFn({ method: "POST" })
  .validator((input: unknown) => UserPlanInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { setUserPlanByAdmin } = await import("./accounts.server");
    await setUserPlanByAdmin(data.uid, data.planId);
    return { ok: true as const };
  });

export const adjustUserCredits = createServerFn({ method: "POST" })
  .validator((input: unknown) => CreditAdjustmentInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { adjustUserCreditsByAdmin } = await import("./accounts.server");
    await adjustUserCreditsByAdmin(data.uid, data.delta);
    return { ok: true as const };
  });

export const synchronizePayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => CheckoutSyncInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { rtdbGet } = await import("./firebase.server");
    const payment = await rtdbGet<Record<string, unknown>>(
      `axionSettings/private/payments/${data.checkoutId}`,
    );
    const orderId = typeof payment?.["orderId"] === "string" ? payment["orderId"] : "";
    if (!orderId) return { ok: false as const, error: "Order não encontrada" };
    const { synchronizeOrder } = await import("./payments.server");
    const updated = await synchronizeOrder(orderId);
    return { ok: true as const, status: updated.status, activated: Boolean(updated.activatedAt) };
  });

const SECRET_FIELDS: Record<string, string[]> = {
  providers: ["api_key", "apiKey", "token"],
  mercadoPago: ["accessToken", "clientSecret", "webhookSecret"],
};

function redactSecrets(section: string, value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const clone = { ...(value as Record<string, unknown>) };
  for (const field of SECRET_FIELDS[section] ?? []) {
    if (clone[field]) clone[field] = "__KEEP__";
  }
  return clone;
}

function restoreSecrets(section: string, value: unknown, existing: Record<string, unknown> | null) {
  const next = { ...(value as Record<string, unknown>) };
  for (const field of SECRET_FIELDS[section] ?? []) {
    if (next[field] === "__KEEP__") {
      if (existing?.[field] !== undefined) next[field] = existing[field];
      else delete next[field];
    }
  }
  return next;
}
