import { z } from "zod";

export const PolicyInput = z.object({
  minNoticeMinutes: z.number().int().min(0).max(10080),
  maxAdvanceDays: z.number().int().min(1).max(365),
  cancellationWindowHours: z.number().int().min(0).max(336),
  slotIntervalMinutes: z.number().int().min(5).max(120),
  autoConfirm: z.boolean(),
  requirePayment: z.boolean(),
  policyText: z.string().max(2000),
});

export const BusinessPatch = z
  .object({
    name: z.string().trim().min(1).max(80),
    tagline: z.string().max(140),
    description: z.string().max(4000),
    category: z.string().max(40),
    city: z.string().max(80),
    phone: z.string().max(40),
    email: z.string().max(200),
    website: z.string().max(200),
    timezone: z.string().max(60),
    currency: z.string().length(3),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logoUrl: z.url().nullable(),
    coverUrl: z.url().nullable(),
    published: z.boolean(),
    policy: PolicyInput,
  })
  .partial();

export const ServiceInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000).default(""),
  category: z.string().max(40).default(""),
  durationMinutes: z.number().int().min(5).max(600),
  bufferMinutes: z.number().int().min(0).max(120).default(0),
  priceCents: z.number().int().min(0).max(10_000_000),
  active: z.boolean().default(true),
  staffIds: z.array(z.string()).optional(),
});

export const HoursInput = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1440), endMinute: z.number().int().min(0).max(1440) }))
  .max(50)
  .refine((h) => h.every((r) => r.endMinute > r.startMinute), "Each range must end after it starts");

export const PersonaInput = z.object({
  tone: z.enum(["warm", "professional", "playful", "luxury", "concise"]),
  language: z.string().min(2).max(10),
  formality: z.enum(["casual", "neutral", "formal"]),
  emoji: z.boolean(),
  greeting: z.string().max(300),
  signature: z.string().max(120),
});

export const AgentPatch = z
  .object({
    name: z.string().trim().min(1).max(60),
    status: z.enum(["active", "paused"]),
    persona: PersonaInput,
    instructions: z.string().max(8000),
    permissions: z.record(z.string(), z.enum(["auto", "approve", "off"])),
    escalationKeywords: z.string().max(500),
  })
  .partial();

export const KnowledgeInput = z.object({
  kind: z.enum(["faq", "policy", "document", "note"]),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(50_000),
});
