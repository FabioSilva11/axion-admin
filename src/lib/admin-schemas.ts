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

export const UserPlanInput = z.object({
  uid: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  planId: z.enum(["free", "paid"]),
});

export const CreditAdjustmentInput = z.object({
  uid: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  delta: z
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((value) => value !== 0),
});

export const CheckoutSyncInput = z.object({
  checkoutId: z.string().regex(/^[a-f0-9]{32}$/),
});
