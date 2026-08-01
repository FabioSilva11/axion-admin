import { createFileRoute } from "@tanstack/react-router";

import { bootstrapUser, walletFromProfile } from "@/lib/accounts.server";
import { jsonError, noStoreJson, requireFirebaseUser } from "@/lib/http.server";

export const Route = createFileRoute("/v1/usage")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireFirebaseUser(request);
          const profile = await bootstrapUser(user.uid, user.email, user.name);
          return noStoreJson({ axion_wallet: walletFromProfile(profile) });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
