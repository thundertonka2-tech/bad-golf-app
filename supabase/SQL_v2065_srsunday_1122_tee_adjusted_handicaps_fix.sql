-- SR SUNDAY TEAM BEST BALL (8f97887a-1426-405d-a565-ce1c516b5ae6), 2026-11-22 -- data correction, applied live 19:25 UTC
-- Tyler: "We all played from the White and Pops played from the Greens. Our handicaps should have all been
-- adjusted based on our tee." The v2064 launch played the roster number as-is (v1719 rule). Both cards were
-- re-handicapped off the tee (Index x Slope/113 + Rating - Par, Buffalo Creek par 71: White 68.8/124, Green
-- 66.1/113) and a hand-corrected payout map written; the stats trigger mirrored it into player_stats.
-- Backup of the two rows before the change: public.bg_backup_srsunday_1122_games (RLS on, no API access).

create table if not exists public.bg_backup_srsunday_1122_games as
  select code, data, updated_at, now() as backed_up_at from public.games where code in ('PITCH49','WHIFF74');
alter table public.bg_backup_srsunday_1122_games enable row level security;

with ch as (
  select * from (values
    ('PITCH49','t2p0-1795351253033-l2tk',3,130.0),    -- Gregory Jackson  5 -> 3  (White)
    ('PITCH49','t2p1-1795351253033-valf',2,-122.5),   -- Tyler OConnor    4 -> 2  (White)
    ('PITCH49','t2p2-1795351253033-8qcs',3,327.5),    -- Steve Miller     5 -> 3  (White)
    ('PITCH49','t2p3-1795351253033-2owd',9,-62.5),    -- Josh Varnado    10 -> 9  (White)
    ('WHIFF74','t2p0-1795351253273-6rtc',7,-140.0),   -- Frank Lonigro    8 -> 7  (White)
    ('WHIFF74','t2p1-1795351253273-rwo0',9,-42.5),    -- Pops Lonigro    14 -> 9  (Green)
    ('WHIFF74','t2p2-1795351253273-9ivv',16,-90.0)    -- Chris Curry     17 -> 16 (White)
  ) v(code, pid, chcp, net)
), newp as (
  select g.code,
    (select jsonb_agg(
        case when c.pid is not null then p || jsonb_build_object('hcp', c.chcp, 'rawHcp', c.chcp, 'baseHcp', c.chcp, 'eventIndex', (p->>'hcp')::numeric) else p end
        order by o)
     from jsonb_array_elements(g.data->'players') with ordinality x(p, o)
     left join ch c on c.code = g.code and c.pid = p->>'id') as players,
    (select jsonb_object_agg(c.pid, c.net) from ch c where c.code = g.code) as net
  from public.games g where g.code in ('PITCH49','WHIFF74')
)
update public.games g
set data = jsonb_set(jsonb_set(g.data, '{players}', n.players, true), '{settledMoney}',
      jsonb_build_object('net', n.net, 'at', (extract(epoch from now())*1000)::bigint, 'build', 'v2026.11.2064', 'final', true, 'corrected', true,
        'correctedAt', (extract(epoch from now())*1000)::bigint, 'source', 'event',
        'note', 'Tyler 11/22: handicaps tee-adjusted (Index x Slope/113 + Rating - Par; White 68.8/124, Green 66.1/113, par 71) - Gregory 5->3, Tyler 4->2, Steve 5->3, Josh 10->9, Frank 8->7, Pops 14->9, Chris 17->16. Best Ball Pool Gregory/Steve 65 outright. Greenie 2.50 and Birdie Bump field unchanged.'), true),
    updated_at = now()
from newp n where n.code = g.code;

-- Result (zero-sum): Steve +327.50, Gregory +130, Pops -42.50, Josh -62.50, Chris -90, Tyler -122.50, Frank -140.
-- Best Ball Pool: Gregory/Steve 65 (winner), Frank/pops 68, Tyler/Josh 69. Was: 63-63 tie Gregory/Steve & Frank/pops.
