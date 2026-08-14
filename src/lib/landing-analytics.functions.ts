import { createServerFn } from "@tanstack/react-start";

export const getLandingAnalytics = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin-session.server");
  await requireAdmin();
  const { readLandingAnalytics } = await import("./landing-analytics.server");
  return readLandingAnalytics();
});
