ALTER TABLE "follows" ADD CONSTRAINT "follows_no_self_follow_check" CHECK ("follows"."follower_id" <> "follows"."following_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('like', 'comment', 'reply', 'follow', 'mention'));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_comments_count_nonnegative_check" CHECK ("posts"."comments_count" >= 0);--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_shares_count_nonnegative_check" CHECK ("posts"."shares_count" >= 0);--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_images_max_count_check" CHECK (cardinality("posts"."images") <= 4);--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_content_or_image_check" CHECK (length(btrim("posts"."content")) > 0 or cardinality("posts"."images") > 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('user', 'admin'));