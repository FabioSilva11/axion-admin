import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { bootstrapUser } from "@/lib/accounts.server";
import { jsonError, noStoreJson, requireFirebaseUser } from "@/lib/http.server";
import { createPixCheckout } from "@/lib/payments.server";

const CheckoutInput = z.object({ planId: z.string().trim().regex(/^[a-z0-9_-]{2,80}$/) });

export const Route = createFileRoute("/v1/payments/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireFirebaseUser(request);
          const body = CheckoutInput.parse(await request.json());
          // The UID is taken from the verified Firebase token, never from the request body.
          await bootstrapUser(user.uid, user.email, user.name);
          const checkout = await createPixCheckout({
            uid: user.uid,
            email: user.email ?? "",
            ...(user.name ? { displayName: user.name } : {}),
            planId: body.planId,
          });
          return noStoreJson({ checkout }, 201);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
