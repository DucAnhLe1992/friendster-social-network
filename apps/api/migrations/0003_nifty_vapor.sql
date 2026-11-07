CREATE TABLE "file_deletions" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_deletions_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE INDEX "file_deletions_available_idx" ON "file_deletions" USING btree ("available_at","claimed_at");