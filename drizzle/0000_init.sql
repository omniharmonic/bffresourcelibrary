CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"dimension_slug" text NOT NULL,
	"tier" integer NOT NULL,
	"description" text,
	"icon" text,
	"is_crisis" boolean DEFAULT false NOT NULL,
	"also_in" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"service_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"source" text NOT NULL,
	"proposed_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewer_id" text,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "decision_trees" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"nodes" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dimensions" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'gap' NOT NULL,
	"title" text NOT NULL,
	"ideas" text,
	"owner" text,
	"status" text DEFAULT 'Not started' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "need_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"phrase" text NOT NULL,
	"category_slug" text NOT NULL,
	"weight" real DEFAULT 0.8 NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"service_id" text NOT NULL,
	"tier" integer NOT NULL,
	"note" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"share_token" text NOT NULL,
	"owner_id" text,
	"for_label" text,
	"show_label" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"intake_text" text,
	"navigator_name" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "plans_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"service_id" text NOT NULL,
	"category_slug" text NOT NULL,
	CONSTRAINT "service_categories_service_id_category_slug_pk" PRIMARY KEY("service_id","category_slug")
);
--> statement-breakpoint
CREATE TABLE "service_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_request_id" integer,
	"actor" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization" text,
	"summary" text,
	"access" text,
	"field_notes" text,
	"internal_notes" text,
	"phone" text,
	"url" text,
	"email" text,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"hours_text" text,
	"schedule" jsonb,
	"eligibility" text,
	"pet_policy" text,
	"police" text,
	"rules" text,
	"rules_url" text,
	"preferred" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"verified_at" timestamp,
	"verified_by" text,
	"verification_note" text,
	"field_sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locked_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'participant' NOT NULL,
	"volunteer_status" text DEFAULT 'none' NOT NULL,
	"display_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_requests_status_idx" ON "change_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "need_terms_cat_idx" ON "need_terms" USING btree ("category_slug");--> statement-breakpoint
CREATE INDEX "plan_items_plan_idx" ON "plan_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "services_status_idx" ON "services" USING btree ("status");