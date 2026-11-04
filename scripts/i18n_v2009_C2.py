#!/usr/bin/env python3
"""v2009 C2 (Tyler, 11/3): translations for the new league side-games / junk copy (JUNK_SPEC 5.8).

Additive and idempotent: adds each key to i18n/<lang>.json and www/i18n/<lang>.json (the shipped app
dictionaries, "x" exact map) and to scripts/i18n/overrides.json so a later build_i18n.py run keeps
them. Never removes or rewrites an existing key. Game and junk names stay English (GLOSSARY rule 1);
units wording only (GLOSSARY rule 3: no betting / money words).

    python3 scripts/i18n_v2009_C2.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ['es', 'ko', 'ja', 'zh']

T = {
    'Played as a league weekly prize pool': {
        'es': 'Se juega como bolsa de premios semanal de la liga',
        'ko': '리그 주간 프라이즈 풀로 진행돼요',
        'ja': 'リーグの週間プライズプールとして実施',
        'zh': '作为联赛每周奖池进行',
    },
    'Off while the GIR Pool is on': {
        'es': 'Desactivado mientras el GIR Pool está activo',
        'ko': 'GIR Pool이 켜져 있는 동안 꺼짐',
        'ja': 'GIR Pool がオンの間はオフ',
        'zh': 'GIR Pool 开启时关闭',
    },
    'Off while GIR junk is on': {
        'es': 'Desactivado mientras el Junk GIR está activo',
        'ko': 'GIR Junk가 켜져 있는 동안 꺼짐',
        'ja': 'GIR Junk がオンの間はオフ',
        'zh': 'GIR Junk 开启时关闭',
    },
    'GIR junk is off — the GIR Pool is on': {
        'es': 'El Junk GIR está desactivado: el GIR Pool está activo',
        'ko': 'GIR Junk가 꺼졌어요 — GIR Pool이 켜져 있어요',
        'ja': 'GIR Junk はオフです — GIR Pool がオンです',
        'zh': 'GIR Junk 已关闭 — GIR Pool 已开启',
    },
    'Junk settles inside each group on the night, like any round. It is not part of the league dues or weekly prize pools.': {
        'es': 'El Junk se cuadra dentro de cada grupo esa misma noche, como en cualquier ronda. No forma parte de las cuotas de la liga ni de las bolsas de premios semanales.',
        'ko': 'Junk는 일반 라운드처럼 당일 각 그룹 안에서 정산돼요. 리그 회비나 주간 프라이즈 풀에는 포함되지 않아요.',
        'ja': 'Junk は通常のラウンドと同じく、当日それぞれのグループ内で精算されます。リーグの会費や週間プライズプールには含まれません。',
        'zh': 'Junk 与普通轮次一样，当晚在各组内结算。不计入联赛会费或每周奖池。',
    },
    'Group side games, including Junk, settle inside each round and show on the Unit Totals of that round.': {
        'es': 'Los juegos paralelos del grupo, incluido el Junk, se cuadran dentro de cada ronda y aparecen en los Totales de unidades de esa ronda.',
        'ko': 'Junk를 포함한 그룹 사이드 게임은 각 라운드 안에서 정산되고 그 라운드의 유닛 합계에 표시돼요.',
        'ja': 'Junk を含むグループのサイドゲームは各ラウンド内で精算され、そのラウンドのユニット合計に表示されます。',
        'zh': '包括 Junk 在内的小组附加游戏在各轮内结算，并显示在该轮的单位合计中。',
    },
    'Junk is allowed too, and settles inside each group on the night like any round. It is not part of the league fee or the weekly prize pools. A scramble league has no Junk, and GIR junk and the GIR Pool are one or the other.': {
        'es': 'También se permite el Junk, y se cuadra dentro de cada grupo esa misma noche como en cualquier ronda. No forma parte de la cuota de la liga ni de las bolsas de premios semanales. Una liga de Scramble no tiene Junk, y el Junk GIR y el GIR Pool son uno u otro.',
        'ko': 'Junk도 가능하며 일반 라운드처럼 당일 각 그룹 안에서 정산돼요. 리그 회비나 주간 프라이즈 풀에는 포함되지 않아요. Scramble 리그에는 Junk가 없고, GIR Junk와 GIR Pool은 둘 중 하나만 할 수 있어요.',
        'ja': 'Junk も利用でき、通常のラウンドと同じく当日それぞれのグループ内で精算されます。リーグの会費や週間プライズプールには含まれません。Scramble リーグには Junk はなく、GIR Junk と GIR Pool はどちらか一方のみです。',
        'zh': '也可以玩 Junk，与普通轮次一样当晚在各组内结算。不计入联赛会费或每周奖池。Scramble 联赛没有 Junk，GIR Junk 与 GIR Pool 只能二选一。',
    },
}

FORBIDDEN = ['apuesta', 'apostar', 'pagar', 'dinero', 'plata', '베팅', '내기', '돈', '도박', '賭け', '賭ける', 'お金', 'ギャンブル', '赌', '下注', '赌注', '钱', '博彩']
KEEP_EN = ['Junk', 'GIR', 'GIR Pool', 'Scramble']


def main():
    for k, tr in T.items():
        for L in LANGS:
            t = tr[L]
            assert not any(w in t for w in FORBIDDEN), (L, k)
            for nm in KEEP_EN:
                if nm in k:
                    assert nm in t, ('game name must stay English', L, nm, t)
    added = 0
    for base in ('i18n', os.path.join('www', 'i18n')):
        for L in LANGS:
            p = os.path.join(ROOT, base, L + '.json')
            d = json.load(open(p, encoding='utf-8'))
            n0 = len(d['x'])
            for k, tr in T.items():
                if k not in d['x']:
                    d['x'][k] = tr[L]
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
        json.dump(ov, f, ensure_ascii=False, indent=1)   # the file's own style (1-space, no trailing newline)
    print('i18n v2009 C2: %d dictionary entries added' % added)


if __name__ == '__main__':
    main()
