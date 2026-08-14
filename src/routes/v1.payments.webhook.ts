import { createFileRoute } from "@tanstack/react-router";

import { jsonError, noStoreJson } from "@/lib/http.server";
import { processMercadoPagoWebhook } from "@/lib/payments.server";

export const Route = createFileRoute("/v1/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await processMercadoPagoWebhook(request);
          return noStoreJson({ ok: true });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
