"""Tiny psql driver + fixture builder for the league server tests (local throwaway cluster only)."""
import json, os, subprocess
HOST = os.environ.get('LGPG_HOST', '/tmp/lgpg_league'); PORT = os.environ.get('LGPG_PORT', '55437'); DB = os.environ.get('LGPG_DB', 'bgqa')
U0 = '00000000-0000-4000-8000-000000000000'   # the commissioner's auth uid

def psql(sql, rollback=True):
    body = "BEGIN;\nSET LOCAL client_min_messages = error;\nSELECT set_config('qa.uid', '%s', true);\n%s\n%s;\n" % (U0, sql, 'ROLLBACK' if rollback else 'COMMIT')
    p = subprocess.run(['psql', '-h', HOST, '-p', PORT, '-U', 'postgres', '-d', DB, '-AtqX', '-v', 'ON_ERROR_STOP=1'],
                       input=body, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip().split('\n')[-1][:600])
    return [l for l in p.stdout.split('\n') if l.strip() != '']

def q1(sql):
    out = psql(sql)
    return out[-1] if out else None

def qj(sql):
    v = q1(sql); return json.loads(v) if v is not None else None

def uid(kind, i):  # deterministic uuids per entity kind
    k = {'user': 1, 'member': 2, 'team': 3, 'week': 4, 'mu': 5, 'season': 6, 'league': 7, 'abs': 8}[kind]
    return '00000000-0000-4000-8%03d-%012d' % (k, i)

PARS18 = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4]
SIS18 = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2]
def rerank(s):
    o = sorted(range(len(s)), key=lambda i: s[i]); r = [0]*len(s)
    for k, i in enumerate(o): r[i] = k + 1
    return r
def snap(holes=18, nine='front'):
    if holes == 18: return {'holes': 18, 'pars': PARS18, 'si': SIS18, 'par': sum(PARS18), 'tee': 'Blue'}
    p = PARS18[:9] if nine == 'front' else PARS18[9:]; s = rerank(SIS18[:9] if nine == 'front' else SIS18[9:])
    return {'holes': 9, 'pars': p, 'si': s, 'par': sum(p), 'tee': 'Blue'}

def J(o): return "'" + json.dumps(o).replace("'", "''") + "'::jsonb"
def A(a): return "ARRAY[%s]::int[]" % ','.join('NULL' if x is None else str(int(x)) for x in a)

class League:
    """Builds INSERTs for a season. members: list of dicts {name, hcp, role?, team?, status?, flight?}"""
    def __init__(self, settings, members, teams=None, sid=1):
        self.sid = uid('season', sid); self.lid = uid('league', sid); self.settings = settings
        self.members = members; self.teams = teams or []; self.sql = []
        self.mid = [uid('member', i) for i in range(len(members))]
        self.tid = [uid('team', i) for i in range(len(self.teams))]
        s = self.sql
        s.append("insert into auth.users(id,email) values ('%s','c@qa.x') on conflict do nothing;" % U0)
        for i in range(1, len(members)):
            s.append("insert into auth.users(id) values ('%s') on conflict do nothing;" % uid('user', i))
        s.append("insert into public.leagues(id,name,commissioner_id) values ('%s','QA League','%s');" % (self.lid, U0))
        s.append("insert into public.league_seasons(id,league_id,name,schedule_mode,start_date,timezone,created_by,settings,status) values ('%s','%s','QA','calendar','2026-09-01','America/Chicago','%s',%s,'active');" % (self.sid, self.lid, U0, J(settings)))
        for i, t in enumerate(self.teams):
            s.append("insert into public.league_teams(id,season_id,name,flight) values ('%s','%s',%s,%s);" % (self.tid[i], self.sid, "'%s'" % t, 'NULL'))
        for i, m in enumerate(members):
            role = m.get('role') or ('commissioner' if i == 0 else 'player')
            user = U0 if i == 0 else uid('user', i)
            team = ("'%s'" % self.tid[m['team']]) if m.get('team') is not None else 'NULL'
            s.append("insert into public.league_members(id,season_id,user_id,display_name,role,status,team_id,flight,left_week) values ('%s','%s','%s','%s','%s','%s',%s,%s,%s);" % (
                self.mid[i], self.sid, user, m['name'], role, m.get('status', 'active'), team,
                m.get('flight') if m.get('flight') is not None else 'NULL', m.get('left_week') or 'NULL'))
        self.weeks = []
    def week(self, wn, sn, status='open', pp=None, playoff=False, finalized_at=None, settings=None):
        wid = uid('week', len(self.weeks) + 1)
        self.weeks.append(wid)
        set_ = settings if settings is not None else self.settings
        self.sql.append("insert into public.league_weeks(id,season_id,week_number,format,status,settings_snapshot,course_snapshot,points_possible,presence_mode,solo_settlement,is_playoff,course_id,finalized_at) values ('%s','%s',%d,'stroke_net','%s',%s,%s,%s,'open','auto',%s,'c1',%s);" % (
            wid, self.sid, wn, status, J(set_), J(sn) if sn else "'{}'::jsonb", 'NULL' if pp is None else pp, 'true' if playoff else 'false',
            ("'%s'" % finalized_at) if finalized_at else 'NULL'))
        return wid
    def hcp(self, wn, i, eff):
        self.sql.append("insert into public.league_handicaps(season_id,member_id,week_number,effective,source) values ('%s','%s',%d,%s,'manual');" % (self.sid, self.mid[i], wn, eff))
    def matchup(self, wid, a, b=None, kind=None, team=False, n=[0]):
        n[0] += 1; muid = uid('mu', n[0])
        ent = (lambda x: self.tid[x]) if team else (lambda x: self.mid[x])
        kind = kind or ('match' if b is not None else 'vs_field')
        self.sql.append("insert into public.league_matchups(id,week_id,entrant_kind,a_entrant_id,b_entrant_id,kind,presence_mode) values ('%s','%s','%s','%s',%s,'%s','open');" % (
            muid, wid, 'team' if team else 'member', ent(a), ("'%s'" % ent(b)) if b is not None else 'NULL', kind))
        return muid
    def card(self, mu, i, gross):
        self.sql.append("select public.league_card_place('%s','%s',%s,NULL,'solo_post',NULL,'{}'::uuid[],'%s',false);" % (U0, mu, A(gross), self.mid[i]))
    def raw_card(self, mu, i, ent, slot, gross, net, source='solo_post'):
        self.sql.append("insert into public.league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,posted_by,posted_at,approved_at,auto_approved) values ('%s','%s','%s',%d,'%s',%s,%s,'%s',now(),now(),true);" % (mu, self.mid[i] if i is not None else 'NULL', ent, slot, source, A(gross), A(net), U0))
    def finalize(self, wid):
        self.sql.append("select public.league_finalize_week('%s');" % wid)
    def text(self, *tail):
        return '\n'.join(self.sql + list(tail))
