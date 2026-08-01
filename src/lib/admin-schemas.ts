import { z } from "zod";

export const LoginInput = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
});

export const SectionInput = z.object({ section: z.string().trim().min(1).max(60) });

export const RecordInput = z.object({
  section: z.string().trim().min(1).max(60),
  recordId: z.string().trim().max(200).optional(),
  value: z.string().max(200_000),
});

export const DeleteInput = z.object({
  section: z.string().trim().min(1).max(60),
  recordId: z.string().trim().min(1).max(200),
});

