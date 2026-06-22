-- Critical: portfolio_workflows had no unique(project_id), but closeProject
-- inserts a row unconditionally on every close. A close → reopen → re-close
-- cycle therefore created duplicate rows, and AwardsSection reads the workflow
-- with .maybeSingle() — which throws on multiple rows, breaking the Awards UI.
--
-- Dedupe any existing duplicates (keep the richest row per project: most
-- selected_awards, then earliest id), then enforce one workflow per project.

delete from public.portfolio_workflows
 where id in (
   select id from (
     select id,
            row_number() over (
              partition by project_id
              order by cardinality(selected_awards) desc, id asc
            ) as rn
       from public.portfolio_workflows
   ) ranked
   where ranked.rn > 1
 );

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'portfolio_workflows_project_id_key'
  ) then
    alter table public.portfolio_workflows
      add constraint portfolio_workflows_project_id_key unique (project_id);
  end if;
end $$;
