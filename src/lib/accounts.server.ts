import { randomUUID } from "node:crypto";

import { rtdbGet, rtdbTransaction } from "./firebase.server";
import { HttpError } from "./http.server";

type JsonMap = Record<string, unknown>;

const asMap = (value: unknown): JsonMap =>
  value != null && typeof value === "object" && !Array.isArray(value) ? (value as JsonMap) : {};

const integer = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

export async function getPlan(planId: string) {
  const normalized = planId.trim();
  if (!normalized) throw new HttpError(400, "invalid_plan", "Plano inválido.");
  if (!/^[a-z0-9_-]{2,80}$/.test(normalized)) {
    throw new HttpError(400, "invalid_plan", "Plano invalido.");
  }
  const plan = await rtdbGet<JsonMap>(`config/plans/${normalized}`);
  if (!plan || plan["active"] === false) {
    throw new HttpError(404, "plan_not_found", "Plano indisponível.");
  }
  return { id: normalized, ...plan };
}

export function planCredits(planId: string, plan: JsonMap) {
  const key = planId === "free" ? "signup_credits" : "monthly_credits";
  return Math.max(1, integer(plan[key], planId === "free" ? 500 : 4_000));
}

export function walletFromProfile(profile: JsonMap | null | undefined) {
  const usage = asMap(profile?.["managedUsage"]);
  const limit = Math.max(1, integer(usage["creditLimit"], 500));
  const used = Math.min(limit, Math.max(0, integer(usage["creditsUsed"], 0)));
  const reserved = Math.min(
    Math.max(0, limit - used),
    Math.max(0, integer(usage["creditsReserved"], 0)),
  );
  return {
    used,
    limit,
    reserved,
    available: Math.max(0, limit - used - reserved),
    lifetimeUsed: Math.max(used, integer(usage["lifetimeUsed"], used)),
  };
}

export async function bootstrapUser(uid: string, email?: string, displayName?: string) {
  const freePlan = await getPlan("free");
  const catalog = (await rtdbGet<Record<string, JsonMap>>("config/plans")) ?? {};
  const now = Date.now();
  const limit = planCredits("free", freePlan);

  const result = await rtdbTransaction<JsonMap>(`users/${uid}`, (current) => {
    const profile = asMap(current);
    profile["uid"] = uid;
    if (!profile["email"] && email) profile["email"] = email;
    if (!profile["name"] && displayName) profile["name"] = displayName;
    if (!profile["createdAt"]) profile["createdAt"] = now;
    const subscription = asMap(profile["subscription"]);
    const requestedPlan = String(profile["plan"] ?? "free");
    const selectedPlan =
      catalog[requestedPlan]?.["active"] !== false && catalog[requestedPlan]
        ? requestedPlan
        : "free";
    const paidExpired =
      selectedPlan !== "free" &&
      integer(subscription["periodEnd"], 0) > 0 &&
      integer(subscription["periodEnd"], 0) <= now;
    const planId = selectedPlan !== "free" && !paidExpired ? selectedPlan : "free";
    profile["plan"] = planId;
    const usage = asMap(profile["managedUsage"]);
    const currentPlan = catalog[planId] ?? freePlan;
    const configuredLimit = planCredits(planId, currentPlan);
    const effectiveLimit = paidExpired
      ? configuredLimit
      : Math.max(1, integer(usage["creditLimit"], configuredLimit));
    const used = paidExpired
      ? 0
      : Math.min(effectiveLimit, Math.max(0, integer(usage["creditsUsed"], 0)));
    const reserved = Math.min(
      Math.max(0, effectiveLimit - used),
      Math.max(0, integer(usage["creditsReserved"], 0)),
    );
    Object.assign(usage, {
      schemaVersion: 2,
      creditLimit: effectiveLimit,
      creditsUsed: used,
      creditsReserved: reserved,
      creditsRemaining: Math.max(0, effectiveLimit - used - reserved),
      lifetimeUsed: Math.max(0, integer(usage["lifetimeUsed"], used)),
      updatedAt: now,
    });
    for (const key of ["tokensUsed", "tokenLimit", "tokensRemaining", "reservedTokens"]) {
      delete usage[key];
    }
    profile["managedUsage"] = usage;
    delete subscription["planId"];
    if (paidExpired) subscription["status"] = "expired";
    else if (planId === "free") subscription["status"] = "none";
    else subscription["status"] = "active";
    profile["subscription"] = subscription;
    return profile;
  });
  return result.value;
}

export async function reserveCredits(input: {
  uid: string;
  requestId: string;
  modelId: string;
  amount: number;
}) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new HttpError(400, "invalid_reservation", "Reserva de créditos inválida.");
  }
  const profile = await bootstrapUser(input.uid);
  const planId = String(profile?.["plan"] ?? "free");
  const plan = await getPlan(planId);
  const now = Date.now();
  const minuteStart = Math.floor(now / 60_000) * 60_000;
  const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
  const rpm = Math.max(1, integer(plan["requests_per_minute"], planId === "free" ? 3 : 8));
  const dailyLimit = Math.max(1, integer(plan["daily_credit_limit"], planCredits(planId, plan)));
  const reservationNonce = randomUUID();
  let duplicateStatus = "";

  const result = await rtdbTransaction<JsonMap>(`users/${input.uid}`, (current) => {
    // O RTDB pode iniciar a transação com cache local vazio mesmo depois de
    // bootstrapUser confirmar o perfil no servidor. A versão confirmada é um
    // fallback seguro; conflitos ainda são recalculados pelo próprio RTDB.
    const next = asMap(current ?? profile);
    const requests = asMap(next["serverRequests"]);
    const existing = asMap(requests[input.requestId]);
    if (
      (existing["status"] === "reserved" || existing["status"] === "settled") &&
      existing["reservationNonce"] !== reservationNonce
    ) {
      duplicateStatus = String(existing["status"]);
      return next;
    }
    if (existing["reservationNonce"] === reservationNonce) return next;

    const usage = asMap(next["managedUsage"]);
    const limit = Math.max(1, integer(usage["creditLimit"], planCredits(planId, plan)));
    const used = Math.max(0, integer(usage["creditsUsed"], 0));
    const reserved = Math.max(0, integer(usage["creditsReserved"], 0));
    if (limit - used - reserved < input.amount) {
      throw new HttpError(402, "insufficient_credits", "Seu saldo de créditos terminou.");
    }

    const currentMinute = integer(usage["minuteWindowStart"], 0) === minuteStart;
    const minuteRequests = currentMinute ? Math.max(0, integer(usage["minuteRequests"], 0)) : 0;
    if (minuteRequests >= rpm) {
      throw new HttpError(
        429,
        "rate_limit_exceeded",
        "Limite de solicitações por minuto atingido.",
      );
    }
    const currentDay = integer(usage["dailyWindowStart"], 0) === dayStart;
    const dailyUsed = currentDay ? Math.max(0, integer(usage["dailyCreditsUsed"], 0)) : 0;
    const dailyReserved = currentDay ? Math.max(0, integer(usage["dailyCreditsReserved"], 0)) : 0;
    if (dailyUsed + dailyReserved + input.amount > dailyLimit) {
      throw new HttpError(429, "daily_limit_exceeded", "Limite diário do plano atingido.");
    }

    Object.assign(usage, {
      schemaVersion: 2,
      creditsReserved: reserved + input.amount,
      creditsRemaining: limit - used - reserved - input.amount,
      minuteWindowStart: minuteStart,
      minuteRequests: minuteRequests + 1,
      dailyWindowStart: dayStart,
      dailyCreditsUsed: dailyUsed,
      dailyCreditsReserved: dailyReserved + input.amount,
      updatedAt: now,
    });
    next["managedUsage"] = usage;
    requests[input.requestId] = {
      status: "reserved",
      modelId: input.modelId,
      reservationNonce,
      reservedCredits: input.amount,
      createdAt: now,
    };
    next["serverRequests"] = requests;
    return next;
  });
  return { profile: result.value, planId, plan, duplicateStatus };
}

export async function settleCredits(input: {
  uid: string;
  requestId: string;
  actualAmount: number;
  inputTokens: number;
  outputTokens: number;
}) {
  const now = Date.now();
  const confirmedProfile = await rtdbGet<JsonMap>(`users/${input.uid}`);
  if (!confirmedProfile) throw new HttpError(404, "user_not_found", "Usuário não encontrado.");
  const result = await rtdbTransaction<JsonMap>(`users/${input.uid}`, (current) => {
    const next = asMap(current ?? confirmedProfile);
    const requests = asMap(next["serverRequests"]);
    const request = asMap(requests[input.requestId]);
    if (request["status"] === "settled") return next;
    if (request["status"] !== "reserved") {
      throw new HttpError(409, "reservation_not_found", "Reserva de créditos não encontrada.");
    }
    const usage = asMap(next["managedUsage"]);
    const limit = Math.max(1, integer(usage["creditLimit"], 1_000));
    const used = Math.max(0, integer(usage["creditsUsed"], 0));
    const reserved = Math.max(0, integer(usage["creditsReserved"], 0));
    const reservedAmount = Math.max(1, integer(request["reservedCredits"], 1));
    const charged = Math.min(reservedAmount, Math.max(1, integer(input.actualAmount, 1)));
    const nextReserved = Math.max(0, reserved - reservedAmount);
    const nextUsed = Math.min(limit, used + charged);
    Object.assign(usage, {
      creditsUsed: nextUsed,
      creditsReserved: nextReserved,
      creditsRemaining: Math.max(0, limit - nextUsed - nextReserved),
      lifetimeUsed: Math.max(0, integer(usage["lifetimeUsed"], used)) + charged,
      dailyCreditsUsed: Math.max(0, integer(usage["dailyCreditsUsed"], 0)) + charged,
      dailyCreditsReserved: Math.max(0, integer(usage["dailyCreditsReserved"], 0) - reservedAmount),
      updatedAt: now,
    });
    next["managedUsage"] = usage;
    Object.assign(request, {
      status: "settled",
      chargedCredits: charged,
      inputTokens: Math.max(0, integer(input.inputTokens, 0)),
      outputTokens: Math.max(0, integer(input.outputTokens, 0)),
      settledAt: now,
    });
    requests[input.requestId] = request;
    next["serverRequests"] = requests;
    const ledger = asMap(next["serverLedger"]);
    ledger[`usage_${input.requestId}`] = {
      kind: "model_usage",
      amount: -charged,
      balanceAfter: usage["creditsRemaining"],
      referenceId: input.requestId,
      modelId: request["modelId"],
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      createdAt: now,
    };
    next["serverLedger"] = ledger;
    return next;
  });
  return result.value;
}

export async function releaseCredits(uid: string, requestId: string, reason: string) {
  const now = Date.now();
  const confirmedProfile = await rtdbGet<JsonMap>(`users/${uid}`);
  if (!confirmedProfile) return null;
  const result = await rtdbTransaction<JsonMap>(`users/${uid}`, (current) => {
    const next = asMap(current ?? confirmedProfile);
    const requests = asMap(next["serverRequests"]);
    const request = asMap(requests[requestId]);
    if (request["status"] !== "reserved") return next;
    const amount = Math.max(0, integer(request["reservedCredits"], 0));
    const usage = asMap(next["managedUsage"]);
    const limit = Math.max(1, integer(usage["creditLimit"], 1_000));
    const used = Math.max(0, integer(usage["creditsUsed"], 0));
    const nextReserved = Math.max(0, integer(usage["creditsReserved"], 0) - amount);
    Object.assign(usage, {
      creditsReserved: nextReserved,
      creditsRemaining: Math.max(0, limit - used - nextReserved),
      dailyCreditsReserved: Math.max(0, integer(usage["dailyCreditsReserved"], 0) - amount),
      updatedAt: now,
    });
    next["managedUsage"] = usage;
    Object.assign(request, {
      status: "released",
      releaseReason: reason.slice(0, 80),
      releasedAt: now,
    });
    requests[requestId] = request;
    next["serverRequests"] = requests;
    return next;
  });
  return result.value;
}

export async function activatePaidPlan(input: {
  uid: string;
  amountCents: number;
  planId: string;
}) {
  const plan = await getPlan(input.planId);
  const expected = Math.max(1, integer(plan["price_cents"], 0));
  if (input.amountCents !== expected) {
    throw new HttpError(409, "payment_amount_mismatch", "O valor pago não corresponde ao plano.");
  }
  const limit = planCredits(input.planId, plan);
  const cycleDays = Math.max(1, integer(plan["cycle_days"], 30));
  const now = Date.now();
  const periodEnd = now + cycleDays * 86_400_000;
  const confirmedProfile = await rtdbGet<JsonMap>(`users/${input.uid}`);
  if (!confirmedProfile) throw new HttpError(404, "user_not_found", "Usuário não encontrado.");

  const result = await rtdbTransaction<JsonMap>(`users/${input.uid}`, (current) => {
    const profile = asMap(current ?? confirmedProfile);
    const subscription = asMap(profile["subscription"]);
    profile["plan"] = input.planId;
    Object.assign(subscription, {
      status: "active",
      source: "mercado_pago",
      periodStart: now,
      periodEnd,
      updatedAt: now,
    });
    delete subscription["planId"];
    delete subscription["checkoutId"];
    delete subscription["orderId"];
    profile["subscription"] = subscription;
    const usage = asMap(profile["managedUsage"]);
    Object.assign(usage, {
      schemaVersion: 2,
      creditLimit: limit,
      creditsUsed: 0,
      creditsReserved: 0,
      creditsRemaining: limit,
      dailyWindowStart: Math.floor(now / 86_400_000) * 86_400_000,
      dailyCreditsUsed: 0,
      dailyCreditsReserved: 0,
      updatedAt: now,
    });
    profile["managedUsage"] = usage;
    return profile;
  });
  return result.value;
}

export async function setUserPlanByAdmin(uid: string, planId: string) {
  const plan = await getPlan(planId);
  const limit = planCredits(planId, plan);
  const cycleDays = Math.max(1, integer(plan["cycle_days"], 30));
  const now = Date.now();
  const confirmedProfile = await rtdbGet<JsonMap>(`users/${uid}`);
  if (!confirmedProfile) throw new HttpError(404, "user_not_found", "Usuário não encontrado.");
  const result = await rtdbTransaction<JsonMap>(`users/${uid}`, (current) => {
    const profile = asMap(current ?? confirmedProfile);
    profile["plan"] = planId;
    const subscription = asMap(profile["subscription"]);
    Object.assign(subscription, {
      status: planId === "free" ? "none" : "active",
      source: "admin",
      updatedAt: now,
      ...(planId !== "free"
        ? { periodStart: now, periodEnd: now + cycleDays * 86_400_000 }
        : { periodStart: null, periodEnd: null }),
    });
    delete subscription["planId"];
    profile["subscription"] = subscription;
    const usage = asMap(profile["managedUsage"]);
    Object.assign(usage, {
      schemaVersion: 2,
      creditLimit: limit,
      creditsUsed: 0,
      creditsReserved: 0,
      creditsRemaining: limit,
      dailyCreditsUsed: 0,
      dailyCreditsReserved: 0,
      updatedAt: now,
    });
    profile["managedUsage"] = usage;
    const ledger = asMap(profile["serverLedger"]);
    ledger[`admin_plan_${now}`] = {
      kind: "admin_plan_change",
      amount: limit,
      balanceAfter: limit,
      referenceId: `admin:${planId}:${now}`,
      planId,
      createdAt: now,
    };
    profile["serverLedger"] = ledger;
    return profile;
  });
  return result.value;
}

export async function adjustUserCreditsByAdmin(uid: string, delta: number) {
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 10_000_000) {
    throw new HttpError(400, "invalid_credit_adjustment", "Ajuste de créditos inválido.");
  }
  const now = Date.now();
  const confirmedProfile = await rtdbGet<JsonMap>(`users/${uid}`);
  if (!confirmedProfile) throw new HttpError(404, "user_not_found", "Usuário não encontrado.");
  const result = await rtdbTransaction<JsonMap>(`users/${uid}`, (current) => {
    const profile = asMap(current ?? confirmedProfile);
    const usage = asMap(profile["managedUsage"]);
    const limit = Math.max(1, integer(usage["creditLimit"], 500));
    const used = Math.max(0, integer(usage["creditsUsed"], 0));
    const reserved = Math.max(0, integer(usage["creditsReserved"], 0));
    const nextLimit = Math.max(1, limit + delta);
    const nextUsed = Math.min(nextLimit, used);
    const nextReserved = Math.min(reserved, Math.max(0, nextLimit - nextUsed));
    Object.assign(usage, {
      creditLimit: nextLimit,
      creditsUsed: nextUsed,
      creditsReserved: nextReserved,
      creditsRemaining: Math.max(0, nextLimit - nextUsed - nextReserved),
      updatedAt: now,
    });
    profile["managedUsage"] = usage;
    const ledger = asMap(profile["serverLedger"]);
    ledger[`admin_credit_${now}`] = {
      kind: "admin_credit_adjustment",
      amount: delta,
      balanceAfter: usage["creditsRemaining"],
      referenceId: `admin:credits:${now}`,
      createdAt: now,
    };
    profile["serverLedger"] = ledger;
    return profile;
  });
  return result.value;
}
