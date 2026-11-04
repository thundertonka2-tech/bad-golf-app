#!/bin/bash
# S2 fix tests end to end (LOCAL PG16 only):  bash run_all.sh
#   builds  v2009_s2_base  (live bodies + S1 + S2_01/S2_02 schema/helpers only) -> S2 defects must FAIL
#           v2009_s2       (+ S2_03, the fixed bodies)                          -> everything must PASS
D="$(cd "$(dirname "$0")" && pwd)"
python3 "$D/build_S2_03.py" || exit 1
bash "$D/load_schema.sh" v2009_s2 | grep -v NOTICE
bash "$D/make_base.sh" v2009_s2_base
tb=0; tf=0; n=0
for t in "$D"/t/t[0-9]*.sql; do
  b=$("$D/run.sh" v2009_s2_base "$t" | grep -c '^FAIL'); f=$("$D/run.sh" v2009_s2 "$t" | grep -c '^FAIL'); p=$("$D/run.sh" v2009_s2 "$t" | grep -c '^PASS')
  echo "$(basename "$t"): base $b FAIL | fixed $p PASS, $f FAIL"; tb=$((tb+b)); tf=$((tf+f)); n=$((n+p+f))
done
echo "S2: $n checks; fixed $tf FAIL; base $tb FAIL (the defects reproducing)"
