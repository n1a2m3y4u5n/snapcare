"""전문가 의견 조사의 통계 분석.

    .venv-doc/bin/python docs/proposal/tools/survey_stats.py

표본이 작으므로 대부분의 검정은 검출력이 없다. 그래도 돌리는 이유는 "차이가
있다" 를 말하기 위해서가 아니라, 있는지 없는지 말할 수 없다는 것을 수치로
적기 위해서다. 유의하지 않은 결과를 빼고 유의한 것만 싣는 것이 이 표본에서
할 수 있는 가장 나쁜 일이다.
"""
import collections
from pathlib import Path
import json
import pathlib
import re
import sys

import openpyxl
from scipy import stats

XLSX = pathlib.Path.home() / 'Desktop/Claude/snapcare-survey/scratchpad/SnapCare_설문응답.xlsx'

FIELD_KO = {
    'Pharmacy / medication counselling': '약국·복약지도',
    'Nursing / public health': '간호·보건',
    'HCI / design': 'HCI·디자인',
    'Adult literacy education': '성인문해교육',
    'AAC / special education': 'AAC·특수교육',
    'Industry practitioner (building / operating products)': '산업 실무',
    'Other': '그 밖',
}
# 데모 판단 문항을 받은 다섯 구획. 법·표준·산업은 받지 않았다.
JUDGE_FIELDS = {'약국·복약지도', '간호·보건', 'AAC·특수교육', '성인문해교육', 'HCI·디자인'}
EXPOSURE_ORDER = ['Almost never', 'A few times a year', 'About monthly',
                  'About weekly', 'Almost daily']


def load():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb['응답']
    hdr = [c.value for c in ws[1]]
    return [dict(zip(hdr, r)) for r in ws.iter_rows(min_row=2, values_only=True)]


def wilson(k, n, z=1.96):
    """이항 비율의 신뢰구간. n 이 작을 때 정규근사(Wald)는 구간이 음수로
    내려가거나 1을 넘는다. Wilson 은 그런 일이 없다."""
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return (max(0.0, c - h), min(1.0, c + h))


def line(title):
    print(f'\n{"━" * 66}\n{title}\n{"━" * 66}')


def main():
    rows = load()
    n = len(rows)
    for r in rows:
        r['field'] = FIELD_KO.get(r['b_field'], r['b_field'])

    # ── 1. 핵심 비율과 그 불확실성 ─────────────────────────────────
    line('1. 판단 문항. 비율과 신뢰구간')
    judged = [r for r in rows if r['field'] in JUDGE_FIELDS and r.get('s1_alone')]
    cnt = collections.Counter(r['s1_alone'] for r in judged)
    m = len(judged)
    print(f'분모 {m}명 (판단 자격 다섯 구획)\n')
    for opt, k in cnt.most_common():
        lo, hi = wilson(k, m)
        print(f'  {k:>2}/{m}  {k/m:>6.1%}  [{lo:.1%}, {hi:.1%}]  {opt}')
    part = cnt.get('Partly — some of it, not all', 0)
    yes = cnt.get('Yes, probably', 0)
    print(f'\n  "아니오" 0/{m} · 95% 상한 {wilson(0, m)[1]:.1%}')
    print('  0건이라고 해서 0% 라는 뜻이 아니다. 이 표본에서 말할 수 있는 것은')
    print(f'  참값이 {wilson(0, m)[1]:.1%} 아래일 것이라는 정도다.')

    # ── 2. 현장을 보는 사람과 아닌 사람이 다르게 답했는가 ──────────
    line('2. 접촉 빈도와 판단의 관계 (Fisher 정확검정)')
    HI = {'Almost daily', 'About weekly', 'About monthly'}
    tab = collections.Counter()
    for r in judged:
        hi = r['b_exposure'] in HI
        pos = r['s1_alone'] == 'Yes, probably'
        tab[(hi, pos)] += 1
    a, b = tab[(True, True)], tab[(True, False)]
    c, d = tab[(False, True)], tab[(False, False)]
    print(f'              "가능" 로 답  그 밖')
    print(f'  자주 마주침    {a:>6}     {b:>5}')
    print(f'  드물게         {c:>6}     {d:>5}')
    if min(a + b, c + d) > 0:
        odds, p = stats.fisher_exact([[a, b], [c, d]])
        print(f'\n  Fisher 정확검정 양측 p = {p:.3f}')
        print(f'  {"차이가 있다고 말할 수 없다" if p >= 0.05 else "유의하다"}.')
        print(f'  한쪽 칸이 {min(a,b,c,d)} 이므로 이 표본으로는 어느 쪽도 보이지 않는다.')

    # ── 3. 직군에 따라 다르게 답했는가 ─────────────────────────────
    line('3. 직군과 판단의 관계 (Fisher 정확검정, 약국 대 간호)')
    ph = [r for r in judged if r['field'] == '약국·복약지도']
    nu = [r for r in judged if r['field'] == '간호·보건']
    pa = sum(1 for r in ph if r['s1_alone'] == 'Yes, probably')
    na = sum(1 for r in nu if r['s1_alone'] == 'Yes, probably')
    print(f'  약국 {pa}/{len(ph)} · 간호 {na}/{len(nu)} 이 "가능" 으로 답')
    if ph and nu:
        odds, p = stats.fisher_exact([[pa, len(ph) - pa], [na, len(nu) - na]])
        print(f'  Fisher 양측 p = {p:.3f} → 차이를 말할 수 없다')

    # ── 4. 답하는 데 오래 걸린 사람이 더 많이 지적했는가 ───────────
    line('4. 소요 시간과 자유 서술량 (Spearman 순위상관)')
    pairs = []
    for r in rows:
        t = r.get('소요(분)')
        txt = sum(len(str(v)) for k, v in r.items()
                  if k and str(k).endswith('__why') and v)
        txt += sum(len(str(r.get(k) or '')) for k in ('d1_more', 's2_misread', 'ot2_wrong'))
        if isinstance(t, (int, float)):
            pairs.append((float(t), txt))
    xs = [x for x, _ in pairs]
    ys = [y for _, y in pairs]
    rho, p = stats.spearmanr(xs, ys)
    print(f'  n = {len(pairs)} · rho = {rho:.3f} · p = {p:.4f}')
    print(f'  중앙값 소요 {sorted(xs)[len(xs)//2]:.1f}분 · '
          f'사분위 {sorted(xs)[len(xs)//4]:.1f}~{sorted(xs)[3*len(xs)//4]:.1f}분')
    if p < 0.05:
        print('  오래 머문 사람이 더 길게 적었다. 성의의 대리 지표로 읽을 수 있다.')

    # ── 5. 한국어 응답과 영어 응답 ─────────────────────────────────
    line('5. 언어별 비교')
    G = {}
    for lang in ('ko', 'en'):
        g = [r for r in rows if r['언어'] == lang]
        gj = [r for r in g if r['field'] in JUDGE_FIELDS and r.get('s1_alone')]
        pos = sum(1 for r in gj if r['s1_alone'] == 'Yes, probably')
        ts = [float(r['소요(분)']) for r in g if isinstance(r.get('소요(분)'), (int, float))]
        G[lang] = (gj, pos, ts)
        print(f'  {lang}: {len(g)}명 · 판단 문항 {len(gj)}명 중 "가능" {pos}명 · '
              f'소요 중앙값 {sorted(ts)[len(ts)//2]:.1f}분')

    (kj, kp, kt), (ej, ep, et) = G['ko'], G['en']
    odds, p_lang = stats.fisher_exact([[kp, len(kj) - kp], [ep, len(ej) - ep]])
    print(f'\n  "가능" 응답 비율의 언어 차이  Fisher 양측 p = {p_lang:.4f}')
    u, p_time = stats.mannwhitneyu(kt, et, alternative='two-sided')
    print(f'  소요 시간의 언어 차이        Mann-Whitney U p = {p_time:.4f}')

    # 이 절에서 돌리는 검정의 수. 그중 하나만 골라 싣는 것이 이 표본에서
    # 할 수 있는 가장 나쁜 일이므로 보정값을 함께 적는다.
    #
    # 손으로 5 를 적어 두었다가 틀렸다. 실제로 돌리는 것은 여섯이다.
    # Fisher 넷(접촉 빈도, 직군, 언어, 등급별 응답률), Mann-Whitney
    # 하나(언어와 소요 시간), Spearman 하나(소요 시간과 서술량)다.
    # 다섯으로 세면 문턱이 0.010 이 되어 실제(0.008)보다 느슨해진다.
    # 우리에게 유리한 쪽으로 틀린 것이므로 세는 자리를 코드로 옮긴다.
    # 대입하는 자리만 센다. 그러지 않으면 이 세는 코드 자신과 위의
    # 주석까지 세어 8 이 나온다.
    TESTS = len(re.findall(r'=\s*stats\.(?:fisher_exact|mannwhitneyu|spearmanr)\(',
                           Path(__file__).read_text()))
    print(f'\n  이 절에서 검정을 {TESTS}회 돌렸다. Bonferroni 문턱은 '
          f'{0.05 / TESTS:.3f} 다.')
    for name, p in (('언어와 판단', p_lang), ('언어와 소요 시간', p_time)):
        v = '넘는다' if p < 0.05 / TESTS else '넘지 못한다'
        print(f'    {name}: p = {p:.4f} → 보정 문턱을 {v}')
    print('  해석은 조심해야 한다. 언어는 응답자의 국가·직군과 얽혀 있으므로')
    print('  이 차이가 언어 때문인지 다른 것 때문인지 이 자료로는 가를 수 없다.')

    # ── 6. 접촉 빈도 분포 자체가 자료다 ────────────────────────────
    line(f'6. 저문해 환자를 마주치는 빈도 (n = {len(rows)})')
    ce = collections.Counter(r['b_exposure'] for r in rows)
    for k in EXPOSURE_ORDER:
        if ce.get(k):
            lo, hi = wilson(ce[k], n)
            print(f'  {ce[k]:>2}/{n}  {ce[k]/n:>6.1%}  [{lo:.1%}, {hi:.1%}]  {k}')

    # ── 7. 같은 지적이 몇 명에게서 독립적으로 나왔는가 ─────────────
    line('7. 지적의 수렴도 (자유 서술 전수 검색)')
    THEMES = {
        '금지가 금지로 읽히지 않는다': r'pregnan|임신|prohibit|금지|안된다|안 된다|X 표시|not safe',
        '한 장에 요소가 많다': r'중첩|가독성|분리하여|too much|one element|simpl|나눠|나누',
        '대상이 시각장애인이다': r'시각장애|visual impair|blind|저시력',
        '검증이 없다': r'valid|검증|tested with|test.*patient',
        '기존 세트를 참조하라': r'USP|health\.kr|existing.*symbol|other sources',
    }
    fa = openpyxl.load_workbook(XLSX, data_only=True)['자유응답']
    texts = collections.defaultdict(list)
    for q, qt, rid, fld, exp, txt in fa.iter_rows(min_row=2, values_only=True):
        if txt:
            texts[rid].append(str(txt))
    print(f'  자유 서술 {sum(len(v) for v in texts.values())}건 · 적은 사람 {len(texts)}명\n')
    for name, pat in THEMES.items():
        who = [rid for rid, ts in texts.items()
               if re.search(pat, ' '.join(ts), re.I)]
        lo, hi = wilson(len(who), len(texts))
        print(f'  {len(who):>2}/{len(texts)}명  {len(who)/len(texts):>6.1%}  '
              f'[{lo:.1%}, {hi:.1%}]  {name}')
    print('\n  이것은 우리가 고른 낱말로 센 것이므로 정확한 값이 아니다.')
    print('  본문에는 사람이 직접 읽고 확인한 건수를 쓴다.')

    # ── 8. 응답률 ──────────────────────────────────────────────────
    line('8. 응답률')
    SENT, A, B = 1103, 41, 1062
    lo, hi = wilson(n, SENT)
    print(f'  전체 {n}/{SENT} = {n/SENT:.1%}  [{lo:.1%}, {hi:.1%}]')
    print(f'  등급 A 0/{A} = 0.0%  [0.0%, {wilson(0, A)[1]:.1%}]')
    lo2, hi2 = wilson(n, B)
    print(f'  등급 B {n}/{B} = {n/B:.1%}  [{lo2:.1%}, {hi2:.1%}]')
    odds, p = stats.fisher_exact([[0, A], [n, B - n]])
    print(f'  A 와 B 의 응답률 차이 Fisher 양측 p = {p:.3f}')
    print(f'  0/{A} 과 {n}/{B} 은 방향은 뚜렷하나 {A}명이 작아 단정할 수 없다.')


if __name__ == '__main__':
    main()
