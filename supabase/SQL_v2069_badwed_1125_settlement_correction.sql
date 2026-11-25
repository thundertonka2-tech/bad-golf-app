-- Bad Golf Wednesday 11/25 (731d05ac-1bf6-458f-8898-7dd3b5ec8cc2) -- settlement correction, applied live 23:58 UTC.
-- The v2064 phone that published the payout at 23:49 UTC could not score Kevin (alone in the Quota pool on his cart:
-- the v2067 bug), so its map had Kevin at 0 points, Rolo first outright (208), Rambo/Gregory paid 26 each for second
-- and the Kevin v Rolo quota bet unsettled. Correct result (hand-checked and run through the v2067+ engine):
-- Kevin +3 and Rolo +3 tie for the pool (130 each), nobody paid for second, the cross bet pushes.
-- Backup of the published rows: public.bg_backup_badwed_1125_games (RLS on, no API access).
create table if not exists public.bg_backup_badwed_1125_games as select code, data, updated_at, now() as backed_up_at from public.games where code in ('WEDGE21','TEE75','FORE35','STANCE10');
alter table public.bg_backup_badwed_1125_games enable row level security;
with m as (
  select * from (values
    ('WEDGE21', '{"t2p0-1795630834461-chra":95,"t2p1-1795630834461-fg8x":0,"t2p2-1795630834461-4aag":0}'::jsonb),
    ('TEE75', '{"t2p0-1795630834657-e7jx":-35,"t2p1-1795630834657-cfns":-35,"t2p2-1795630834658-xoiv":95,"t2p3-1795630834658-93tn":-35}'::jsonb),
    ('FORE35', '{"t2p0-1795630834816-9c4t":-35,"t2p1-1795630834816-qa1y":-35,"t2p2-1795630834816-qw9p":30,"t2p3-1795630834816-rg62":-35}'::jsonb),
    ('STANCE10', '{"t2p0-1795630834935-j0bt":-35,"t2p1-1795630834935-9otz":95,"t2p2-1795630834935-2mwb":-35,"t2p3-1795630834935-ftiz":-35}'::jsonb)
  ) v(code, net)
)
update public.games g
set data = jsonb_set(g.data, '{settledMoney}', jsonb_build_object('net', m.net, 'at', (extract(epoch from now())*1000)::bigint, 'build', 'v2026.11.2069', 'final', true, 'corrected', true,
      'correctedAt', (extract(epoch from now())*1000)::bigint, 'source', 'event',
      'note', 'Tyler 11/25: the v2064 phone that published counted Kevin (alone in the Quota pool on his cart) as 0 points. Kevin +3 and Rolo +3 tie for the pool (130 each); Rambo/Gregory +2 unpaid; Kevin v Rolo quota bet pushes. Greenie: Graham #8 #17, Josh #12, nobody on #4.'), true),
    updated_at = now()
from m where m.code = g.code;
-- Result: Kevin +95, Graham +95, Rolo +95, Josh +30, Hunter 0, Michael 0, the other nine -35 each (zero-sum).
