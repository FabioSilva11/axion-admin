import { createFileRoute } from "@tanstack/react-router";

import { rtdbGet } from "@/lib/firebase.server";
import { jsonError } from "@/lib/http.server";

export const Route = createFileRoute("/v1/plans")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const plans = await rtdbGet<Record<string, Record<string, unknown>>>("config/plans");
          const values = Object.values(plans ?? {})
            .filter((plan) => plan["active"] !== false)
            .map((plan) => ({
              id: String(plan["id"] ?? ""),
              name: String(plan["name"] ?? ""),
              description: String(plan["description"] ?? ""),
              priceCents: Number(plan["price_cents"] ?? 0),
              currencyId: String(plan["currency_id"] ?? "BRL"),
              monthlyCredits: Number(plan["monthly_credits"] ?? 0),
              signupCredits: Number(plan["signup_credits"] ?? 0),
              cycleDays: Number(plan["cycle_days"] ?? 30),
              maxOutputTokens: Number(plan["max_output_tokens"] ?? 1024),
              active: plan["active"] !== false,
            }));
          return Response.json({ plans: values });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
