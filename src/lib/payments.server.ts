import { randomBytes } from "node:crypto";

import MercadoPagoConfig, {
  Order,
  WebhookSignatureValidator,
  type InvalidWebhookSignatureError,
} from "mercadopago";

import { activatePaidPlan, getPlan } from "./accounts.server";
import { rtdbGet, rtdbPatch, rtdbPut } from "./firebase.server";
import { HttpError } from "./http.server";

type JsonMap = Record<string, unknown>;

export type CheckoutRecord = {
  checkoutId: string;
  uid: string;
  planId: string;
  orderId: string;
  paymentId: string;
  status: string;
  statusDetail: string;
  amountCents: number;
  checkoutUrl: string;
  pixCopyPaste: string;
  qrCodeBase64: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  activatedAt?: number;
};

const asMap = (value: unknown): JsonMap =>
  value != null && typeof value === "object" && !Array.isArray(value) ? (value as JsonMap) : {};

const integer = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

async function paymentSettings() {
  const stored = asMap(await rtdbGet("axionSettings/private/mercadoPago"));
  const accessToken =
    process.env["MERCADO_PAGO_ACCESS_TOKEN"]?.trim() || String(stored["accessToken"] ?? "").trim();
  const webhookSecret =
    process.env["MERCADO_PAGO_WEBHOOK_SECRET"]?.trim() ||
    String(stored["webhookSecret"] ?? "").trim();
  const mode = process.env["MERCADO_PAGO_MODE"]?.trim() || String(stored["mode"] ?? "sandbox");
  const expirationMinutes = Math.min(
    43_200,
    Math.max(
      30,
      integer(
        process.env["MERCADO_PAGO_PIX_EXPIRATION_MINUTES"] ?? stored["expirationMinutes"],
        30,
      ),
    ),
  );
  return { accessToken, webhookSecret, mode, expirationMinutes };
}

async function orderClient() {
  const settings = await paymentSettings();
  if (!settings.accessToken) {
    throw new HttpError(
      503,
      "payments_not_configured",
      "O Mercado Pago ainda não foi configurado no servidor.",
    );
  }
  return {
    settings,
    client: new Order(
      new MercadoPagoConfig({ accessToken: settings.accessToken, options: { timeout: 20_000 } }),
    ),
  };
}

export async function createPixCheckout(input: {
  uid: string;
  email: string;
  displayName?: string;
  planId: string;
}) {
  if (input.planId !== "paid") {
    throw new HttpError(400, "plan_not_payable", "Este plano não aceita pagamento.");
  }
  if (!input.email) throw new HttpError(400, "payer_email_required", "E-mail não disponível.");
  const plan = await getPlan(input.planId);
  const amountCents = Math.max(0, integer(plan["price_cents"], 0));
  if (amountCents < 100) {
    throw new HttpError(503, "plan_price_unavailable", "Preço do plano não configurado.");
  }

  const checkoutId = randomBytes(16).toString("hex");
  const idempotencyKey = randomBytes(16).toString("hex");
  const { client, settings } = await orderClient();
  const amount = (amountCents / 100).toFixed(2);
  const expiration = `PT${settings.expirationMinutes}M`;
  const firstName = input.displayName?.trim().split(/\s+/)[0]?.slice(0, 60);
  const response = await client.create({
    body: {
      type: "online",
      processing_mode: "automatic",
      capture_mode: "automatic",
      external_reference: `axion:${checkoutId}`,
      total_amount: amount,
      description: String(plan["name"] ?? "Plano Pago Axion").slice(0, 120),
      expiration_time: expiration,
      payer: { email: input.email, ...(firstName ? { first_name: firstName } : {}) },
      transactions: {
        payments: [
          {
            amount,
            expiration_time: expiration,
            payment_method: { id: "pix", type: "bank_transfer" },
          },
        ],
      },
    },
    requestOptions: { idempotencyKey },
  });

  const orderId = response.id?.trim() ?? "";
  const payment = response.transactions?.payments?.[0];
  const method = payment?.payment_method;
  if (!orderId || !method?.qr_code || !method.ticket_url) {
    throw new HttpError(
      502,
      "invalid_payment_response",
      "Mercado Pago não retornou um Pix válido.",
    );
  }
  const now = Date.now();
  const record: CheckoutRecord = {
    checkoutId,
    uid: input.uid,
    planId: input.planId,
    orderId,
    paymentId: payment?.id ?? "",
    status: response.status ?? payment?.status ?? "action_required",
    statusDetail: response.status_detail ?? payment?.status_detail ?? "waiting_transfer",
    amountCents,
    checkoutUrl: method.ticket_url,
    pixCopyPaste: method.qr_code,
    qrCodeBase64: method.qr_code_base64 ?? "",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + settings.expirationMinutes * 60_000,
  };
  await Promise.all([
    rtdbPut(`axionSettings/private/payments/${checkoutId}`, record),
    rtdbPut(`axionSettings/private/paymentOrders/${orderId}`, checkoutId),
  ]);
  return publicCheckout(record);
}

export async function getCheckoutForUser(checkoutId: string, uid: string, synchronize = true) {
  const record = await rtdbGet<CheckoutRecord>(`axionSettings/private/payments/${checkoutId}`);
  if (!record || record.uid !== uid) {
    throw new HttpError(404, "checkout_not_found", "Pagamento não encontrado.");
  }
  const next =
    synchronize && !isFinal(record.status) ? await synchronizeOrder(record.orderId) : record;
  return publicCheckout(next);
}

export async function synchronizeOrder(orderId: string) {
  const checkoutId = await rtdbGet<string>(`axionSettings/private/paymentOrders/${orderId}`);
  if (!checkoutId) throw new HttpError(404, "order_not_found", "Order não encontrada.");
  const current = await rtdbGet<CheckoutRecord>(`axionSettings/private/payments/${checkoutId}`);
  if (!current) throw new HttpError(404, "checkout_not_found", "Pagamento não encontrado.");
  const { client } = await orderClient();
  const response = await client.get({ id: orderId });
  const payment = response.transactions?.payments?.[0];
  const status = response.status ?? payment?.status ?? current.status;
  const statusDetail = response.status_detail ?? payment?.status_detail ?? current.statusDetail;
  const paidCents = Math.round(
    Number(response.total_paid_amount ?? payment?.paid_amount ?? "0") * 100,
  );
  const now = Date.now();
  const updates: Partial<CheckoutRecord> = { status, statusDetail, updatedAt: now };
  if (isApproved(status, statusDetail) && !current.activatedAt) {
    if (paidCents !== current.amountCents) {
      throw new HttpError(
        409,
        "payment_amount_mismatch",
        "Valor confirmado é diferente do checkout.",
      );
    }
    await activatePaidPlan({
      uid: current.uid,
      checkoutId: current.checkoutId,
      orderId: current.orderId,
      amountCents: current.amountCents,
    });
    updates.activatedAt = now;
  }
  await rtdbPatch(`axionSettings/private/payments/${checkoutId}`, updates as JsonMap);
  return { ...current, ...updates } as CheckoutRecord;
}

export async function processMercadoPagoWebhook(request: Request) {
  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  if (!dataId) throw new HttpError(400, "missing_order_id", "Order ausente.");
  const { webhookSecret } = await paymentSettings();
  if (!webhookSecret) {
    throw new HttpError(503, "webhook_not_configured", "Webhook não configurado.");
  }
  try {
    WebhookSignatureValidator.validate({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId,
      secret: webhookSecret,
      toleranceSeconds: 300,
    });
  } catch (error) {
    const invalid = error as InvalidWebhookSignatureError;
    console.warn("Webhook Mercado Pago rejeitado", invalid.reason ?? "invalid_signature");
    throw new HttpError(401, "invalid_webhook_signature", "Assinatura inválida.");
  }
  await synchronizeOrder(dataId);
}

function publicCheckout(record: CheckoutRecord) {
  return {
    checkoutId: record.checkoutId,
    checkoutUrl: record.checkoutUrl,
    pixCopyPaste: record.pixCopyPaste,
    qrCodeBase64: record.qrCodeBase64,
    status: record.status,
    statusDetail: record.statusDetail,
    expiresAt: record.expiresAt,
    activated: Boolean(record.activatedAt),
  };
}

function isApproved(status: string, detail: string) {
  return status === "processed" && detail === "accredited";
}

function isFinal(status: string) {
  return ["processed", "cancelled", "canceled", "refunded", "expired", "failed"].includes(status);
}
