drop index if exists mirai_feed_posts_pending_idx;
alter table mirai_feed_posts drop column if exists rejected_by;
alter table mirai_feed_posts drop column if exists rejected_at;
