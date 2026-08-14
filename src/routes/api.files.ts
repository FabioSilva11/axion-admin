import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  activateLandingFile,
  deleteLandingFile,
  downloadLandingFile,
  listLandingFiles,
  uploadLandingFile,
} from "@/lib/admin-files.server";
import { requireAdminRequest } from "@/lib/admin-session.server";
import { jsonError, noStoreJson } from "@/lib/http.server";

const ListInput = z.object({
  dir: z.string().trim().max(60).default("apk"),
  download: z.string().optional(),
  name: z.string().trim().max(160).optional(),
});

const UploadInput = z.object({
  dir: z.string().trim().max(60).default("apk"),
  name: z.string().trim().max(160),
  size: z.coerce.number().int().min(0).max(5_000_000_000).optional(),
});

const DeleteInput = z.object({
  dir: z.string().trim().max(60).default("apk"),
  name: z.string().trim().max(160),
});

const ActivateInput = z.object({
  dir: z.string().trim().max(60).default("apk"),
  name: z.string().trim().max(160),
});

export const Route = createFileRoute("/api/files")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminRequest(request);
          const url = new URL(request.url);
          const query = ListInput.parse(Object.fromEntries(url.searchParams));
          if (query.download === "1" && query.name) {
            return downloadLandingFile(query.dir, query.name);
          }
          return noStoreJson({ files: listLandingFiles(query.dir) });
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request }) => {
        try {
          await requireAdminRequest(request);
          const url = new URL(request.url);
          const query = UploadInput.parse(Object.fromEntries(url.searchParams));
          const file = await uploadLandingFile(query.dir, query.name, request.body, query.size);
          return noStoreJson({ ok: true, file }, 201);
        } catch (error) {
          return jsonError(error);
        }
      },
      DELETE: async ({ request }) => {
        try {
          await requireAdminRequest(request);
          const url = new URL(request.url);
          const query = DeleteInput.parse(Object.fromEntries(url.searchParams));
          return noStoreJson(deleteLandingFile(query.dir, query.name));
        } catch (error) {
          return jsonError(error);
        }
      },
      PATCH: async ({ request }) => {
        try {
          await requireAdminRequest(request);
          const url = new URL(request.url);
          const query = ActivateInput.parse(Object.fromEntries(url.searchParams));
          return noStoreJson({ ok: true, file: activateLandingFile(query.dir, query.name) });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
