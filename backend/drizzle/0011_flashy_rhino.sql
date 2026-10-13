CREATE TYPE "public"."beta_feedback_category" AS ENUM('JOB_RELEVANCE', 'JOB_CLOSED', 'WRONG_ROLE', 'WRONG_LOCATION', 'WRONG_EXPERIENCE', 'WORKPLACE_MISMATCH', 'APPLICATION_URL_PROBLEM', 'GENERAL_FEEDBACK', 'OTHER');--> statement-breakpoint
CREATE TABLE "beta_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"category" "beta_feedback_category" NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_beta_user" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "beta_feedback" ADD CONSTRAINT "beta_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_feedback" ADD CONSTRAINT "beta_feedback_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beta_feedback_user_id_idx" ON "beta_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "beta_feedback_job_id_idx" ON "beta_feedback" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "beta_feedback_category_idx" ON "beta_feedback" USING btree ("category");