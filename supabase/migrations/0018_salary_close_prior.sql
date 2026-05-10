-- US-SAL-02 — when a new salary row is inserted for an employee, the
-- previous open row (effective_to is null) must be closed at the day before
-- the new effective_from. Without this, employees end up with overlapping
-- "current" salaries and audit / payroll math breaks.
--
-- Trigger runs on INSERT so the close happens atomically with the new row.

create or replace function close_prior_salary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update salaries
     set effective_to = (NEW.effective_from - 1)
   where employee_id = NEW.employee_id
     and id <> NEW.id
     and effective_to is null
     and effective_from < NEW.effective_from;
  return NEW;
end;
$$;

drop trigger if exists trg_close_prior_salary on salaries;
create trigger trg_close_prior_salary
  after insert on salaries
  for each row execute function close_prior_salary();
