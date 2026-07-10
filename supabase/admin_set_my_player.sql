-- Admin rename: let an admin / commissioner change ANY account's linked player
-- name (profiles.my_player). Used by the Relink tool and the ?mergeplayer= merge
-- one-shot so consolidating a person (e.g. merging Charlie Baucom + Tar Heel Boy)
-- renames their ACCOUNT everywhere, not just the shared roster. Normal RLS only
-- lets a user rename their OWN row; this SECURITY DEFINER function runs the admin
-- check itself and updates only the my_player column.
--
-- How to run: Supabase dashboard -> SQL Editor -> paste -> Run.

create or replace function public.admin_set_my_player(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- caller must be an admin or commissioner
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','commissioner')
  ) then
    raise exception 'not authorized: admin only';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'name required';
  end if;
  update public.profiles set my_player = btrim(p_name) where id = p_id;
end;
$$;

grant execute on function public.admin_set_my_player(uuid, text) to authenticated;
