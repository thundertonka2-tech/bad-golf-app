#!/usr/bin/env python3
"""
bg_query_lint.py — static check of every Supabase query in the Bad Golf app.

WHY THIS EXISTS
---------------
On 2026-08-19 we proved, against the live database, that all four ways a read can
fail collapse to the same value in this codebase's idiom:

    try { const { data } = await supa.from('t').select('c'); use(data || []); }
    catch (e) {}

    malformed column  ->  []      catch fired: false
    RLS denied        ->  []      catch fired: false
    genuinely empty   ->  []      catch fired: false
    network down      ->  []      catch fired: false

supabase-js does NOT throw for any of them, so the bare `catch (e) {}` is not the
thing hiding bugs -- dropping `error` on the floor is. A query naming a column
that does not exist returns PostgREST 42703 and reads as "no rows", forever,
silently. That is how `t2ListMine`'s tournament_groups.tournament_id branch
returned nothing for months.

Code review cannot catch that class. Tooling can. This script does.

WHAT IT CHECKS
--------------
  1. COLUMNS  -- every column named in .select()/.eq()/.in()/.order()/.insert()/
     .update()/.upsert() exists on the table in bg_schema_snapshot.json.
     Exit code 1 if not. This is the check that would have caught tournament_id.
  2. RPCs     -- every .rpc('name') exists as a function in the snapshot.
  3. TABLES   -- every .from('name') exists.
  4. ERROR-DISCARD (advisory) -- reports read sites that destructure `{ data }`
     without `error`. Not a failure; a ranked worklist.

USAGE
-----
    python3 qa/bg_query_lint.py                     # lints golf-app.html
    python3 qa/bg_query_lint.py www/index.html      # lint the other file
    python3 qa/bg_query_lint.py --audit             # also print the error-discard list

REFRESHING THE SNAPSHOT (do this after any migration)
-----------------------------------------------------
Run in Supabase -> SQL Editor and paste the two results into
bg_schema_snapshot.json ("tables" and "functions"):

    select table_name, string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns where table_schema='public'
    group by table_name order by table_name;

    select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' order by 1;

A snapshot that is stale in the SAFE direction (missing a newly added column)
produces a false positive you will notice immediately. A snapshot that is stale
in the UNSAFE direction cannot happen: a dropped column stays listed, so the
lint passes and you are no worse off than today.
"""

import json
import os
import re
import sys
import bisect
import collections

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SNAPSHOT = os.path.join(HERE, 'bg_schema_snapshot.json')

FILTER_METHODS = ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
                  'contains', 'containedBy', 'overlaps', 'not', 'filter', 'order')
WRITE_METHODS = ('insert', 'update', 'upsert')


# ----------------------------------------------------------------- extraction

def extract_inline_script(path):
    """Pull the inline <script> bodies out of the .html. Returns one string.

    NOTE: you cannot `node --check` the .html directly (ESM extension error) --
    this is the same extraction the release process uses before syntax checks.
    """
    src = open(path, encoding='utf-8', errors='replace').read()
    blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, re.S)
    return '\n'.join(b for b in blocks if len(b) > 1000)


def scan_chain(s, i):
    """From index i (just past `.from('t')`), consume the method chain.

    Walks forward tracking bracket depth and skipping string / comment bodies,
    stopping at a `;` or `,` at depth 0 or when depth would go negative. Good
    enough for the fluent PostgREST builder, which never nests a `.from()` chain
    inside its own arguments.
    """
    depth = 0
    n = len(s)
    start = i
    while i < n:
        c = s[i]
        if c in '"\'`':
            q = c
            i += 1
            while i < n:
                if s[i] == '\\':
                    i += 2
                    continue
                if s[i] == q:
                    break
                i += 1
            i += 1
            continue
        if c == '/' and i + 1 < n and s[i + 1] == '/':
            while i < n and s[i] != '\n':
                i += 1
            continue
        if c == '/' and i + 1 < n and s[i + 1] == '*':
            j = s.find('*/', i + 2)
            i = n if j < 0 else j + 2
            continue
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
            if depth < 0:
                return s[start:i]
        elif c in ';,' and depth == 0:
            return s[start:i]
        i += 1
    return s[start:i]


def split_top(s, sep=','):
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch in '([{':
            depth += 1
        elif ch in ')]}':
            depth -= 1
        if ch == sep and depth == 0:
            out.append(cur)
            cur = ''
        else:
            cur += ch
    if cur.strip():
        out.append(cur)
    return [x.strip() for x in out if x.strip()]


def parse_select(expr, table, tables, out, line):
    """Resolve a PostgREST select string to (table, column) pairs.

    Handles `*`, `alias:col`, `col::cast`, json paths (`data->>x`), count
    aggregates, and embedded resources (`tournament_days(id, play_date)`),
    which re-scope their column list to the embedded table.
    """
    for item in split_top(expr):
        m = re.match(r'^(?:([A-Za-z0-9_]+)\s*:\s*)?([A-Za-z0-9_]+)'
                     r'(?:!\s*[A-Za-z0-9_]+)?\s*\((.*)\)$', item, re.S)
        if m:
            sub, inner = m.group(2), m.group(3)
            if sub in tables:
                parse_select(inner, sub, tables, out, line)
            continue
        if item == '*' or item.startswith('count'):
            continue
        col = item
        if ':' in col and '::' not in col:
            col = col.split(':', 1)[1]
        col = col.split('::')[0].split('->')[0].strip().strip('"')
        col = re.sub(r'!\s*[A-Za-z0-9_]+$', '', col).strip()
        if col and col != '*' and re.match(r'^[A-Za-z0-9_]+$', col):
            out.append((table, col, line, 'select'))


def owner_index(js):
    """Map a character offset to the enclosing top-level function name."""
    decls = []
    for m in re.finditer(r'^\s{0,4}(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(', js, re.M):
        decls.append((m.start(), m.group(1)))
    for m in re.finditer(r'^\s{0,4}(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*'
                         r'(?:async\s*)?(?:function|\()', js, re.M):
        decls.append((m.start(), m.group(1)))
    decls.sort()
    starts = [d[0] for d in decls]

    def owner(pos):
        i = bisect.bisect_right(starts, pos) - 1
        return decls[i][1] if i >= 0 else '<top level>'
    return owner


# ---------------------------------------------------------------------- lint

def lint(path, audit=False):
    snap = json.load(open(SNAPSHOT, encoding='utf-8'))
    tables = {t: set(cols) for t, cols in snap['tables'].items()}
    funcs = set(snap['functions'])

    js = extract_inline_script(path)
    owner = owner_index(js)
    errors, discards = [], []
    refs = 0
    sites = 0

    for m in re.finditer(r"\.from\(\s*['\"]([A-Za-z0-9_]+)['\"]\s*\)", js):
        table = m.group(1)
        sites += 1
        line = js.count('\n', 0, m.start()) + 1
        fn = owner(m.start())

        if table not in tables:
            errors.append((line, fn, 'UNKNOWN TABLE', "%s" % table))
            continue

        chain = scan_chain(js, m.end())
        found = []

        for sm in re.finditer(r"\.select\(\s*(['\"])(.*?)\1", chain, re.S):
            parse_select(sm.group(2), table, tables, found, line)

        for fm in re.finditer(r"\.(%s)\(\s*(['\"])([^'\"]+)\2" % '|'.join(FILTER_METHODS), chain):
            meth, col = fm.group(1), fm.group(3)
            if meth == 'order':
                col = col.split(',')[0].strip()
            if '.' in col:           # embedded-resource filter path, skip
                continue
            if re.match(r'^[A-Za-z0-9_]+$', col):
                found.append((table, col, line, '.' + meth))

        for wm in re.finditer(r'\.(%s)\(\s*\{' % '|'.join(WRITE_METHODS), chain):
            i = wm.end() - 1
            depth = 0
            while i < len(chain):
                if chain[i] == '{':
                    depth += 1
                elif chain[i] == '}':
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            for part in split_top(chain[wm.end() - 1 + 1:i]):
                if part.strip().startswith('...'):
                    continue
                key = part.split(':')[0].strip().strip('\'"')
                if re.match(r'^[A-Za-z0-9_]+$', key):
                    found.append((table, key, line, '.' + wm.group(1)))

        for (t, col, ln, kind) in found:
            refs += 1
            if col not in tables[t]:
                errors.append((ln, fn, 'UNKNOWN COLUMN',
                               '%s.%s  via %s' % (t, col, kind)))

        # advisory: read whose `error` is thrown away
        before = js[max(0, m.start() - 260):m.start()]
        dm = re.search(r'(?:const|let|var)\s*(\{[^}]*\})\s*=\s*(?:await\s+)?[^;]{0,80}$', before)
        if dm:
            keys = [k.split(':')[0].strip() for k in dm.group(1).strip('{}').split(',')]
            if 'error' not in keys and 'data' in keys:
                discards.append((line, fn, table))

    for m in re.finditer(r"\.rpc\(\s*['\"]([A-Za-z0-9_]+)['\"]", js):
        if m.group(1) not in funcs:
            line = js.count('\n', 0, m.start()) + 1
            errors.append((line, owner(m.start()), 'UNKNOWN RPC', m.group(1)))

    name = os.path.relpath(path, REPO)
    print('%s -- %d column refs checked across %d .from() sites'
          % (name, refs, sites))

    if errors:
        print('\n  %d PROBLEM(S) -- these fail silently at runtime:' % len(errors))
        for line, fn, kind, detail in sorted(errors):
            print('    L%-7d %-16s %s  (in %s)' % (line, kind, detail, fn))
    else:
        print('  no unknown tables, columns or RPCs.')

    if audit:
        print('\n  ADVISORY -- %d read sites destructure { data } and drop `error`.' % len(discards))
        print('  A malformed query, an RLS denial and a network failure all read as')
        print('  "no rows" at every one of them. Grouped by function:\n')
        by_fn = collections.defaultdict(list)
        for line, fn, table in discards:
            by_fn[fn].append((line, table))
        for fn in sorted(by_fn):
            print('    %s()' % fn)
            for line, table in sorted(by_fn[fn]):
                print('        L%-7d %s' % (line, table))

    return 1 if errors else 0


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    audit = '--audit' in sys.argv
    targets = args or [os.path.join(REPO, 'golf-app.html')]
    rc = 0
    for t in targets:
        rc |= lint(t if os.path.isabs(t) else os.path.join(REPO, t), audit=audit)
        print()
    sys.exit(rc)
