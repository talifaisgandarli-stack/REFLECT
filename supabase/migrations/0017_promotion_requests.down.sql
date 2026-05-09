drop function if exists public.promotion_decide(uuid, promotion_status, text);
alter table if exists promotion_requests rename to _archived_promotion_requests_2026;
drop type if exists promotion_status;
