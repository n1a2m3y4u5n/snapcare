"""전문가 조사의 응답 전문을 부록 표로 만든다.

    .venv-doc/bin/python docs/proposal/tools/survey_appendix.py

본문(§5.7)은 우리가 고른 것만 인용한다. 고르는 순간 우리에게 유리한 쪽으로
기울 수 있으므로, 받은 것을 전부 그대로 싣는 자리를 따로 둔다. 응답이 더
들어오면 이 스크립트를 다시 돌린다. 본문의 두 표지 사이를 통째로 갈아 끼우므로
손으로 고친 것이 있으면 지워진다.
"""
import pathlib
import re

import openpyxl

XLSX = pathlib.Path.home() / 'Desktop/Claude/snapcare-survey/scratchpad/SnapCare_설문응답.xlsx'
DOC = pathlib.Path(__file__).resolve().parent.parent / 'proposal_ko.md'
BEGIN = '<!-- 부록 시작. survey_appendix.py 가 생성한다. 손으로 고치지 말 것 -->'
END = '<!-- 부록 끝 -->'

NICK = {
    'myoungsoon YOU': '유명순', 'Katarina Vucicevic': 'Katarina Vučićević',
    'Niken nur widyakusuma': 'Niken Nur Widyakusuma', 'Raghupathy anchala': 'Raghupathy Anchala',
    'maria stefanova': 'Maria Stefanova', 'Foued MAAOUI': 'Foued Maaoui',
    'E.A. Draffan': 'E. A. Draffan', 'Celia': 'Celia',
    'Dr. Srikanth Malavalli Siddalingegwod': 'Srikanth Malavalli Siddalingegwod',
    '***': '(성함 비공개)',
}
AFF = {
    'FFUL': 'Universidade de Lisboa',
    'GC메디아이': 'GC메디아이 의사랑 서비스센터',
    'Global Symbols': 'Global Symbols · Univ. of Southampton',
    'Department of Pharmacy Practice, JSS College of Pharmacy, JSS Academy of Higher Education & Research, Mysuru, Karnataka, INDIA': 'JSS College of Pharmacy',
    'Department of Clinical Pharmacy and Pharmacy Practice': 'Dept. of Clinical Pharmacy and Pharmacy Practice',
    'International Centre for Diarrhoeal Disease Research, Bangladesh': 'icddr,b',
    'All Ukrainian NGO Coalition for Persons with Intellectual Disabilities': 'All Ukrainian NGO Coalition',
    'University of Belgrade - Faculty of Pharmacy': 'University of Belgrade',
    'The Ohio State University College of Pharmacy': 'Ohio State University',
    'Medical of University, Sofia': 'Medical University of Sofia',
    'public health foundation of india': 'Public Health Foundation of India',
    '이화여대 언어병리학과': '이화여자대학교 언어병리학과',
    '충남대': '충남대학교', '서울대': '서울대학교',
}

# 문항 코드 → 사람이 읽는 이름. 코드만 적으면 부록이 로그가 된다.
QUESTION = {
    'd1_more': '묻지 않았지만 덧붙이고 싶은 것',
    's1_alone__why': '혼자 복용할 수 있겠는가, 그 이유',
    's2_misread': '잘못 읽힐 만한 곳',
    'ot2_wrong': '무엇이 잘못되었다고 보는가',
    'ot0_whole__why': '프로젝트 전체를 어떻게 보는가',
    'ot3_ref': '참고할 자료',
    'ph0_whole__why': '약국 관점에서 전체를 어떻게 보는가',
    'ph2_review__why': '약사 검토가 필요한 이유',
    'ph3_current': '지금 실무에서는 어떻게 하는가',
    'ph4_medical__why': '의학적으로 틀리면 안 되는 것',
    'ph5_boundary__why': '그림·음성만으로 전달하면 안 되는 것',
    'ph7_ref': '참고할 자료 (약국)',
    'ph8_workflow__why': '약국 업무 흐름에 들어갈 수 있는가',
    'nu0_whole__why': '건강 결과를 바꿀 수 있는가',
    'nu1_measure__why': '효과를 어떻게 잴 것인가',
    'nu2_where_fails__why': '독거 고령 환자에게 어디서 먼저 실패하는가',
    'nu3_causal': '인과를 주장할 수 있는가',
    'nu4_seen__why': '복약 정보를 놓치는 환자를 본 적이 있는가',
    'nu5_ref': '참고할 자료 (간호·보건)',
    'nu6_proxy__why': '환자와 보호자 중 누구를 대상으로 설계할 것인가',
    'hc0_whole__why': 'HCI 관점에서 가장 먼저 해결할 것',
    'hc1_smalln__why': '소규모 표본으로 무엇을 알 수 있는가',
    'hc2_prescreen__why': '기계 사전 선별이 정당한가',
    'hc3_breaks__why': '한 그림에 요소가 몇이면 무너지는가',
    'hc5_onboarding__why': '첫 실행에서 어디가 막히는가',
    'li0_whole__why': '성인문해교육 관점에서 어떻게 보는가',
    'li1_now': '지금 학습자들은 어떻게 하는가',
    'li2_pilot__why': '수업에서 시험해 볼 수 있는가',
    'li4_ref': '참고할 자료 (문해교육)',
    'li5_tension__why': '글을 배우려는 동기를 줄이지 않는가',
    'aa0_whole__why': 'AAC 관점에서 전체를 어떻게 보는가',
    'aa1_grammar__why': '조합형 문법이 성립하는가',
    'aa2_which_fail__why': '어떤 형태소가 실패할 것인가',
    'aa3_how_test__why': 'AAC 사용자에게 어떻게 시험할 것인가',
    'aa4_seen__why': '이런 사용자를 본 적이 있는가',
    'aa5_ref': '참고할 자료 (AAC)',
    'aa6_learning__why': '학습이 필요한가',
    'in0_whole__why': '산업 관점에서 가장 먼저 해결할 것',
    'in1_breaks__why': '어디서 이탈하는가',
    'in2_offline': '보급의 조건',
    'in5_sustain__why': '지속 가능한 운영 형태',
}
ORDER = list(QUESTION)

# 선택형 문항의 이름. 자유 서술과 짝이 되는 것은 __why 를 뗀 이름을 쓴다.
QUESTION_CHOICE = {
    'b_field': '주 분야',
    'b_exposure': '글로 된 복약 지시를 읽지 못하는 사람과 마주치는 빈도',
    's1_alone': '이 화면만으로 혼자 약을 제대로 복용할 수 있겠는가',
    'li0_whole': '성인문해교육 관점에서 이 접근이 성립하는가',
    'li1_now': '지금 학습자들은 복약 정보를 어떻게 다루는가',
    'li2_pilot': '수업에서 시험해 볼 수 있는가',
    'li5_tension': '글을 배우려는 동기와 충돌하는가',
    'hc0_whole': 'HCI 관점에서 가장 먼저 해결할 것',
    'hc1_smalln': '소규모 표본에서 무엇을 재야 하는가',
    'hc2_prescreen': '기계 사전 선별이 정당한가',
    'hc3_breaks': '한 그림에 요소가 많아지면 무엇이 무너지는가',
    'hc5_onboarding': '첫 실행에서 어디가 막히는가',
    'ph2_review': '약사 검토가 필요한가',
    'ph4_medical': '의학적으로 가장 틀리면 안 되는 것',
    'ph8_workflow': '약국 업무 흐름에 들어갈 수 있는가',
    'nu0_whole': '실제 건강 결과를 바꿀 수 있는가',
    'nu1_measure': '효과를 재는 측정도구',
    'nu2_where_fails': '독거 고령 환자에게 어디서 먼저 실패하는가',
    'nu4_seen': '복약 정보를 놓치는 환자를 본 적이 있는가',
    'nu6_proxy': '누구를 대상으로 설계해야 하는가',
    'in0_whole': '산업 관점에서 가장 먼저 해결할 것',
    'in1_breaks': '어디서 이탈하는가',
    'in5_sustain': '지속 가능한 운영 형태',
    'ot0_whole': '전체를 볼 때 가장 먼저 해결할 것',
    'aa0_whole': 'AAC 관점에서 전체를 어떻게 보는가',
    'aa1_grammar': '조합형 문법이 성립하는가',
    'aa2_which_fail': '어떤 형태소가 실패할 것인가',
    'aa3_how_test': 'AAC 사용자에게 어떻게 시험할 것인가',
    'aa4_seen': '이런 사용자를 본 적이 있는가',
    'aa6_learning': '학습이 필요한가',
}


def cell(x: str) -> str:
    """표 칸에 들어갈 수 있게 다듬는다. 파이프와 줄바꿈이 표를 깨뜨린다."""
    x = re.sub(r'\s*\n\s*', ' ', str(x)).strip()
    return x.replace('|', '/')


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb['응답']
    hdr = [c.value for c in ws[1]]
    rows = [dict(zip(hdr, r)) for r in ws.iter_rows(min_row=2, values_only=True)]
    meta = {}
    for r in rows:
        n = NICK.get((r['b_name'] or '').strip(), (r['b_name'] or '').strip())
        a = AFF.get((r['b_affil'] or '').strip(), (r['b_affil'] or '').strip())
        meta[r['응답ID']] = (n, a)

    by_q = {}
    total = 0
    for q, qt, rid, fld, exp, txt in wb['자유응답'].iter_rows(min_row=2, values_only=True):
        if not txt:
            continue
        total += 1
        by_q.setdefault(q, []).append((meta.get(rid, ('?', '?')), cell(txt)))

    out = [BEGIN, '', '### 5.11 부록. 자유 서술 전문', '',
           f'§5.7 은 우리가 고른 응답만 인용한다. 고르는 순간 우리에게 유리한 쪽으로 '
           f'기울 수 있으므로, 받은 자유 서술 {total}건을 문항별로 그대로 싣는다. '
           f'줄바꿈만 없애고 손대지 않았다. 짧은 답("N/A", "Yes.")도 뺐다가 넣었다 '
           f'하지 않고 그대로 둔다.', '']

    for q in ORDER + [k for k in by_q if k not in ORDER]:
        items = by_q.get(q)
        if not items:
            continue
        out += [f'**{QUESTION.get(q, q)}** ({len(items)}건)', '',
                '| 응답자 | 소속 | 내용 |', '|---|---|---|']
        for (n, a), t in items:
            out.append(f'| {n} | {a} | {t} |')
        out.append('')

    # ── 부록 B. 선택형 응답 전수 ──────────────────────────────────
    out += ['### 5.12 부록. 선택형 응답 전수', '',
            '자유 서술과 같은 이유로 선택형도 전부 싣는다. 분모는 그 문항을 받은 '
            '사람의 수이며, 구획에 따라 문항이 다르므로 문항마다 분모가 다르다.', '']
    dist = wb['선택지 분포']
    cur, buf = None, []
    for q, opt, n, pct in dist.iter_rows(min_row=2, values_only=True):
        if q in ('b_name', 'b_country'):      # 명단은 표 36 에 이미 있다
            continue
        if q != cur:
            if buf:
                out += buf + ['']
            cur = q
            buf = [f'**{QUESTION_CHOICE.get(q, q)}**', '',
                   '| 선택지 | 응답 | 비율 |', '|---|---|---|']
        buf.append(f'| {cell(opt)} | {n} | {pct:.0%} |')
    if buf:
        out += buf + ['']

    out += [END, '']
    block = '\n'.join(out)

    doc = DOC.read_text()
    if BEGIN in doc:
        doc = re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END) + r'\n?',
                     block, doc, flags=re.S)
    else:
        doc = doc.rstrip() + '\n\n' + block
    DOC.write_text(doc)
    print(f'자유 서술 {total}건 · 문항 {len(by_q)}개 · {len(block):,}자')


if __name__ == '__main__':
    main()
