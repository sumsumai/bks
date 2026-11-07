CREATE TABLE "telegram_chats" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"active_business_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_auth" (
	"business_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_auth_business_id_key_pk" PRIMARY KEY("business_id","key")
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "public_handle" text;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "pairing" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "human_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_active_business_id_businesses_id_fk" FOREIGN KEY ("active_business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_auth" ADD CONSTRAINT "wa_auth_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;