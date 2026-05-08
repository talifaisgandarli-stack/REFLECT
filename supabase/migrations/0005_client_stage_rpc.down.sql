drop trigger if exists client_interactions_touch on client_interactions;
drop function if exists public.client_interactions_touch_parent();
drop function if exists public.set_client_stage(uuid, client_pipeline_stage, text);
