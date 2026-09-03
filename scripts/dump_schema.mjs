#!/usr/bin/env node
/**
 * Bad Golf — live schema snapshot.
 *
 * WHY THIS EXISTS
 * The server half of Bad Golf lives in Postgres, not in this repo. As of
 * 2026-09-03 the live database had 204 migrations applied; supabase/ held 9
 * .sql files, the newest dated 19 August. 144 migrations — including the whole
 * league system, every league_* function and every RLS policy behind it — had
 * no copy in git at all. If a function were dropped or the project lost, there
 * was nothing to restore from.
 *
 * This writes that missing copy. Run it after any migration and commit the
 * result; the diff then shows exactly what changed on the server, which is the
 * other thing the repo could never show you.
 *
 * IT DOES NOT DUMP DATA. Schema only — no rows, ever.
 *
 * USAGE
 *   npm i pg                       # once; or: npm i --no-save pg
 *   node scripts/dump_schema.mjs "postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres"
 *
 * or put the connection string in the environment and just run it:
 *   export SUPABASE_DB_URL="postgresql://..."
 *   node scripts/dump_schema.mjs
 *
 * The connection string is in the Supabase dashboard under
 *   Project Settings -> Database -> Connection string -> URI
 * Use the direct connection (port 5432), not the pooler.
 *
 * NEVER commit the connection string. It is a password. Pass it on the command
 * line or via the environment; this script never writes it to the output.
 *
 *   --all      also dump the ~140 scratch/backup tables (zz_*, bg_backup_*,
 *              _cowork_*, bg_tmp_* …). Off by default: they are leftovers from
 *              past data-cleanup sessions, not schema.
 *   --out FILE write somewhere other than supabase/schema_snapshot.sql
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let pg;
try {
  pg = require('pg');
} catch (e) {
  console.error('\n  The "pg" package is not installed.\n');
  console.error('    npm i --no-save pg\n');
  process.exit(1);
}

const args = process.argv.slice(2);
const INCLUDE_ALL = args.includes('--all');
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1]
                        : path.join('supabase', 'schema_snapshot.sql');
const CONN = args.find(a => a.startsWith('postgres')) || process.env.SUPABASE_DB_URL;

if (!CONN) {
  console.error('\n  No connection string.\n');
  console.error('    node scripts/dump_schema.mjs "postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres"');
  console.error('  or set SUPABASE_DB_URL.\n');
  process.exit(1);
}

// Scratch and backup tables: leftovers from data-cleanup sessions. Skipped
// unless --all, so the snapshot is the schema and not the archaeology.
const SCRATCH = "c.relname !~ '^(zz_|_?bg_backup|bg_bk_|bg_tmp_|bg_r_|_cowork|bg_dupemerge|bg_gregmerge|bg_gregcard|bg_tylermerge|bg_seniorsunday_bk|bg_lost|bg_ns2|bg_city|bg_hist|bg_tn|bg_restore|bg_fwc_fill|bg_modal_money)'";
const TFILTER = INCLUDE_ALL ? 'true' : SCRATCH;

const Q = {
  tables: `
    select c.relname as name,
           'CREATE TABLE IF NOT EXISTS public.'||quote_ident(c.relname)||' ('||E'\\n  '||
           string_agg(quote_ident(a.attname)||' '||format_type(a.atttypid,a.atttypmod)
             ||coalesce(' DEFAULT '||pg_get_expr(ad.adbin,ad.adrelid),'')
             ||case when a.attnotnull then ' NOT NULL' else '' end,
             E',\\n  ' order by a.attnum)||E'\\n);' as ddl
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum
    where n.nspname='public' and c.relkind='r' and ${TFILTER}
    group by c.relname order by c.relname`,

  constraints: `
    select 'ALTER TABLE public.'||quote_ident(c.relname)||' ADD CONSTRAINT '
           ||quote_ident(co.conname)||' '||pg_get_constraintdef(co.oid)||';' as ddl
    from pg_constraint co
    join pg_class c on c.oid=co.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and ${TFILTER}
    order by c.relname, co.conname`,

  indexes: `
    select i.indexdef||';' as ddl
    from pg_indexes i
    join pg_class c on c.relname=i.tablename
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    where i.schemaname='public' and ${TFILTER}
      and not exists (select 1 from pg_constraint co
                       where co.conrelid=c.oid and co.conname=i.indexname)
    order by i.tablename, i.indexname`,

  functions: `
    select p.proname as name, pg_get_functiondef(p.oid)||';' as ddl
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind in ('f','p')
      and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
    order by p.proname, p.oid`,

  triggers: `
    select pg_get_triggerdef(t.oid)||';' as ddl
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal and ${TFILTER}
    order by c.relname, t.tgname`,

  rls: `
    select 'ALTER TABLE public.'||quote_ident(c.relname)||' ENABLE ROW LEVEL SECURITY;' as ddl
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity and ${TFILTER}
    order by c.relname`,

  policies: `
    select 'CREATE POLICY '||quote_ident(p.policyname)||' ON public.'||quote_ident(p.tablename)
           ||' AS '||p.permissive||' FOR '||p.cmd
           ||' TO '||array_to_string(p.roles, ', ')
           ||coalesce(E'\\n  USING ('||p.qual||')','')
           ||coalesce(E'\\n  WITH CHECK ('||p.with_check||')','')||';' as ddl
    from pg_policies p
    join pg_class c on c.relname=p.tablename
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    where p.schemaname='public' and ${TFILTER}
    order by p.tablename, p.policyname`,

  // Grants are the security surface. Q-1 in the league work was a grant bug
  // (league_post_card was executable by `authenticated` when it should not have
  // been), so a snapshot without them would miss the class of thing most worth
  // catching in a diff.
  fn_grants: `
    select 'GRANT '||g.privilege_type||' ON FUNCTION public.'||quote_ident(p.proname)
           ||'('||pg_get_function_identity_arguments(p.oid)||') TO '
           ||quote_ident(g.grantee)||';' as ddl
    from information_schema.role_routine_grants g
    -- information_schema spells specific_name as "<proname>_<oid>", which is
    -- NOT a callable signature -- casting it to regprocedure fails with
    -- "expected a left parenthesis". Take the oid off the end instead.
    join pg_proc p on p.oid = (substring(g.specific_name from '[0-9]+$'))::oid
    join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
    where g.specific_schema='public' and g.grantee in ('anon','authenticated','service_role','PUBLIC')
    order by p.proname, g.grantee, g.privilege_type`,

  tbl_grants: `
    select 'GRANT '||g.privilege_type||' ON TABLE public.'||quote_ident(g.table_name)
           ||' TO '||quote_ident(g.grantee)||';' as ddl
    from information_schema.role_table_grants g
    join pg_class c on c.relname=g.table_name
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    where g.table_schema='public'
      and g.grantee in ('anon','authenticated','service_role','PUBLIC')
      and ${TFILTER}
    order by g.table_name, g.grantee, g.privilege_type`,

  migrations: `
    select version||'  '||coalesce(name,'') as ddl
    from supabase_migrations.schema_migrations order by version`,
};

const SECTIONS = [
  ['MIGRATIONS APPLIED (for reference — this list is not executable)', 'migrations', true],
  ['TABLES', 'tables', false],
  ['CONSTRAINTS', 'constraints', false],
  ['INDEXES', 'indexes', false],
  ['FUNCTIONS', 'functions', false],
  ['TRIGGERS', 'triggers', false],
  ['ROW LEVEL SECURITY', 'rls', false],
  ['POLICIES', 'policies', false],
  ['FUNCTION GRANTS', 'fn_grants', false],
  ['TABLE GRANTS', 'tbl_grants', false],
];

const { Client } = pg;
const client = new Client({
  connectionString: CONN,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120000,
});

const rule = (s) => '-- ' + '='.repeat(74) + '\n-- ' + s + '\n-- ' + '='.repeat(74);

try {
  await client.connect();
} catch (e) {
  console.error('\n  Could not connect: ' + e.message);
  console.error('  Check the connection string (direct connection, port 5432 — not the pooler).\n');
  process.exit(1);
}

const parts = [];
const counts = {};
let dbName = '', now = '';
try {
  const meta = await client.query('select current_database() db, now()::text ts, version() v');
  dbName = meta.rows[0].db; now = meta.rows[0].ts;

  parts.push(`-- Bad Golf — live schema snapshot
-- Generated by scripts/dump_schema.mjs
-- Database : ${dbName}
-- Taken at : ${now}
-- Scope    : schema only, no data. ${INCLUDE_ALL ? 'ALL tables including scratch/backup.' : 'Scratch/backup tables excluded (--all to include).'}
--
-- This file exists because the server half of Bad Golf lives in Postgres and
-- not in this repo. Re-run the script after any migration and commit the diff.
-- Restoring from it is a manual, considered act -- read it before you run it.
`);

  for (const [title, key, isList] of SECTIONS) {
    let res;
    try {
      res = await client.query(Q[key]);
    } catch (e) {
      parts.push(rule(title) + `\n-- SKIPPED: ${e.message.replace(/\n/g, ' ')}\n`);
      counts[key] = 'error';
      continue;
    }
    counts[key] = res.rows.length;
    parts.push(rule(`${title}  (${res.rows.length})`));
    if (!res.rows.length) { parts.push('-- none\n'); continue; }
    parts.push(res.rows.map(r => (isList ? '--   ' + r.ddl : r.ddl)).join('\n') + '\n');
  }
} finally {
  await client.end();
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, parts.join('\n'), 'utf8');

const bytes = fs.statSync(OUT).size;
console.log('\n  Bad Golf schema snapshot');
console.log('  ' + '-'.repeat(50));
for (const [title, key] of SECTIONS) {
  console.log('   ' + String(counts[key]).padStart(5) + '  ' + title.split(' (')[0].toLowerCase());
}
console.log('  ' + '-'.repeat(50));
console.log('   wrote ' + OUT + '  (' + (bytes / 1024).toFixed(0) + ' KB)');
console.log('   schema only — no rows were read.\n');
