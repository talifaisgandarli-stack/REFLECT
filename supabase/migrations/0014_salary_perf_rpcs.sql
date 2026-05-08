-- US-SAL-02: admin set_salary — no overwrite. Inserts a new row, closes the
-- prior current row's effective_to = effective_from - 1, writes audit_log.
create or replace function public.set_salary(
  p_employee_id   uuid,
  p_amount        numeric,
  p_currency      text,
  p_effective_from date,
  p_components    jsonb default '{}'::jsonb
)
returns salaries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row salaries;
  v_prev_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount_must_be_positive' using errcode = 'P0001';
  end if;
  if p_effective_from is null then
    raise exception 'effective_from_required' using errcode = 'P0001';
  end if;

  -- Close the prior open row, if any: the one whose window covers
  -- effective_from - 1 day.
  select id into v_prev_id
    from salaries
   where employee_id = p_employee_id
     and effective_from < p_effective_from
     and (effective_to is null or effective_to >= p_effective_from)
   order by effective_from desc
   limit 1;

  if v_prev_id is not null then
    update salaries
       set effective_to = p_effective_from - 1
     where id = v_prev_id;
  end if;

  insert into salaries (employee_id, amount, currency, effective_from, components)
    values (p_employee_id, p_amount, coalesce(p_currency, 'AZN'),
            p_effective_from, coalesce(p_components, '{}'::jsonb))
    returning * into v_row;

  insert into audit_log (actor_id, action, resource)
    values (auth.uid(), 'salary.set', 'salaries:' || v_row.id::text);

  return v_row;
end;
$$;

grant execute on function public.set_salary(uuid, numeric, text, date, jsonb) to authenticated;

-- US-PERF-02: admin submit_performance_review — upserts on (employee_id, year),
-- stamps reviewer_id = auth.uid(), pushes an in-app notification to the
-- employee.
create or replace function public.submit_performance_review(
  p_employee_id uuid,
  p_year        int,
  p_score       numeric,
  p_ratings     jsonb,
  p_summary     text
)
returns performance_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row performance_reviews;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_year < 2026 then
    raise exception 'year_before_activation' using errcode = 'P0001';
  end if;
  if p_score < 0 or p_score > 100 then
    raise exception 'score_out_of_range' using errcode = 'P0001';
  end if;

  insert into performance_reviews (employee_id, year, score, ratings, reviewer_id, summary)
    values (p_employee_id, p_year, p_score,
            coalesce(p_ratings, '{}'::jsonb), auth.uid(), p_summary)
  on conflict (employee_id, year) do update
    set score       = excluded.score,
        ratings     = excluded.ratings,
        reviewer_id = excluded.reviewer_id,
        summary     = excluded.summary
  returning * into v_row;

  insert into notifications (user_id, kind, payload)
    values (
      p_employee_id,
      'performance_review',
      jsonb_build_object('year', p_year, 'score', p_score, 'review_id', v_row.id)
    );

  insert into audit_log (actor_id, action, resource)
    values (auth.uid(), 'performance.review', 'performance_reviews:' || v_row.id::text);

  return v_row;
end;
$$;

grant execute on function public.submit_performance_review(uuid, int, numeric, jsonb, text) to authenticated;
