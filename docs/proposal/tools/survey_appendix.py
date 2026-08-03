"""전문가 조사의 응답 전문을 부록 표로 만든다.

    .venv-doc/bin/python docs/proposal/tools/survey_appendix.py

본문(§5.7)은 우리가 고른 것만 인용한다. 고르는 순간 우리에게 유리한 쪽으로
기울 수 있으므로, 받은 것을 전부 그대로 싣는 자리를 따로 둔다. 응답이 더
들어오면 이 스크립트를 다시 돌린다. 본문의 두 표지 사이를 통째로 갈아 끼우므로
손으로 고친 것이 있으면 지워진다.
"""
import os
import pathlib
import re

import openpyxl

from survey_ko_en import TRANSLATION

LANG = os.environ.get('SNAPCARE_LANG', 'ko').lower()
XLSX = pathlib.Path.home() / 'Desktop/Claude/snapcare-survey/scratchpad/SnapCare_설문응답.xlsx'
_DOC = pathlib.Path(__file__).resolve().parent.parent
DOC = _DOC / ('proposal_en.md' if LANG == 'en' else 'proposal_ko.md')
BEGIN = '<!-- 부록 시작. survey_appendix.py 가 생성한다. 손으로 고치지 말 것 -->'
END = '<!-- 부록 끝 -->'

# 영어판에서는 한글 이름을 로마자로 쓴다. 표 41 과 같은 표기여야 한다.
NICK_EN = {
    '유명순': 'Myoungsoon You', '조성일': 'Sung-il Cho', '송민선': 'Minsun Song',
    '박남수': 'Namsoo Park', '윤휘열': 'Hwi-Yeol Yun', '이소영': 'So-Young Lee',
    '하동문': 'Dongmun Ha', '김은경': 'Eun-Kyoung Kim', '이용한': 'Yonghan Lee',
    '최묘정': 'Myojung Choi', '박철현': 'Cheolhyeon Park', '이교구': 'Kyogu Lee',
    '이경화': 'Kyunghwa Lee', '서희정': 'Heejung Seo', '이영미': 'Youngmee Lee',
    '박경서': 'Kyungseo Park', '(성함 비공개)': '(name withheld)',
    '이한길': 'Hangil Lee',
}
AFF_EN = {
    '충남대학교': 'Chungnam National University',
    '충남대학교 약학대학': 'Chungnam National University College of Pharmacy',
    '서울대학교': 'Seoul National University',
    '국립목포대학교': 'Mokpo National University',
    '건양대학교': 'Konyang University',
    '협성대학교': 'Hyupsung University',
    '국립공주대학교': 'Kongju National University',
    '숭실대학교': 'Soongsil University',
    '동의대학교': 'Dong-eui University',
    '이화여자대학교 언어병리학과': 'Ewha Womans University',
    '이화여대': 'Ewha Womans University',
    '한국공예디자인문화진흥원': 'Korea Craft and Design Foundation',
    '한국장애인개발원': 'Korea Disabled People\'s Development Institute',
    '보이스아이': 'VOICEYE',
    'GC메디아이 의사랑 서비스센터': 'GC Medi-AI, Uisarang Service Centre',
}

T = {
    'h_free': '### 5.11 부록. 자유 서술 전문',
    'h_free_en': '### 5.11 Appendix. Every free-text response',
    'h_choice': '### 5.12 부록. 선택형 응답 전수',
    'h_choice_en': '### 5.12 Appendix. Every multiple-choice response',
    'th': '| 응답자 | 직책 | 소속 | 내용 |',
    'th_en': '| Respondent | Position | Affiliation | Response |',
    'th2': '| 선택지 | 응답 | 비율 |',
    'th2_en': '| Option | Responses | Share |',
    'n': '건', 'n_en': '',
}


def L(key: str) -> str:
    """영어판이면 _en 이 붙은 값을, 없으면 한국어 값을 쓴다."""
    return T.get(f'{key}_en' if LANG == 'en' else key, T.get(key, ''))

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


# 직함 표기가 응답자마다 다르다(professor · Prof · Professor). 표 41 과 같은
# 표기로 맞춘다. 사전에 없으면 적힌 그대로 나간다.
TITLE = {
    'professor': '교수', 'Prof': '교수', 'Professor': '교수',
    '교수/약사': '교수 · 약사',
    'researcher': '연구원', 'Researcher': '연구원',
    'Dr., pharmacist': '박사 · 약사',
    'Associate Professor': '부교수',
    'Assistant Professor': '조교수',
    'Assistant Professor of Clinical Pharmacy': '임상약학 조교수',
    'Professor of Translation and Interpreting': '번역·통역학 교수',
    'Pharmacy Lecturer': '약학 전임강사',
    'Senior Scientist': '수석연구원',
    'Deputy Director': '부대표',
    'Retired Speech and Language Therapist / Visiting Researcher for accessibility '
    'and disability at University of Southampton': '은퇴 언어치료사 · 접근성 객원연구원',
}

TITLE_EN = {
    '교수': 'Professor', '팀장': 'Team Leader', '대리': 'Assistant Manager',
    '선임': 'Senior Manager', '연구원': 'Researcher',
    '교수/약사': 'Professor and pharmacist',
    'Dr., pharmacist': 'PhD, pharmacist',
    'professor': 'Professor', 'Prof': 'Professor',
    'researcher': 'Researcher',
    'Retired Speech and Language Therapist / Visiting Researcher for accessibility '
    'and disability at University of Southampton':
        'Retired speech and language therapist · visiting accessibility researcher',
    # 응답자가 영어로 적은 직책. TITLE 이 한국어로 옮긴 뒤 여기서 되돌리지
    # 못해 영어판 부록에 한국어가 새어 나가고 있었다.
    'Associate Professor': 'Associate Professor',
    'Assistant Professor': 'Assistant Professor',
    'Assistant Professor of Clinical Pharmacy': 'Assistant Professor of Clinical Pharmacy',
    'Professor of Translation and Interpreting': 'Professor of Translation and Interpreting',
    'Pharmacy Lecturer': 'Pharmacy Lecturer',
    'Senior Scientist': 'Senior Scientist',
    'Deputy Director': 'Deputy Director',
}

QUESTION_EN = {
    'd1_more': 'Anything you would add that we did not ask',
    's1_alone__why': 'Could they take it alone, and why',
    's2_misread': 'Places likely to be misread',
    'ot2_wrong': 'What you consider to be wrong with it',
    'ot0_whole__why': 'How you see the project as a whole',
    'ot3_ref': 'References worth consulting',
    'ph0_whole__why': 'How you see it as a whole, from a pharmacy standpoint',
    'ph2_review__why': 'Why pharmacist review is needed',
    'ph3_current': 'How this is handled in practice today',
    'ph4_medical__why': 'What must not be wrong medically',
    'ph5_boundary__why': 'What must not be conveyed by picture and speech alone',
    'ph7_ref': 'References worth consulting (pharmacy)',
    'ph8_workflow__why': 'Whether it can fit the pharmacy workflow',
    'nu0_whole__why': 'Whether it can change health outcomes',
    'nu1_measure__why': 'How the effect should be measured',
    'nu2_where_fails__why': 'Where it fails first for an older patient living alone',
    'nu3_causal': 'Whether causation can be claimed',
    'nu4_seen__why': 'Whether you have seen patients missing medication information',
    'nu5_ref': 'References worth consulting (nursing and public health)',
    'nu6_proxy__why': 'Whether to design for the patient or the carer',
    'hc0_whole__why': 'What to resolve first, from an HCI standpoint',
    'hc1_smalln__why': 'What a small sample can establish',
    'hc2_prescreen__why': 'Whether machine pre-screening is justified',
    'hc3_breaks__why': 'How many elements in one image before it breaks down',
    'hc5_onboarding__why': 'Where a first run gets stuck',
    'li0_whole__why': 'How you see it from an adult-literacy standpoint',
    'li1_now': 'What learners do at present',
    'li2_pilot__why': 'Whether it could be trialled in class',
    'li4_ref': 'References worth consulting (adult literacy)',
    'li5_tension__why': 'Whether it reduces the motivation to learn to read',
    'aa0_whole__why': 'How you see it as a whole, from an AAC standpoint',
    'aa1_grammar__why': 'Whether a combinatorial grammar holds up',
    'aa2_which_fail__why': 'Which morphemes will fail',
    'aa3_how_test__why': 'How to test it with AAC users',
    'aa4_seen__why': 'Whether you have seen users of this kind',
    'aa5_ref': 'References worth consulting (AAC)',
    'aa6_learning__why': 'Whether learning is required',
    'in0_whole__why': 'What to resolve first, from an industry standpoint',
    'in1_breaks__why': 'Where users drop off',
    'in2_offline': 'Conditions for diffusion',
    'in5_sustain__why': 'A sustainable form of operation',
}

QUESTION_CHOICE_EN = {
    'b_field': 'Main field',
    'b_exposure': 'How often you meet someone who cannot read a written medication instruction',
    's1_alone': 'Could a patient take their medicine correctly, alone, with only these screens',
    'li0_whole': 'Does this approach hold up from an adult-literacy standpoint',
    'li1_now': 'How learners handle medication information at present',
    'li2_pilot': 'Could it be trialled in class',
    'li5_tension': 'Does it conflict with the motivation to learn to read',
    'hc0_whole': 'What to resolve first, from an HCI standpoint',
    'hc1_smalln': 'What should be measured with a small sample',
    'hc2_prescreen': 'Is machine pre-screening justified',
    'hc3_breaks': 'What breaks as elements accumulate in one image',
    'hc5_onboarding': 'Where a first run gets stuck',
    'ph2_review': 'Is pharmacist review needed',
    'ph4_medical': 'What must not be wrong medically',
    'ph8_workflow': 'Can it fit the pharmacy workflow',
    'nu0_whole': 'Can it change actual health outcomes',
    'nu1_measure': 'Instrument for measuring the effect',
    'nu2_where_fails': 'Where it fails first for an older patient living alone',
    'nu4_seen': 'Have you seen patients missing medication information',
    'nu6_proxy': 'Who should it be designed for',
    'in0_whole': 'What to resolve first, from an industry standpoint',
    'in1_breaks': 'Where users drop off',
    'in5_sustain': 'A sustainable form of operation',
    'ot0_whole': 'Looking at the whole, what to resolve first',
    'aa0_whole': 'How you see it as a whole, from an AAC standpoint',
    'aa1_grammar': 'Does a combinatorial grammar hold up',
    'aa2_which_fail': 'Which morphemes will fail',
    'aa3_how_test': 'How to test it with AAC users',
    'aa4_seen': 'Have you seen users of this kind',
    'aa6_learning': 'Is learning required',
}


def cell(x: str) -> str:
    """표 칸에 들어갈 수 있게 다듬는다. 파이프와 줄바꿈이 표를 깨뜨린다.

    영어판에서는 한국어 응답을 번역으로 갈아 끼운다. 사전에 없으면 원문이
    그대로 나가므로, 번역을 빠뜨리면 영어판에서 눈에 띈다."""
    x = re.sub(r'\s*\n\s*', ' ', str(x)).strip()
    x = x.replace('|', '/')
    if LANG == 'en':
        x = TRANSLATION.get(x, x)
    return x


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb['응답']
    hdr = [c.value for c in ws[1]]
    rows = [dict(zip(hdr, r)) for r in ws.iter_rows(min_row=2, values_only=True)]
    meta = {}
    for r in rows:
        n = NICK.get((r['b_name'] or '').strip(), (r['b_name'] or '').strip())
        a = AFF.get((r['b_affil'] or '').strip(), (r['b_affil'] or '').strip())
        raw = (r['b_title'] or '').strip()
        t = TITLE.get(raw, raw)
        if LANG == 'en':
            n, a = NICK_EN.get(n, n), AFF_EN.get(a, a)
            t = TITLE_EN.get(raw, TITLE_EN.get(t, t))
        if LANG == 'en':
            # 여기서 잡지 않으면 영어판 부록에 한국어가 그대로 실린다.
            # 실제로 직책 일곱과 이름·소속 하나씩이 그렇게 나가고 있었다.
            import re as _re
            for label, v in (('이름', n), ('직책', t), ('소속', a)):
                if _re.search(r'[가-힣]', v or ''):
                    raise SystemExit(
                        f'영어판 부록에 한국어가 남는다 — {label} {v!r} '
                        f'(원본 {r["b_name"]!r}). NICK_EN·TITLE_EN·AFF_EN 에 넣어라')
        meta[r['응답ID']] = (n, t, a)

    by_q = {}
    total = 0
    for q, qt, rid, fld, exp, txt in wb['자유응답'].iter_rows(min_row=2, values_only=True):
        if not txt:
            continue
        total += 1
        by_q.setdefault(q, []).append((meta.get(rid, ('?', '?', '?')), cell(txt)))

    if LANG == 'en':
        intro = (f'§5.7 quotes only the responses we selected. Selecting can tilt '
                 f'towards what favours us, so all {total} free-text responses received '
                 f'are set down here in full, by question. Only line breaks were removed; '
                 f'nothing else was touched. Short answers ("N/A", "Yes.") are left in '
                 f'rather than being dropped and reinstated. Responses written in Korean '
                 f'are given here in our own translation; the originals stand unaltered '
                 f'in the Korean version of this document. Positions and affiliations '
                 f'are likewise as the respondent wrote them. Table 41 uses what we '
                 f'confirmed against the institution\'s own faculty listing when the '
                 f'list was built, so it is sometimes more specific: respondent Hangil '
                 f'Lee is "Professor · Ewha Womans University" here and "Associate '
                 f'Professor · College of Pharmacy, Ewha Womans University" there.')
    else:
        intro = (f'§5.7 은 우리가 고른 응답만 인용한다. 고르는 순간 우리에게 유리한 쪽으로 '
                 f'기울 수 있으므로, 받은 자유 서술 {total}건을 문항별로 그대로 싣는다. '
                 f'줄바꿈만 없애고 손대지 않았다. 짧은 답("N/A", "Yes.")도 뺐다가 넣었다 '
                 f'하지 않고 그대로 둔다. 직책과 소속도 응답자가 적어 준 그대로다. '
                 f'표 41 은 명단을 만들 때 기관의 교원 목록에서 확인한 표기를 쓰므로 '
                 f'더 자세한 자리가 있다. 예컨대 이한길 응답자는 여기 "교수 · 이화여대" '
                 f'이고 표 41 에서는 "부교수 · 이화여자대학교 약학대학" 이다.')
    out = [BEGIN, '', L('h_free'), '', intro, '']

    for q in ORDER + [k for k in by_q if k not in ORDER]:
        items = by_q.get(q)
        if not items:
            continue
        label = QUESTION_EN.get(q, QUESTION.get(q, q)) if LANG == 'en' else QUESTION.get(q, q)
        out += [f'**{label}** ({len(items)}{L("n")})', '',
                L('th'), '|---|---|---|---|']
        for (n, ti, a), t in items:
            out.append(f'| {n} | {ti} | {a} | {t} |')
        out.append('')

    # ── 부록 B. 선택형 응답 전수 ──────────────────────────────────
    intro2 = ('For the same reason as the free text, every multiple-choice answer is '
              'set down as well. The denominator is the number of people who received '
              'that question, and since the questions differ by segment the denominator '
              'differs from question to question.') if LANG == 'en' else (
              '자유 서술과 같은 이유로 선택형도 전부 싣는다. 분모는 그 문항을 받은 '
              '사람의 수이며, 구획에 따라 문항이 다르므로 문항마다 분모가 다르다.')
    out += [L('h_choice'), '', intro2, '']
    dist = wb['선택지 분포']
    cur, buf = None, []
    for q, opt, n, pct in dist.iter_rows(min_row=2, values_only=True):
        if q in ('b_name', 'b_country'):      # 명단은 표 36 에 이미 있다
            continue
        if q != cur:
            if buf:
                out += buf + ['']
            cur = q
            lab = (QUESTION_CHOICE_EN.get(q, QUESTION_CHOICE.get(q, q))
                   if LANG == 'en' else QUESTION_CHOICE.get(q, q))
            buf = [f'**{lab}**', '', L('th2'), '|---|---|---|']
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
