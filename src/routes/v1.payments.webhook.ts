import { createFileRoute } from "@tanstack/react-router";

import { jsonError } from "@/lib/http.server";
import { processMercadoPagoWebhook } from "@/lib/payments.server";

export const Route = createFileRoute("/v1/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await processMercadoPagoWebhook(request);
          return new Response(null, { status: 200 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
