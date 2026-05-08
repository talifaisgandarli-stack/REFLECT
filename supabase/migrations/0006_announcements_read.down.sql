revoke execute on function public.mark_all_announcements_read() from authenticated;
revoke execute on function public.mark_announcement_read(uuid) from authenticated;
drop function if exists public.mark_all_announcements_read();
drop function if exists public.mark_announcement_read(uuid);
