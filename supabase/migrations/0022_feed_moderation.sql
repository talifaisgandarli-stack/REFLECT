-- US-ELAN-02 — admin moderation queue for MIRAI CMO feed.
-- One RPC promotes a queued mirai_feed_posts row into a published announcement
-- atomically (link via posted_announcement_id). Rejection is a plain DELETE
-- by admin (RLS on mirai_feed_posts already grants admin all).

create or replace function public.approve_feed_post(p_post_id uuid)
returns announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post mirai_feed_posts;
  v_ann  announcements;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  select * into v_post from mirai_feed_posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  if v_post.posted_announcement_id is not null then
    raise exception 'already_posted' using errcode = 'P0001';
  end if;

  insert into announcements (
    title, body, category, mirai_generated, approved, approved_by, published_at
  ) values (
    coalesce(nullif(v_post.summary, ''), v_post.source_url),
    v_post.source_url,
    case v_post.source_kind
      when 'trend'       then 'Trend'
      when 'opportunity' then 'Opportunity'
      else 'Xəbər'
    end,
    true,
    true,
    auth.uid(),
    now()
  )
  returning * into v_ann;

  update mirai_feed_posts
     set posted_announcement_id = v_ann.id
   where id = p_post_id;

  return v_ann;
end;
$$;

grant execute on function public.approve_feed_post(uuid) to authenticated;
