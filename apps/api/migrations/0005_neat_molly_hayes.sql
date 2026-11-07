ALTER TABLE "comments" DROP CONSTRAINT "comments_parent_id_comments_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "comments_id_post_idx" ON "comments" USING btree ("id","post_id");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_post_fk" FOREIGN KEY ("parent_id","post_id") REFERENCES "public"."comments"("id","post_id") ON DELETE cascade ON UPDATE no action;