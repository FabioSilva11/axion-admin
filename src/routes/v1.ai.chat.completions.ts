import { createFileRoute } from "@tanstack/react-router";

import { executeManagedChat } from "@/lib/ai-gateway.server";
import { jsonError, noStoreJson, requireFirebaseUser } from "@/lib/http.server";

export const Route = createFileRoute("/v1/ai/chat/completions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireFirebaseUser(request);
          const payload = await executeManagedChat(request, user);
          return noStoreJson(payload);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
