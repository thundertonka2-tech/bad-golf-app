#!/usr/bin/env python3
"""v2009 F (Tyler, 11/3): translations for patch_v2009_F.py (per-cart shotgun start, create-screen holes list).

Same contract as i18n_v2009_C3a.py: additive and idempotent, adds each key to i18n/<lang>.json and
www/i18n/<lang>.json ("x" exact map, "p" patterns) and to scripts/i18n/overrides.json. Never removes or
rewrites an existing key. Units wording only (no betting words). Format names stay English.

    python3 scripts/i18n_v2009_F.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ['es', 'ko', 'ja', 'zh']
FORBIDDEN = ['apuesta', '베팅', '賭け', '赌', 'bet ']

T = {
    'Starts on hole': {'es': 'Sale en el hoyo', 'ko': '시작 홀', 'ja': 'スタートホール', 'zh': '开球洞'},
    '📣 Shotgun start': {'es': '📣 Salida a escopeta', 'ko': '📣 샷건 스타트', 'ja': '📣 ショットガンスタート', 'zh': '📣 同时开球'},
    '🔢 Spread across the holes': {'es': '🔢 Repartir por los hoyos', 'ko': '🔢 홀마다 나누기', 'ja': '🔢 ホールに振り分ける', 'zh': '🔢 分配到各洞'},
    'Carts spread across the holes ✓': {'es': 'Carritos repartidos por los hoyos ✓', 'ko': '카트를 홀마다 나눴어요 ✓', 'ja': 'カートをホールに振り分けました ✓', 'zh': '球车已分配到各洞 ✓'},
    'Starting hole cleared': {'es': 'Hoyo de salida borrado', 'ko': '시작 홀을 지웠어요', 'ja': 'スタートホールをクリアしました', 'zh': '已清除开球洞'},
    'Each cart tees off from its own hole and plays round to the hole before it. The week’s pots settle once every hole is in.': {
        'es': 'Cada carrito sale desde su propio hoyo y juega la vuelta hasta el hoyo anterior. Los botes de la semana se cierran cuando están todos los hoyos.',
        'ko': '각 카트는 자기 홀에서 출발해 그 앞 홀까지 한 바퀴 돌아요. 이번 주 상금 풀은 모든 홀이 입력되면 정산돼요.',
        'ja': '各カートは自分のホールからスタートし、その前のホールまで一周します。今週のポットは全ホールがそろってから精算されます。',
        'zh': '每辆球车从自己的洞开球，打一圈到它前面那个洞。本周奖池在所有洞都录入后结算。'},
    'Rotate front 9 / back 9 each week': {'es': 'Alternar primeros 9 / últimos 9 cada semana', 'ko': '매주 전반 9 / 후반 9 번갈아', 'ja': '毎週 前半9 / 後半9 を交互に', 'zh': '每周轮换前九 / 后九'},
}
PATS = {
    'Group {0} starts on hole {1}': {'es': 'El grupo {0} sale en el hoyo {1}', 'ko': '{0}조는 {1}번 홀에서 시작', 'ja': 'グループ{0}は{1}番ホールからスタート', 'zh': '第{0}组从第{1}洞开球'},
}


def main():
    for tbl in (T, PATS):
        for k, tr in tbl.items():
            for L in LANGS:
                assert not any(w in tr[L] for w in FORBIDDEN), (L, k)
    added = 0
    for base in ('i18n', os.path.join('www', 'i18n')):
        for L in LANGS:
            p = os.path.join(ROOT, base, L + '.json')
            d = json.load(open(p, encoding='utf-8'))
            n0 = len(d['x'])
            for k, tr in T.items():
                if k not in d['x']:
                    d['x'][k] = tr[L]
            have = set(x[0] for x in d.get('p', []))
            for k, tr in PATS.items():
                if k not in have:
                    d.setdefault('p', []).append([k, tr[L]])
            d['n'] = d.get('n', 0) + (len(d['x']) - n0)
            added += len(d['x']) - n0
            with open(p, 'w', encoding='utf-8', newline='\n') as f:
                json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
    op = os.path.join(ROOT, 'scripts', 'i18n', 'overrides.json')
    ov = json.load(open(op, encoding='utf-8'))
    for k, tr in T.items():
        ov.setdefault(k, {})
        for L in LANGS:
            ov[k].setdefault(L, tr[L])
    with open(op, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(ov, f, ensure_ascii=False, indent=1)
    print('i18n v2009 F: %d dictionary entries added' % added)


if __name__ == '__main__':
    main()
