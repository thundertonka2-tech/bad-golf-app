#!/usr/bin/env python3
"""v2009 C3b (Tyler, 11/3): translations for the new league standings / week-board / money copy.

Additive and idempotent (same pattern as i18n_v2009_C2.py): adds each key to i18n/<lang>.json (and
www/i18n/<lang>.json when that folder exists) and to scripts/i18n/overrides.json. Never removes or rewrites
an existing key. Game names stay English (GLOSSARY rule 1); units wording only (rule 3).

    python3 scripts/i18n_v2009_C3b.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ['es', 'ko', 'ja', 'zh']

T = {
    'A query on': {'es': 'Una consulta sobre', 'ko': '다음에 대한 문의:', 'ja': '次への問い合わせ:', 'zh': '关于以下内容的疑问：'},
    'Couldn’t save the tie': {'es': 'No se pudo guardar el empate', 'ko': '동점을 저장하지 못했어요', 'ja': '同点を保存できませんでした', 'zh': '无法保存平局'},
    'Every card posted, week by week, ranked': {'es': 'Cada tarjeta enviada, semana a semana, clasificada', 'ko': '제출된 모든 카드, 주별 순위', 'ja': '提出された全カードを週ごとに順位付け', 'zh': '每周提交的所有记分卡，按排名'},
    'Halved ·': {'es': 'Empatado ·', 'ko': '무승부 ·', 'ja': '引き分け ·', 'zh': '打平 ·'},
    'It was an exact tie — split it': {'es': 'Fue un empate exacto: repártelo', 'ko': '완전한 동점이에요 — 나누기', 'ja': '完全な同点 — 分ける', 'zh': '完全平局 — 平分'},
    'Not counted: week': {'es': 'No cuenta: semana', 'ko': '집계 안 됨: 주', 'ja': '集計外: 週', 'zh': '不计入：第几周'},
    'Playoff champion': {'es': 'Campeón de playoffs', 'ko': '플레이오프 챔피언', 'ja': 'プレーオフ優勝', 'zh': '季后赛冠军'},
    'Reopen requested — the results stand until the commissioner reopens the week': {
        'es': 'Reapertura solicitada: los resultados se mantienen hasta que el comisionado reabra la semana',
        'ko': '재오픈 요청됨 — 커미셔너가 주를 다시 열 때까지 결과는 유지돼요',
        'ja': '再オープン申請中 — コミッショナーが週を再オープンするまで結果はそのままです',
        'zh': '已申请重新开放 — 在联盟负责人重新开放本周前，结果保持不变'},
    'Season prize pool — pending': {'es': 'Bolsa de premios de la temporada: pendiente', 'ko': '시즌 프라이즈 풀 — 대기 중', 'ja': 'シーズンのプライズプール — 保留中', 'zh': '赛季奖池 — 待定'},
    'The league': {'es': 'La liga', 'ko': '리그', 'ja': 'リーグ', 'zh': '联赛'},
    'Tie saved — the pot splits': {'es': 'Empate guardado: la bolsa se reparte', 'ko': '동점 저장됨 — 풀을 나눠요', 'ja': '同点を保存 — プールを分けます', 'zh': '平局已保存 — 奖池平分'},
}
FORBIDDEN = ['apuesta', 'apostar', 'pagar', 'dinero', 'plata', '베팅', '내기', '돈', '도박', '賭け', '賭ける', 'お金', 'ギャンブル', '赌', '下注', '赌注', '钱', '博彩']


def main():
    for k, tr in T.items():
        for L in LANGS:
            assert not any(w in tr[L] for w in FORBIDDEN), (L, k)
    added = 0
    for base in ('i18n', os.path.join('www', 'i18n')):
        if not os.path.isdir(os.path.join(ROOT, base)):
            continue
        for L in LANGS:
            p = os.path.join(ROOT, base, L + '.json')
            if not os.path.exists(p):
                continue
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
        json.dump(ov, f, ensure_ascii=False, indent=1)
    print('i18n v2009 C3b: %d dictionary entries added' % added)


if __name__ == '__main__':
    main()
