import { createFileRoute } from "@tanstack/react-router";

import { jsonError, noStoreJson, requireFirebaseUser } from "@/lib/http.server";
import { getCheckoutForUser } from "@/lib/payments.server";

export const Route = createFileRoute("/v1/payments/checkouts/$checkoutId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const user = await requireFirebaseUser(request);
          if (!/^[a-f0-9]{32}$/.test(params.checkoutId)) {
            return Response.json(
              { error: { code: "invalid_checkout", message: "Pagamento inválido." } },
              { status: 400 },
            );
          }
          const checkout = await getCheckoutForUser(params.checkoutId, user.uid, true);
          return noStoreJson({ checkout });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
