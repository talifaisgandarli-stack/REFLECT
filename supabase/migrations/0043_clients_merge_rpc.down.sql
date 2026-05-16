-- 0043 down — drop the merge RPC. Already-merged data stays in place.

drop function if exists clients_merge(uuid, uuid);
