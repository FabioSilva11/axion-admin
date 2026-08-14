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
  planId: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_-]+$/),
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

const ProviderFields = z.object({
  providerId: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  baseUrl: z.string().trim().url().max(2_048),
  apiKey: z.string().trim().min(1).max(4_096),
});

export const DiscoverProviderModelsInput = ProviderFields;

// Planos nos quais o provedor disponibiliza todos os seus modelos.
export const ProviderPlanValues = z.enum(["free", "paid", "all"]);

export const SaveProviderModelsInput = ProviderFields.extend({
  availablePlans: ProviderPlanValues,
  modelIds: z.array(z.string().trim().min(1).max(160)).min(1).max(250),
});

export const SaveProviderInput = z.object({
  providerId: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  baseUrl: z.string().trim().url().max(2_048),
  apiKey: z.string().trim().max(4_096),
  enabled: z.boolean(),
  availablePlans: ProviderPlanValues,
});

export const ProviderDeleteInput = z.object({
  providerId: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_-]+$/),
});

export const ProviderModelImportInput = ProviderDeleteInput.extend({
  modelIds: z.array(z.string().trim().min(1).max(160)).min(1).max(250),
});

const ModelIdentifier = z
  .string()
  .trim()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9_-]+$/);

// O plano e a disponibilidade de um modelo são SEMPRE herdados do provedor:
// o formulário não envia `minPlan` nem `active`.
export const SaveModelInput = z.object({
  id: ModelIdentifier,
  displayName: z.string().trim().min(2).max(160),
  providerId: ModelIdentifier,
  upstreamModel: z.string().trim().min(1).max(160),
  inputUsdPerMillion: z.number().min(0).max(1_000_000),
  outputUsdPerMillion: z.number().min(0).max(1_000_000),
  inputCreditsPer1k: z.number().min(0).max(1_000_000),
  outputCreditsPer1k: z.number().min(0).max(1_000_000),
  defaultMaxOutputTokens: z.number().int().min(1).max(1_000_000),
  maxTokensField: z.enum(["max_tokens", "max_completion_tokens"]),
});
