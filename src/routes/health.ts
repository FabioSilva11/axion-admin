import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ status: "ok", service: "axion-admin-hub", time: new Date().toISOString() }),
    },
  },
});
