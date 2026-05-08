-- REQ-TASK-07 — server-side mention parser + notification fan-out.
--
-- PRD line:
--   "Mention `@userId` format inside `task_comments.body`; `mentions[]`
--    populated server-side via parser; mentioned users notified
--    (in-app + Telegram if linked)."
--
-- Per the user decision (logged in commit body), v1 uses plain
-- @<full_name> matching against profiles.full_name (case-insensitive,
-- exact-match per token), populates task_comments.mentions[] with the
-- matched user_id(s), and fans out one notifications row per recipient.
-- Telegram fan-out for mentions is a deferred follow-up.
--
-- Rules enforced server-side:
--   - You cannot self-mention (no notification to the comment author).
--   - Each unique recipient gets exactly one notification per comment.
--   - Ambiguous @<token> (matches >1 profile) is silently dropped — we
--     err on the side of NOT spamming the wrong person.

create or replace function public.parse_task_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  token text;
  matches uuid[];
  resolved uuid[] := '{}';
  recipient uuid;
begin
  -- Extract every @<word> chunk from the body. The regex captures one or
  -- more letters/digits/underscores/dots/dashes after the @, stopping at
  -- whitespace or punctuation. Az + En letters covered via [^\\s,@] — we
  -- exclude space, comma, and @ to avoid runaway tokens.
  for token in
    select (m)[1]
      from regexp_matches(coalesce(new.body, ''), '@([^\s@,;:!?()]+)', 'g') as m
  loop
    -- Try exact case-insensitive full_name match first; if exactly one,
    -- that's the recipient. Anything else (0 or >1) we drop.
    select array_agg(p.id) into matches
      from profiles p
     where p.is_active = true
       and lower(p.full_name) = lower(token);
    if matches is not null and array_length(matches, 1) = 1 then
      resolved := array_append(resolved, matches[1]);
    end if;
  end loop;

  -- Dedupe and drop the comment author.
  new.mentions := (
    select coalesce(array_agg(distinct x), '{}'::uuid[])
      from unnest(resolved) as x
     where x <> new.user_id
  );

  -- Fan out one notification per recipient.
  if new.mentions is not null and array_length(new.mentions, 1) > 0 then
    foreach recipient in array new.mentions loop
      insert into notifications (user_id, kind, payload)
      values (
        recipient,
        'mention',
        jsonb_build_object(
          'task_id', new.task_id,
          'comment_id', new.id,
          'by', new.user_id,
          'preview', left(new.body, 200)
        )
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_task_comments_mention on task_comments;
create trigger trg_task_comments_mention
  before insert on task_comments
  for each row execute function public.parse_task_comment_mentions();
