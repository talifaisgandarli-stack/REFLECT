-- US-ELAN-02 — explicit reject column for mirai_feed_posts.
-- Previously the UI tried to write the literal string 'rejected' into
-- posted_announcement_id (a uuid FK), which raised a runtime exception and
-- left rejected items stuck in the pending queue forever.

alter table mirai_feed_posts
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references profiles(id) on delete set null;

create index if not exists mirai_feed_posts_pending_idx
  on mirai_feed_posts (fetched_at desc)
  where posted_announcement_id is null and rejected_at is null;
