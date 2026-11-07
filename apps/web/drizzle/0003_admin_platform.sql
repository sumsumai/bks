CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entitlements" jsonb NOT NULL,
	"trial_days" integer DEFAULT 14 NOT NULL,
	"stripe_price_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"public" boolean DEFAULT true NOT NULL,
	"highlighted" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "tier" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "tier" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "tier" SET DATA TYPE text USING "tier"::text;--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "tier" SET DEFAULT 'standard';--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "tier" SET DATA TYPE text USING "tier"::text;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "tier" SET DEFAULT 'standard';--> statement-breakpoint
INSERT INTO "plans" ("id","name","description","price_cents","currency","features","entitlements","trial_days","highlighted","sort_order") VALUES
 ('standard','Standard','Everything to run bookings and your AI assistant.',2900,'EUR',
  '["Branded booking page","Unlimited bookings","NanoClaw AI agent","WhatsApp & Telegram","Owner mobile app","1,000 agent conversations / mo"]'::jsonb,
  '{"community":false,"featured":false,"maxStaff":5,"maxConversationsPerMonth":1000,"whatsapp":true,"telegram":true}'::jsonb,14,false,0),
 ('vip','VIP','For established businesses that want more reach and the VIP community.',7900,'EUR',
  '["Everything in Standard","VIP community forum","Exclusive content & announcements","5,000 agent conversations / mo","Featured placement in the marketplace","Priority support"]'::jsonb,
  '{"community":true,"featured":true,"maxStaff":null,"maxConversationsPerMonth":5000,"whatsapp":true,"telegram":true}'::jsonb,14,true,1)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "impersonator_id" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_tier_plans_id_fk" FOREIGN KEY ("tier") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tier_plans_id_fk" FOREIGN KEY ("tier") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
DROP TYPE "public"."tier";