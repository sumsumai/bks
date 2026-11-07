import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Conventions
// - Every tenant-owned table carries business_id. All reads/writes for a tenant go through
//   lib/tenant.ts, which binds the business id once and never takes it from user or model input.
// - Ids are prefixed random strings (lib/ids.ts), e.g. biz_…, bkg_…
// - Money is integer minor units (cents) + ISO currency on the business.
// ---------------------------------------------------------------------------

const id = () => text("id").primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const businessId = () => text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" });

export const memberRoleEnum = pgEnum("member_role", ["owner", "manager", "staff"]);
export const bookingStatusEnum = pgEnum("booking_status", ["pending", "confirmed", "cancelled", "completed", "no_show"]);
export const bookingSourceEnum = pgEnum("booking_source", ["web", "owner", "agent", "whatsapp", "telegram"]);
export const paymentStatusEnum = pgEnum("payment_status", ["unpaid", "pending", "paid", "refunded"]);
export const channelKindEnum = pgEnum("channel_kind", ["whatsapp", "telegram", "web"]);
export const agentStatusEnum = pgEnum("agent_status", ["provisioning", "active", "paused", "error"]);
export const actionStatusEnum = pgEnum("action_status", [
  "executed",
  "pending_approval",
  "approved",
  "rejected",
  "failed",
  "expired",
]);
export const messageRoleEnum = pgEnum("message_role", ["customer", "agent", "owner", "system"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["open", "escalated", "closed"]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** Platform staff role (see lib/platform-rbac.ts). Null for regular business users. */
    platformRole: text("platform_role", { enum: ["admin", "operator", "support", "finance", "moderator"] }),
    disabled: boolean("disabled").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

/** Web sessions (cookie) and mobile/API tokens (bearer). Only the SHA-256 of the token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["web", "mobile"] }).notNull(),
    /** Set when a platform admin is signed in as this user ("view as"). */
    impersonatorId: text("impersonator_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash)],
);

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("push_tokens_token_uq").on(t.token)],
);

// ---------------------------------------------------------------------------
// Platform configuration (managed from /admin)
// ---------------------------------------------------------------------------

/** Editable platform settings. Secret values are AES-GCM encrypted strings. See lib/settings.ts. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlanEntitlements = {
  /** VIP community forum. */
  community: boolean;
  /** Ranked first in the marketplace with a badge. */
  featured: boolean;
  /** Max active team members (null = unlimited). */
  maxStaff: number | null;
  /** AI agent conversations per calendar month (null = unlimited). */
  maxConversationsPerMonth: number | null;
  whatsapp: boolean;
  telegram: boolean;
};

export const plans = pgTable("plans", {
  /** Stable id, also stored on businesses.tier (e.g. "standard", "vip"). */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull().default(0),
  currency: text("currency").notNull().default("EUR"),
  interval: text("interval", { enum: ["month", "year"] }).notNull().default("month"),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  entitlements: jsonb("entitlements").$type<PlanEntitlements>().notNull(),
  trialDays: integer("trial_days").notNull().default(14),
  stripePriceId: text("stripe_price_id"),
  /** Inactive plans can't be chosen anymore; existing subscribers keep them. */
  active: boolean("active").notNull().default(true),
  /** Shown on the pricing page and in the business billing page. */
  public: boolean("public").notNull().default(true),
  highlighted: boolean("highlighted").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export type BookingPolicy = {
  /** Minimum minutes between now and a bookable slot. */
  minNoticeMinutes: number;
  /** How far ahead customers may book. */
  maxAdvanceDays: number;
  /** Customers may cancel/reschedule themselves until this many hours before. */
  cancellationWindowHours: number;
  /** Slot grid in minutes. */
  slotIntervalMinutes: number;
  /** If false, web/agent bookings start as pending and need owner confirmation. */
  autoConfirm: boolean;
  /** Require online payment at booking time (only when payments are configured). */
  requirePayment: boolean;
  /** Free text shown to customers and fed to the agent. */
  policyText: string;
};

export const DEFAULT_POLICY: BookingPolicy = {
  minNoticeMinutes: 120,
  maxAdvanceDays: 60,
  cancellationWindowHours: 24,
  slotIntervalMinutes: 15,
  autoConfirm: true,
  requirePayment: false,
  policyText: "",
};

export const businesses = pgTable(
  "businesses",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    tagline: text("tagline").notNull().default(""),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("other"),
    city: text("city").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    website: text("website").notNull().default(""),
    timezone: text("timezone").notNull().default("Europe/Paris"),
    currency: text("currency").notNull().default("EUR"),
    locale: text("locale").notNull().default("en"),
    brandColor: text("brand_color").notNull().default("#111827"),
    logoUrl: text("logo_url"),
    coverUrl: text("cover_url"),
    policy: jsonb("policy").$type<BookingPolicy>().notNull().default(DEFAULT_POLICY),
    /** Plan id (plans.id). */
    tier: text("tier").notNull().default("standard").references(() => plans.id, { onUpdate: "cascade" }),
    published: boolean("published").notNull().default(false),
    suspended: boolean("suspended").notNull().default(false),
    onboardingStep: integer("onboarding_step").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("businesses_slug_uq").on(t.slug), index("businesses_category_idx").on(t.category, t.city)],
);

export const memberships = pgTable(
  "memberships",
  {
    businessId: businessId(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const subscriptions = pgTable("subscriptions", {
  businessId: text("business_id")
    .primaryKey()
    .references(() => businesses.id, { onDelete: "cascade" }),
  tier: text("tier").notNull().default("standard").references(() => plans.id, { onUpdate: "cascade" }),
  status: text("status", { enum: ["trialing", "active", "past_due", "canceled"] })
    .notNull()
    .default("trialing"),
  provider: text("provider", { enum: ["test", "stripe"] })
    .notNull()
    .default("test"),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const locations = pgTable("locations", {
  id: id(),
  businessId: businessId(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  createdAt: createdAt(),
});

export const staff = pgTable(
  "staff",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    title: text("title").notNull().default(""),
    bio: text("bio").notNull().default(""),
    color: text("color").notNull().default("#6366f1"),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    locationId: text("location_id").references(() => locations.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("staff_business_idx").on(t.businessId)],
);

export const services = pgTable(
  "services",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default(""),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    priceCents: integer("price_cents").notNull().default(0),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("services_business_idx").on(t.businessId)],
);

export const serviceStaff = pgTable(
  "service_staff",
  {
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.staffId] })],
);

/** Weekly working hours per staff member, in the business's local time. */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: id(),
    businessId: businessId(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(), // 0 = Sunday
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [index("availability_staff_idx").on(t.staffId)],
);

export const timeOff = pgTable("time_off", {
  id: id(),
  businessId: businessId(),
  staffId: text("staff_id").references(() => staff.id, { onDelete: "cascade" }), // null = whole business closed
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull().default(""),
});

// ---------------------------------------------------------------------------
// Customers and bookings
// ---------------------------------------------------------------------------

/** Customers are per business: one business never sees another's customer record. */
export const customers = pgTable(
  "customers",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    telegramChatId: text("telegram_chat_id"),
    whatsappId: text("whatsapp_id"),
    notes: text("notes").notNull().default(""),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    erasedAt: timestamp("erased_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("customers_business_idx").on(t.businessId),
    uniqueIndex("customers_tg_uq").on(t.businessId, t.telegramChatId),
    uniqueIndex("customers_wa_uq").on(t.businessId, t.whatsappId),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    businessId: businessId(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "restrict" }),
    locationId: text("location_id").references(() => locations.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    /** End of the occupied block, including the service buffer. */
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: bookingStatusEnum("status").notNull().default("confirmed"),
    source: bookingSourceEnum("source").notNull().default("web"),
    priceCents: integer("price_cents").notNull().default(0),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),
    notes: text("notes").notNull().default(""),
    cancelReason: text("cancel_reason"),
    /** Random token for the customer's manage link (hash not needed: grants only this booking). */
    manageToken: text("manage_token").notNull(),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bookings_business_time_idx").on(t.businessId, t.startsAt),
    index("bookings_staff_time_idx").on(t.staffId, t.startsAt),
    index("bookings_customer_idx").on(t.customerId),
    // NOTE: the no-overlap guarantee is an exclusion constraint added in migrations/0001 (btree_gist),
    // which drizzle-kit cannot express. See src/db/migrate.ts.
  ],
);

export const payments = pgTable("payments", {
  id: id(),
  businessId: businessId(),
  bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  provider: text("provider", { enum: ["test", "stripe"] }).notNull(),
  providerRef: text("provider_ref"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// NanoClaw agents
// ---------------------------------------------------------------------------

export type AgentPersona = {
  tone: "warm" | "professional" | "playful" | "luxury" | "concise";
  language: string; // default reply language, e.g. "en", "fr"; agent mirrors the customer's language when possible
  formality: "casual" | "neutral" | "formal";
  emoji: boolean;
  greeting: string;
  signature: string;
};

/** Per tool: auto = run immediately, approve = owner must approve first, off = tool unavailable. */
export type AgentPermissions = Record<string, "auto" | "approve" | "off">;

export const agents = pgTable(
  "agents",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    status: agentStatusEnum("status").notNull().default("provisioning"),
    persona: jsonb("persona").$type<AgentPersona>().notNull(),
    instructions: text("instructions").notNull().default(""),
    permissions: jsonb("permissions").$type<AgentPermissions>().notNull(),
    model: text("model").notNull(),
    /** Opaque id of the isolated runtime/memory namespace this agent runs in. */
    runtimeRef: text("runtime_ref").notNull(),
    escalationKeywords: text("escalation_keywords").notNull().default(""),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("agents_business_uq").on(t.businessId)],
);

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: id(),
    businessId: businessId(),
    kind: text("kind", { enum: ["faq", "policy", "document", "note"] }).notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("knowledge_business_idx").on(t.businessId),
    index("knowledge_fts_idx").using("gin", sql`to_tsvector('simple', ${t.title} || ' ' || ${t.content})`),
  ],
);

/** Durable facts the agent learned about a customer (preferences, allergies, favourite stylist…). */
export const customerMemories = pgTable(
  "customer_memories",
  {
    id: id(),
    businessId: businessId(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    fact: text("fact").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("memories_customer_idx").on(t.businessId, t.customerId)],
);

export const channels = pgTable(
  "channels",
  {
    id: id(),
    businessId: businessId(),
    kind: channelKindEnum("kind").notNull(),
    status: text("status", { enum: ["connected", "pairing", "disconnected", "error"] })
      .notNull()
      .default("disconnected"),
    /** WhatsApp phone_number_id, or Telegram bot username. Used to route inbound webhooks. */
    externalId: text("external_id"),
    displayName: text("display_name").notNull().default(""),
    /** What customers use to reach the business: WhatsApp display number, or the Telegram deep link. */
    publicHandle: text("public_handle"),
    /** WhatsApp: "linked_device" (the business's own WhatsApp Business app, linked through the gateway). */
    mode: text("mode"),
    /** Linking in progress: the current QR payload or pairing code, refreshed by the WhatsApp gateway. */
    pairing: jsonb("pairing").$type<{ qr?: string; code?: string; phone?: string; at: string } | null>(),
    /** AES-GCM encrypted JSON of credentials (access token / bot token). Never returned by the API. */
    secretEnc: text("secret_enc"),
    /** Per-channel secret Telegram echoes back in X-Telegram-Bot-Api-Secret-Token. */
    webhookSecret: text("webhook_secret"),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("channels_business_kind_uq").on(t.businessId, t.kind),
    index("channels_external_idx").on(t.kind, t.externalId),
  ],
);

/**
 * Telegram runs as ONE platform bot shared by every business. Each private chat is bound to the business
 * the customer is currently talking to (set by a t.me/<bot>?start=<slug> deep link or the /switch menu).
 */
/**
 * Baileys auth state for each business's linked WhatsApp device (signal keys, creds), written only by
 * the WhatsApp gateway. Values are AES-GCM encrypted with APP_ENCRYPTION_KEY.
 */
export const waAuth = pgTable(
  "wa_auth",
  {
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.key] })],
);

export const telegramChats = pgTable("telegram_chats", {
  chatId: text("chat_id").primaryKey(),
  activeBusinessId: text("active_business_id").references(() => businesses.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    businessId: businessId(),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    channel: channelKindEnum("channel").notNull(),
    /** Telegram chat id / WhatsApp wa_id / web session id. */
    externalThreadId: text("external_thread_id").notNull(),
    status: conversationStatusEnum("status").notNull().default("open"),
    /** When true the agent stays silent and a human answers. */
    humanTakeover: boolean("human_takeover").notNull().default(false),
    /** Last time a human wrote in this conversation (web, mobile, or the WhatsApp Business app). */
    humanActiveAt: timestamp("human_active_at", { withTimezone: true }),
    escalationReason: text("escalation_reason"),
    summary: text("summary").notNull().default(""),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("conversations_thread_uq").on(t.businessId, t.channel, t.externalThreadId),
    index("conversations_recent_idx").on(t.businessId, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    businessId: businessId(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    /** Channel message id for idempotent webhook handling. */
    externalId: text("external_id"),
    authorUserId: text("author_user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("messages_external_uq").on(t.conversationId, t.externalId),
  ],
);

/** Every tool call an agent makes: the audit trail and the approval queue in one. */
export const agentActions = pgTable(
  "agent_actions",
  {
    id: id(),
    businessId: businessId(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    tool: text("tool").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<unknown>(),
    status: actionStatusEnum("status").notNull(),
    summary: text("summary").notNull().default(""),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("actions_business_idx").on(t.businessId, t.status, t.createdAt)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: id(),
    businessId: businessId(),
    kind: text("kind", { enum: ["agent_turn", "message_out", "message_in"] }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("usage_business_idx").on(t.businessId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Notifications and audit
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    businessId: businessId(),
    kind: text("kind").notNull(), // booking.created, approval.requested, conversation.escalated, …
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_business_idx").on(t.businessId, t.createdAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    businessId: text("business_id"),
    actorType: text("actor_type", { enum: ["user", "agent", "customer", "system"] }).notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    target: text("target"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_business_idx").on(t.businessId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// VIP community
// ---------------------------------------------------------------------------

export const forumCategories = pgTable("forum_categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  adminOnlyPosting: boolean("admin_only_posting").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const forumThreads = pgTable(
  "forum_threads",
  {
    id: id(),
    categoryId: text("category_id")
      .notNull()
      .references(() => forumCategories.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorBusinessId: text("author_business_id").references(() => businesses.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    locked: boolean("locked").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("threads_category_idx").on(t.categoryId, t.lastActivityAt)],
);

export const forumPosts = pgTable(
  "forum_posts",
  {
    id: id(),
    threadId: text("thread_id")
      .notNull()
      .references(() => forumThreads.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorBusinessId: text("author_business_id").references(() => businesses.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("posts_thread_idx").on(t.threadId, t.createdAt)],
);

export const forumReports = pgTable("forum_reports", {
  id: id(),
  postId: text("post_id").references(() => forumPosts.id, { onDelete: "cascade" }),
  threadId: text("thread_id").references(() => forumThreads.id, { onDelete: "cascade" }),
  reporterUserId: text("reporter_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: createdAt(),
});

export type Business = typeof businesses.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AgentAction = typeof agentActions.$inferSelect;
export type User = typeof users.$inferSelect;
export type Channel = typeof channels.$inferSelect;
