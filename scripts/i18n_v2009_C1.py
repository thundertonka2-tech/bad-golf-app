#!/usr/bin/env python3
"""v2009 C1 (Tyler, 11/3): translations for the new league setup / rules / dues / week-editor copy.

Additive and idempotent, the same contract as i18n_v2009_C2.py: adds each key to i18n/<lang>.json and
www/i18n/<lang>.json ("x" exact map) and to scripts/i18n/overrides.json. Never removes or rewrites an existing
key. Game and format names stay English (GLOSSARY rule 1); units wording only (rule 3: no betting words).

    python3 scripts/i18n_v2009_C1.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ['es', 'ko', 'ja', 'zh']
FORBIDDEN = ['apuesta', '베팅', '賭け', '赌', 'bet ']
KEEP_EN = ['Stroke play', 'Stableford', 'Scramble', 'Team match play', 'Bad Golf', 'Most GIRs', 'Fewest putts']

T = {
    # wizard / checklist
    'to do': {'es': 'pendiente', 'ko': '할 일', 'ja': '未完了', 'zh': '待完成'},
    'Two players a team.': {'es': 'Dos jugadores por equipo.', 'ko': '팀당 두 명이에요.', 'ja': '1チーム2人です。', 'zh': '每队两名球员。'},
    'Percentage, par-3 strokes and max score.': {'es': 'Porcentaje, golpes en los par 3 y puntuación máxima.', 'ko': '비율, 파3 스트로크, 최대 스코어.', 'ja': '割合、パー3のストローク、最大スコア。', 'zh': '比例、三杆洞让杆和最高杆数。'},
    'The games your group plays every week. Saving it empty is fine.': {'es': 'Los juegos que tu grupo juega cada semana. Guardarlo vacío está bien.', 'ko': '그룹이 매주 하는 게임이에요. 비워 두고 저장해도 괜찮아요.', 'ja': 'グループが毎週プレーするゲームです。空のまま保存しても大丈夫です。', 'zh': '你的小组每周玩的游戏。留空保存也可以。'},
    'Stroke play, Stableford, Scramble or Team match play. Set it before the schedule.': {'es': 'Stroke play, Stableford, Scramble o Team match play. Elígelo antes del calendario.', 'ko': 'Stroke play, Stableford, Scramble 또는 Team match play. 일정 전에 정하세요.', 'ja': 'Stroke play、Stableford、Scramble、Team match play のいずれか。スケジュールの前に決めてください。', 'zh': 'Stroke play、Stableford、Scramble 或 Team match play。在排赛程之前设置。'},
    # week editor
    'Change this week': {'es': 'Cambiar esta semana', 'ko': '이번 주 변경', 'ja': '今週を変更', 'zh': '修改本周'},
    'Holes to play': {'es': 'Hoyos a jugar', 'ko': '플레이할 홀', 'ja': 'プレーするホール', 'zh': '要打的洞'},
    'Change course': {'es': 'Cambiar campo', 'ko': '코스 변경', 'ja': 'コースを変更', 'zh': '更换球场'},
    'League course': {'es': 'Campo de la liga', 'ko': '리그 코스', 'ja': 'リーグのコース', 'zh': '联赛球场'},
    'Course set': {'es': 'Campo elegido', 'ko': '코스 설정됨', 'ja': 'コース設定済み', 'zh': '已设置球场'},
    'Start on hole': {'es': 'Empezar en el hoyo', 'ko': '시작 홀', 'ja': '開始ホール', 'zh': '起始洞'},
    'Pick this week’s course': {'es': 'Elige el campo de esta semana', 'ko': '이번 주 코스 선택', 'ja': '今週のコースを選ぶ', 'zh': '选择本周球场'},
    'Only this week moves. The league’s own course is unchanged.': {'es': 'Solo cambia esta semana. El campo de la liga no cambia.', 'ko': '이번 주만 바뀌어요. 리그 코스는 그대로예요.', 'ja': '変わるのは今週だけです。リーグのコースはそのままです。', 'zh': '只改本周。联赛本身的球场不变。'},
    'The league’s course unless you pick another for this week. Handicaps don’t change with it.': {'es': 'El campo de la liga, salvo que elijas otro para esta semana. Los hándicaps no cambian.', 'ko': '이번 주에 다른 코스를 고르지 않으면 리그 코스예요. 핸디캡은 바뀌지 않아요.', 'ja': '今週だけ別のコースを選ばない限りリーグのコースです。ハンディキャップは変わりません。', 'zh': '除非你为本周另选球场，否则就是联赛球场。差点不随之改变。'},
    'Plays all 18 holes in order from here, wrapping round to the hole before it. In a field week a group can be sent off another hole.': {'es': 'Se juegan los 18 hoyos en orden desde aquí, dando la vuelta hasta el hoyo anterior. En una semana de field un grupo puede salir por otro hoyo.', 'ko': '여기서부터 18홀을 순서대로 돌아 바로 앞 홀까지 플레이해요. 필드 주간에는 그룹마다 다른 홀에서 출발할 수 있어요.', 'ja': 'ここから18ホールを順に回り、直前のホールで終わります。フィールドの週はグループごとに別のホールから出られます。', 'zh': '从这里起按顺序打满18洞，绕回到前一洞结束。场地周里每组可以从别的洞出发。'},
    'This week has started, so its course and holes can’t change now. Only the day can move.': {'es': 'Esta semana ya empezó, así que su campo y sus hoyos no pueden cambiar. Solo se puede mover el día.', 'ko': '이번 주가 이미 시작돼서 코스와 홀은 바꿀 수 없어요. 날짜만 옮길 수 있어요.', 'ja': '今週はすでに始まっているので、コースとホールは変更できません。日付だけ動かせます。', 'zh': '本周已经开始，球场和洞不能再改，只能改日期。'},
    'Starts on the back 9': {'es': 'Empieza por los 9 de vuelta', 'ko': '후반 9홀부터 시작', 'ja': 'バック9からスタート', 'zh': '从后九洞开始'},
    'Front 9 twice': {'es': 'Los 9 de ida dos veces', 'ko': '전반 9홀 두 번', 'ja': 'フロント9を2回', 'zh': '前九洞打两遍'},
    'Back 9 twice': {'es': 'Los 9 de vuelta dos veces', 'ko': '후반 9홀 두 번', 'ja': 'バック9を2回', 'zh': '后九洞打两遍'},
    # rules page
    'Weeks that count': {'es': 'Semanas que cuentan', 'ko': '집계되는 주', 'ja': '集計される週', 'zh': '计入的周'},
    'Joining part-way': {'es': 'Unirse a mitad de temporada', 'ko': '시즌 중 합류', 'ja': '途中参加', 'zh': '中途加入'},
    'The fee is prorated by the regular weeks left; the share of the prize pool is the same': {'es': 'La cuota se prorratea por las semanas regulares que quedan; la parte de la bolsa de premios es la misma', 'ko': '참가비는 남은 정규 주 수에 비례해요. 프라이즈 풀 몫은 똑같아요', 'ja': '参加費は残りのレギュラー週で按分されます。プライズプールの取り分は同じです', 'zh': '费用按剩余常规周数折算；奖池份额相同'},
    'A tied skins hole': {'es': 'Un hoyo de skins empatado', 'ko': '동점인 스킨스 홀', 'ja': '引き分けのスキンズホール', 'zh': '平局的 Skins 洞'},
    'Carries to the next hole that night; anything left after the last hole is shared by everyone in the skins': {'es': 'Pasa al siguiente hoyo esa noche; lo que quede tras el último hoyo se reparte entre todos los de skins', 'ko': '그날 밤 다음 홀로 넘어가요. 마지막 홀 뒤에 남은 건 스킨스 참가자 모두가 나눠요', 'ja': 'その夜の次のホールに持ち越し。最終ホール後に残った分はスキンズ参加者全員で分けます', 'zh': '当晚顺延到下一洞；最后一洞后剩下的由所有 Skins 参与者平分'},
    'A prize pool nobody wins': {'es': 'Una bolsa de premios que nadie gana', 'ko': '아무도 따지 못한 프라이즈 풀', 'ja': '誰も取らなかったプライズプール', 'zh': '无人赢得的奖池'},
    'Isn’t charged — nothing carries to next week': {'es': 'No se cobra; nada pasa a la semana siguiente', 'ko': '청구되지 않아요 — 다음 주로 넘어가는 건 없어요', 'ja': '請求されません — 翌週への持ち越しはありません', 'zh': '不收取——不会顺延到下周'},
    'Total net to par over the season — lowest wins': {'es': 'Total neto respecto al par en la temporada; gana el más bajo', 'ko': '시즌 동안의 파 대비 넷 합계 — 가장 낮은 사람이 우승', 'ja': 'シーズン通算のパー比ネット — 最も少ない人が優勝', 'zh': '整季相对标准杆的净杆总数——最低者获胜'},
    'Stableford points — most points takes the most': {'es': 'Puntos Stableford: quien más suma, más se lleva', 'ko': 'Stableford 포인트 — 가장 많은 포인트가 가장 많이 가져가요', 'ja': 'Stableford ポイント — 最多ポイントが最も多く獲得', 'zh': 'Stableford 积分——积分最多者得最多'},
    'Position points — best net takes the most': {'es': 'Puntos por posición: el mejor neto se lleva más', 'ko': '순위 포인트 — 넷이 가장 좋은 사람이 가장 많이 가져가요', 'ja': '順位ポイント — ベストネットが最も多く獲得', 'zh': '名次积分——净杆最好者得最多'},
    'Head-to-head, one player a side': {'es': 'Cara a cara, un jugador por lado', 'ko': '1대1, 한 쪽에 한 명', 'ja': '1対1、各サイド1人', 'zh': '一对一，每方一人'},
    'one ball a team': {'es': 'una bola por equipo', 'ko': '팀당 공 하나', 'ja': '1チーム1球', 'zh': '每队一个球'},
    'both nets added': {'es': 'se suman los dos netos', 'ko': '두 넷을 합산', 'ja': '2人のネットを合計', 'zh': '两人净杆相加'},
    'the better net counts': {'es': 'cuenta el mejor neto', 'ko': '더 좋은 넷이 집계', 'ja': '良い方のネットを採用', 'zh': '取较好的净杆'},
    'Handicap rules': {'es': 'Reglas de hándicap', 'ko': '핸디캡 규칙', 'ja': 'ハンディキャップのルール', 'zh': '差点规则'},
    # handicaps / roster / D11
    'from Bad Golf index — check it': {'es': 'del índice de Bad Golf: revísalo', 'ko': 'Bad Golf 인덱스 기준 — 확인하세요', 'ja': 'Bad Golf インデックスから — 確認してください', 'zh': '来自 Bad Golf 指数——请核对'},
    'carried — check it': {'es': 'arrastrado: revísalo', 'ko': '이월됨 — 확인하세요', 'ja': '引き継ぎ — 確認してください', 'zh': '沿用——请核对'},
    'Handicap from his Bad Golf index — check it; you can change it until he posts': {'es': 'Hándicap de su índice de Bad Golf: revísalo; puedes cambiarlo hasta que entregue su tarjeta', 'ko': 'Bad Golf 인덱스에서 가져온 핸디캡 — 확인하세요. 스코어를 올리기 전까지 바꿀 수 있어요', 'ja': 'Bad Golf インデックスからのハンディキャップ — 確認してください。スコア提出までは変更できます', 'zh': '来自其 Bad Golf 指数的差点——请核对；在他提交成绩前都可以修改'},
    'Handicap carried from an earlier week — check it': {'es': 'Hándicap arrastrado de una semana anterior: revísalo', 'ko': '이전 주에서 이월된 핸디캡 — 확인하세요', 'ja': '前の週から引き継いだハンディキャップ — 確認してください', 'zh': '沿用之前某周的差点——请核对'},
    'Reopen requests': {'es': 'Solicitudes de reapertura', 'ko': '재개 요청', 'ja': '再オープンの依頼', 'zh': '重新开启请求'},
    'A player queried a card in a week that is already final. The results stand until you reopen the week.': {'es': 'Un jugador cuestionó una tarjeta de una semana ya cerrada. Los resultados se mantienen hasta que reabras la semana.', 'ko': '이미 확정된 주의 스코어카드에 이의가 있어요. 그 주를 다시 열기 전까지 결과는 유지돼요.', 'ja': 'すでに確定した週のカードに問い合わせがありました。週を再オープンするまで結果はそのままです。', 'zh': '有球员对已结束那周的记分卡提出疑问。在你重新开启该周之前，结果保持不变。'},
    'Open week': {'es': 'Abrir semana', 'ko': '주 열기', 'ja': '週を開く', 'zh': '打开该周'},
    'You have already asked the commissioner to reopen this week': {'es': 'Ya le pediste al comisionado que reabra esta semana', 'ko': '이미 커미셔너에게 이번 주를 다시 열어 달라고 요청했어요', 'ja': 'すでにコミッショナーにこの週の再オープンを依頼しています', 'zh': '你已经请求负责人重新开启本周'},
    'Sent to the commissioner as a request to reopen the week — the results stand until he does': {'es': 'Enviado al comisionado como solicitud para reabrir la semana; los resultados se mantienen hasta que lo haga', 'ko': '이번 주를 다시 열어 달라는 요청으로 커미셔너에게 보냈어요 — 다시 열 때까지 결과는 유지돼요', 'ja': '週の再オープン依頼としてコミッショナーに送りました — 再オープンされるまで結果はそのままです', 'zh': '已作为重新开启本周的请求发给负责人——在他开启前结果保持不变'},
    'Score net bogey on every hole this week.': {'es': 'Anota bogey neto en todos los hoyos esta semana.', 'ko': '이번 주 모든 홀을 넷 보기로 기록해요.', 'ja': '今週は全ホールをネットボギーで記録します。', 'zh': '本周每洞记为净柏忌。'},
    'Weeks already played keep what they were played under.': {'es': 'Las semanas ya jugadas mantienen lo que tenían.', 'ko': '이미 플레이한 주는 그때 기준을 그대로 유지해요.', 'ja': 'すでにプレーした週は当時の条件のままです。', 'zh': '已经打过的周保持当时的规则。'},
    'The commissioner changed the league reserve. It comes off the season prize pool when the season awards.': {'es': 'El comisionado cambió la reserva de la liga. Se descuenta de la bolsa de premios de la temporada al repartirla.', 'ko': '커미셔너가 리그 적립금을 바꿨어요. 시즌 시상 때 시즌 프라이즈 풀에서 빠져요.', 'ja': 'コミッショナーがリーグの積立金を変更しました。シーズンの表彰時にシーズンのプライズプールから差し引かれます。', 'zh': '负责人修改了联赛预留金。赛季颁奖时从赛季奖池中扣除。'},
    'This replaces the pairings already there for the weeks still to play.': {'es': 'Esto reemplaza los emparejamientos que ya hay para las semanas por jugar.', 'ko': '아직 남은 주의 기존 대진을 바꿔요.', 'ja': 'まだプレーしていない週の既存の組み合わせを置き換えます。', 'zh': '这会替换尚未进行各周已有的对阵。'},
    # error codes
    'That isn’t one of the holes-to-play options': {'es': 'Esa no es una de las opciones de hoyos a jugar', 'ko': '플레이할 홀 옵션에 없는 값이에요', 'ja': 'それはプレーするホールの選択肢にありません', 'zh': '这不是可选的打洞方式'},
    'Pick a starting hole from 2 to 18': {'es': 'Elige un hoyo de salida del 2 al 18', 'ko': '시작 홀을 2~18 중에서 고르세요', 'ja': '開始ホールを2〜18から選んでください', 'zh': '请选择2到18之间的起始洞'},
    'That week has opened — only its date can move now': {'es': 'Esa semana ya se abrió; ahora solo se puede mover su fecha', 'ko': '그 주는 이미 열렸어요 — 이제 날짜만 옮길 수 있어요', 'ja': 'その週はすでに開いています — 動かせるのは日付だけです', 'zh': '该周已开启——现在只能改日期'},
    'A handicap is -10 to 54': {'es': 'Un hándicap va de -10 a 54', 'ko': '핸디캡은 -10에서 54 사이예요', 'ja': 'ハンディキャップは -10〜54 です', 'zh': '差点范围是 -10 到 54'},
    'A change of 2 or more needs a reason on the record': {'es': 'Un cambio de 2 o más necesita un motivo en el registro', 'ko': '2 이상 바꾸려면 기록에 남길 이유가 필요해요', 'ja': '2以上の変更には記録に残す理由が必要です', 'zh': '改动2或以上需要记录原因'},
    'A sub can’t be on a team — subs fill seats week by week': {'es': 'Un suplente no puede estar en un equipo; los suplentes cubren puestos semana a semana', 'ko': '대체 선수는 팀에 들어갈 수 없어요 — 대체 선수는 주마다 자리를 채워요', 'ja': '代役はチームに入れません — 代役は週ごとに枠を埋めます', 'zh': '替补不能加入队伍——替补按周补位'},
    '4-man team leagues are retired — use 2-man teams': {'es': 'Las ligas de equipos de 4 están retiradas; usa equipos de 2', 'ko': '4인 팀 리그는 종료됐어요 — 2인 팀을 쓰세요', 'ja': '4人チームのリーグは終了しました — 2人チームを使ってください', 'zh': '四人队联赛已停用——请用两人队'},
    'That player is already on this roster': {'es': 'Ese jugador ya está en esta lista', 'ko': '그 선수는 이미 이 로스터에 있어요', 'ja': 'その選手はすでにこのロスターにいます', 'zh': '该球员已在名单中'},
    'That prize pool can’t change once the season has started': {'es': 'Esa bolsa de premios no puede cambiar una vez empezada la temporada', 'ko': '시즌이 시작되면 그 프라이즈 풀은 바꿀 수 없어요', 'ja': 'シーズン開始後はそのプライズプールを変更できません', 'zh': '赛季开始后不能更改该奖池'},
    'That player is already subbing in another seat this week': {'es': 'Ese jugador ya es suplente en otro puesto esta semana', 'ko': '그 선수는 이번 주 이미 다른 자리에 대체로 들어가 있어요', 'ja': 'その選手は今週すでに別の枠で代役に入っています', 'zh': '该球员本周已在另一个位置当替补'},
    'That player already has their own match this week': {'es': 'Ese jugador ya tiene su propio partido esta semana', 'ko': '그 선수는 이번 주 자기 경기가 이미 있어요', 'ja': 'その選手は今週すでに自分の試合があります', 'zh': '该球员本周已有自己的比赛'},
    'That seat has already been settled by the commissioner': {'es': 'El comisionado ya resolvió ese puesto', 'ko': '그 자리는 커미셔너가 이미 정리했어요', 'ja': 'その枠はコミッショナーがすでに決めました', 'zh': '负责人已处理该位置'},
    'That week is finished — reopen it first': {'es': 'Esa semana terminó; reábrela primero', 'ko': '그 주는 끝났어요 — 먼저 다시 여세요', 'ja': 'その週は終了しています — 先に再オープンしてください', 'zh': '该周已结束——请先重新开启'},
    'Say what is wrong with the card': {'es': 'Di qué está mal en la tarjeta', 'ko': '스코어카드에서 무엇이 틀렸는지 적어 주세요', 'ja': 'カードの何が間違っているか書いてください', 'zh': '请说明记分卡哪里有误'},
}

# runtime sentences: "p" patterns with {0}.. holes (game names inside stay English)
PATS = {
    'Rounds posted, then the best week to par, then {0}': {'es': 'Rondas entregadas, luego la mejor semana respecto al par, luego {0}', 'ko': '제출한 라운드 수, 그다음 파 대비 최고의 주, 그다음 {0}', 'ja': '提出ラウンド数、次にパー比のベスト週、次に{0}', 'zh': '提交轮数，然后是相对标准杆最好的一周，然后是{0}'},
    'Weeks played, then the best week to par, then {0}': {'es': 'Semanas jugadas, luego la mejor semana respecto al par, luego {0}', 'ko': '플레이한 주 수, 그다음 파 대비 최고의 주, 그다음 {0}', 'ja': 'プレーした週数、次にパー比のベスト週、次に{0}', 'zh': '打过的周数，然后是相对标准杆最好的一周，然后是{0}'},
    'Head-to-head, then weeks played, then the best week to par, then matches won, then {0}': {'es': 'Cara a cara, luego semanas jugadas, luego la mejor semana respecto al par, luego partidos ganados, luego {0}', 'ko': '맞대결, 그다음 플레이한 주 수, 파 대비 최고의 주, 이긴 경기 수, 그다음 {0}', 'ja': '直接対決、次にプレー週数、パー比のベスト週、勝った試合数、次に{0}', 'zh': '交手记录，然后是打过的周数、相对标准杆最好的一周、赢的比赛数，然后是{0}'},
    'Team league — {0}': {'es': 'Liga por equipos — {0}', 'ko': '팀 리그 — {0}', 'ja': 'チームリーグ — {0}', 'zh': '团队联赛——{0}'},
    'Shotgun · starts {0}': {'es': 'Shotgun · empieza en el {0}', 'ko': 'Shotgun · {0}번 홀 시작', 'ja': 'Shotgun · {0}番スタート', 'zh': 'Shotgun · 从 {0} 号洞开始'},
    'Best {0} of {1}': {'es': 'Las mejores {0} de {1}', 'ko': '{1}주 중 상위 {0}주', 'ja': '{1}週のうちベスト{0}', 'zh': '{1} 周中最好的 {0} 周'},
    'Best {0} of {1} weeks counting · {2} counted so far': {'es': 'Cuentan las mejores {0} de {1} semanas · {2} contadas hasta ahora', 'ko': '{1}주 중 상위 {0}주 집계 · 지금까지 {2}주 집계', 'ja': '{1}週のうちベスト{0}週を集計 · これまで{2}週', 'zh': '计入 {1} 周中最好的 {0} 周 · 目前已计 {2} 周'},
    '{0} · not counting week {1}': {'es': '{0} · no cuenta la semana {1}', 'ko': '{0} · {1}주 미집계', 'ja': '{0} · 第{1}週は集計外', 'zh': '{0} · 不计第 {1} 周'},
    '{0} · not counting weeks {1}': {'es': '{0} · no cuentan las semanas {1}', 'ko': '{0} · {1}주 미집계', 'ja': '{0} · 第{1}週は集計外', 'zh': '{0} · 不计第 {1} 周'},
    'This replaces the {0} pairings already there for the weeks still to play.': {'es': 'Esto reemplaza los {0} emparejamientos que ya hay para las semanas por jugar.', 'ko': '아직 남은 주의 기존 대진 {0}개를 바꿔요.', 'ja': 'まだプレーしていない週の既存の組み合わせ{0}件を置き換えます。', 'zh': '这会替换尚未进行各周已有的 {0} 组对阵。'},
    '📣 The commissioner changed the handicap rules: {0}. It applies from week {1}. Weeks already played keep what they were played under.': {'es': '📣 El comisionado cambió las reglas de hándicap: {0}. Se aplica desde la semana {1}. Las semanas ya jugadas mantienen lo que tenían.', 'ko': '📣 커미셔너가 핸디캡 규칙을 바꿨어요: {0}. {1}주부터 적용돼요. 이미 플레이한 주는 그대로예요.', 'ja': '📣 コミッショナーがハンディキャップのルールを変更しました: {0}。第{1}週から適用されます。すでにプレーした週はそのままです。', 'zh': '📣 负责人修改了差点规则：{0}。从第 {1} 周起生效。已打过的周保持不变。'},
    'Joined in week {0} of {1} · fee {2} of {3} ({4} weeks left), equal share of the prize pool': {'es': 'Se unió en la semana {0} de {1} · cuota {2} de {3} (quedan {4} semanas), parte igual de la bolsa de premios', 'ko': '{1}주 중 {0}주에 합류 · 참가비 {3} 중 {2} (남은 {4}주), 프라이즈 풀 몫은 동일', 'ja': '{1}週中第{0}週に参加 · 参加費 {3} のうち {2}（残り{4}週）、プライズプールの取り分は同じ', 'zh': '于 {1} 周中的第 {0} 周加入 · 费用 {2}/{3}（剩 {4} 周），奖池份额相同'},
    '{0} has no matches yet — the roster changed after the schedule was built. Rebuild the schedule to put them in; weeks already under way are left as they are.': {'es': '{0} aún no tiene partidos: la lista cambió después de crear el calendario. Rehaz el calendario para incluirlo; las semanas ya en marcha no cambian.', 'ko': '{0}님은 아직 경기가 없어요 — 일정을 만든 뒤 로스터가 바뀌었어요. 일정을 다시 만들면 들어가요. 이미 진행 중인 주는 그대로예요.', 'ja': '{0}にはまだ試合がありません — スケジュール作成後にロスターが変わりました。スケジュールを作り直すと入ります。進行中の週はそのままです。', 'zh': '{0} 还没有比赛——赛程生成后名单有变。重新生成赛程即可加入；已在进行的周保持不变。'},
    '{0} players have no handicap yet — set them': {'es': '{0} jugadores aún no tienen hándicap: ponlos', 'ko': '{0}명이 아직 핸디캡이 없어요 — 정해 주세요', 'ja': '{0}人にまだハンディキャップがありません — 設定してください', 'zh': '{0} 名球员还没有差点——请设置'},
    '{0} player has no handicap yet — set it': {'es': '{0} jugador aún no tiene hándicap: ponlo', 'ko': '{0}명이 아직 핸디캡이 없어요 — 정해 주세요', 'ja': '{0}人にまだハンディキャップがありません — 設定してください', 'zh': '{0} 名球员还没有差点——请设置'},
    'Also set up as a side game. Switch this pot on and the league runs it instead: that side game is locked off on league night, so nobody pays for it twice. A pot left at 0 leaves the side game playing.': {'es': 'También está como juego paralelo. Activa esta bolsa y la liga lo lleva en su lugar: ese juego paralelo queda bloqueado la noche de liga, así que nadie lo paga dos veces. Una bolsa en 0 deja el juego paralelo activo.', 'ko': '사이드 게임으로도 설정돼 있어요. 이 풀을 켜면 리그가 대신 진행해요. 리그 날에는 그 사이드 게임이 잠겨서 아무도 두 번 내지 않아요. 0으로 두면 사이드 게임이 그대로 진행돼요.', 'ja': 'サイドゲームとしても設定されています。このプールをオンにするとリーグが代わりに運営し、リーグの夜はそのサイドゲームがロックされるので二重に払うことはありません。0のままならサイドゲームはそのまま行われます。', 'zh': '也被设为附加游戏。打开这个奖池后由联赛代为进行：联赛当晚该附加游戏被锁定，不会有人付两次。奖池为 0 时附加游戏照常进行。'},
}


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
    print('i18n v2009 C1: %d dictionary entries added' % added)


if __name__ == '__main__':
    main()
