ALTER TYPE "public"."notification_type" ADD VALUE 'WINDOWED_DIGEST';--> statement-breakpoint
CREATE TABLE "email_daily_budget" (
	"date_utc" date PRIMARY KEY NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "digest_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_digest_id_notifications_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;