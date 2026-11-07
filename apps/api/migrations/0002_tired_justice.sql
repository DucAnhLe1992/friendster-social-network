CREATE TABLE "session_families" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_families" ADD CONSTRAINT "session_families_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_families_user_idx" ON "session_families" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_families_expiry_idx" ON "session_families" USING btree ("expires_at");--> statement-breakpoint
INSERT INTO "session_families" ("id", "user_id", "expires_at", "created_at")
SELECT "family", "user_id", MAX("expires_at"), MIN("created_at")
FROM "refresh_sessions"
GROUP BY "family", "user_id";--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_family_session_families_id_fk" FOREIGN KEY ("family") REFERENCES "public"."session_families"("id") ON DELETE cascade ON UPDATE no action;