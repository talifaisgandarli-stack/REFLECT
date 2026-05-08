-- US-SYS-01 / PRD §10.2: when a template body changes, auto-extract every
-- {{variable_name}} token and store as a jsonb array in templates.variables.
-- Authors get a free, always-correct registry; consumers iterate the array
-- to render a fill form.

create or replace function public.templates_extract_variables()
returns trigger
language plpgsql
as $$
declare
  v jsonb;
begin
  if new.body is null then
    new.variables := '[]'::jsonb;
    return new;
  end if;

  select coalesce(jsonb_agg(distinct m), '[]'::jsonb)
    into v
  from (
    select (regexp_matches(new.body, '\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}', 'g'))[1] as m
  ) s;

  new.variables := v;
  return new;
end;
$$;

drop trigger if exists templates_extract_vars on templates;
create trigger templates_extract_vars
  before insert or update of body on templates
  for each row execute function public.templates_extract_variables();
