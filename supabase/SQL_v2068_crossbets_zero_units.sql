-- v2068 (Tyler 11/25): a cross bet may be set at 0 units (bragging rights). Applied live as migration
-- v2068_crossbets_zero_units. bg_t2_crossbets_add refused value <= 0 as bad_value; now only a negative (or
-- non-numeric) value is refused. In-place, exactly-once replace of that one test.
do $$
declare v_def text; v_n int; v_old text := 'if v_val is null or v_val <= 0 or v_val > 100000 then';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'bg_t2_crossbets_add';
  if v_def is null then raise exception 'bg_t2_crossbets_add not found'; end if;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'expected exactly one value guard, found %', v_n; end if;
  v_def := replace(v_def, v_old, 'if v_val is null or v_val < 0 or v_val > 100000 then');
  execute v_def;
end $$;
