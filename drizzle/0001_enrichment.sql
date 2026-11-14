ALTER TABLE "services" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "source_page_hash" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "source_checked_at" timestamp;