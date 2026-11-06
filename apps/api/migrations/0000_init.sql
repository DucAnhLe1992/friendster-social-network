CREATE TABLE "comment_likes" (
	"comment_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_likes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"post_id" varchar(24) NOT NULL,
	"author_id" varchar(24) NOT NULL,
	"content" varchar(280) NOT NULL,
	"parent_id" varchar(24),
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"pair_key" varchar(49) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_pair_key_unique" UNIQUE("pair_key")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" varchar(24) NOT NULL,
	"following_id" varchar(24) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"owner_id" varchar(24) NOT NULL,
	"path" text NOT NULL,
	"post_id" varchar(24),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(24) NOT NULL,
	"sender_id" varchar(24) NOT NULL,
	"content" varchar(1000) NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"client_id" varchar(36),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipient_id" varchar(24) NOT NULL,
	"sender_id" varchar(24) NOT NULL,
	"type" varchar NOT NULL,
	"post_id" varchar(24),
	"comment_id" varchar(24),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"author_id" varchar(24) NOT NULL,
	"content" varchar(280) DEFAULT '' NOT NULL,
	"images" text[] DEFAULT '{}'::text[] NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"shares_count" integer DEFAULT 0 NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"client_id" varchar(36),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_sessions" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"jti" varchar(36) NOT NULL,
	"family" varchar(36) NOT NULL,
	"issued_at" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone,
	"successor_jti" varchar(36),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_sessions_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"email" varchar(254) NOT NULL,
	"password" varchar NOT NULL,
	"handle" varchar(30) NOT NULL,
	"display_name" varchar(50) NOT NULL,
	"bio" varchar(160) DEFAULT '' NOT NULL,
	"avatar" text DEFAULT '' NOT NULL,
	"cover_image" text DEFAULT '' NOT NULL,
	"location" varchar(30) DEFAULT '' NOT NULL,
	"website" varchar(100) DEFAULT '' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"role" varchar DEFAULT 'user' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_post_created_idx" ON "comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "comments_author_created_idx" ON "comments" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "participants_user_idx" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "follows_following_idx" ON "follows" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "media_unclaimed_idx" ON "media" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messages_unread_idx" ON "messages" USING btree ("conversation_id","is_read","sender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_idx" ON "messages" USING btree ("conversation_id","sender_id","client_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_id","is_read");--> statement-breakpoint
CREATE INDEX "post_likes_user_idx" ON "post_likes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_author_created_idx" ON "posts" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_author_client_idx" ON "posts" USING btree ("author_id","client_id");--> statement-breakpoint
CREATE INDEX "posts_content_search_idx" ON "posts" USING gin (to_tsvector('simple', "content"));--> statement-breakpoint
CREATE INDEX "refresh_sessions_user_idx" ON "refresh_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_sessions_family_idx" ON "refresh_sessions" USING btree ("family");