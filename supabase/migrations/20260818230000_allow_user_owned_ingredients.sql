-- Authenticated users may still create their own ingredient rows deliberately.
-- Service-role hydration (auth.uid() is null) may not expand the shared master list.

begin;

create or replace function public.guard_master_ingredient_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_actor uuid := auth.uid();
begin
  if new.created_by_user_id is not null then
    return new;
  end if;

  -- Explicit client-side creation belongs to that user rather than the global catalogue.
  if v_actor is not null then
    new.created_by_user_id := v_actor;
    return new;
  end if;

  v_existing := public.resolve_canonical_ingredient_id(new.name);
  if v_existing is not null then
    -- A service attempted to create an alias/duplicate of a master ingredient.
    return null;
  end if;

  -- Service-side shopping/product hydration must not invent a new master ingredient.
  return null;
end;
$$;

commit;
