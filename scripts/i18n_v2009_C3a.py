#!/usr/bin/env python3
"""v2009 C3a (Tyler, 11/3): translations for the launch / scorecard / week-screen copy from patch_v2009_C3a.py.

Same contract as i18n_v2009_C1.py: additive and idempotent, adds each key to i18n/<lang>.json and
www/i18n/<lang>.json ("x" exact map, "p" patterns) and to scripts/i18n/overrides.json. Never removes or
rewrites an existing key. Units wording only (no betting words).

    python3 scripts/i18n_v2009_C3a.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ['es', 'ko', 'ja', 'zh']
FORBIDDEN = ['apuesta', '베팅', '賭け', '赌', 'bet ']

T = {
    'In (2nd)': {'es': 'Vuelta (2.ª)', 'ko': '후반 (2회차)', 'ja': 'イン（2周目）', 'zh': '后九（第2轮）'},
    'A player who left early has a league card too: the holes he played, then net double bogey': {
        'es': 'Un jugador que se fue antes también tiene tarjeta de liga: los hoyos que jugó y luego doble bogey neto',
        'ko': '일찍 떠난 선수도 리그 카드가 있어요: 플레이한 홀, 그 뒤로는 넷 더블 보기',
        'ja': '途中で抜けた選手にもリーグのカードがあります：プレーしたホール、その後はネットダブルボギー',
        'zh': '提前离场的球员也有联赛记分卡：已打的洞，之后按净双柏忌计'},
}
PATS = {
    'That group has {0} players and a scorecard holds {1}. Split it into two carts on the week screen, then start each one.': {
        'es': 'Ese grupo tiene {0} jugadores y una tarjeta admite {1}. Divídelo en dos carritos en la pantalla de la semana y luego empieza cada uno.',
        'ko': '그 그룹은 {0}명이고 스코어카드는 {1}명까지예요. 주간 화면에서 카트 두 개로 나눈 뒤 각각 시작하세요.',
        'ja': 'そのグループは{0}人で、スコアカードは{1}人までです。週の画面で2台のカートに分けてから、それぞれ開始してください。',
        'zh': '该组有{0}名球员，一张记分卡最多{1}人。请在本周页面分成两辆球车，然后分别开始。'},
    'Week {0} couldn’t open: its course card couldn’t be read. Open it from the week screen.': {
        'es': 'La semana {0} no pudo abrirse: no se pudo leer la tarjeta del campo. Ábrela desde la pantalla de la semana.',
        'ko': '{0}주차를 열 수 없었어요: 코스 카드를 읽지 못했어요. 주간 화면에서 여세요.',
        'ja': '第{0}週を開けませんでした：コースのカードを読み込めませんでした。週の画面から開いてください。',
        'zh': '第{0}周无法开启：无法读取球场记分卡。请从本周页面开启。'},
    'Closest to the pin · hole {0} (second loop)': {
        'es': 'Más cerca del pin · hoyo {0} (segunda vuelta)', 'ko': '니어핀 · {0}번 홀 (두 번째 바퀴)',
        'ja': 'ニアピン · {0}番ホール（2周目）', 'zh': '最近洞奖 · 第{0}洞（第二轮）'},
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
    print('i18n v2009 C3a: %d dictionary entries added' % added)


if __name__ == '__main__':
    main()
