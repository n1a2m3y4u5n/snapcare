"""도판의 글자를 언어에 따라 갈아 끼운다.

    python3 tools/charts.py            → docs/proposal/fig/     (한국어)
    SNAPCARE_LANG=en python3 ...       → docs/proposal/fig_en/  (영어)

도판 스크립트를 언어별로 복제하지 않는다. 복제하면 한쪽만 고치는 일이
반드시 생기고, 그때 두 판의 그림이 다른 것을 말하게 된다. 대신 라벨을
T() 로 감싸고 사전을 여기 한 곳에 둔다. 사전에 없는 문자열은 그대로
통과하므로, 새 라벨을 넣고 번역을 잊으면 영어판에 한국어가 그대로
나타난다. 조용히 빠지는 것보다 눈에 띄는 편이 낫다.
"""
import os
from pathlib import Path

LANG = os.environ.get('SNAPCARE_LANG', 'ko').lower()
_DOC = Path(__file__).resolve().parent.parent
FIG_SRC = _DOC / 'fig'                 # 화면 캡처와 중간 재료는 언제나 여기서 읽는다
FIG = _DOC / ('fig_en' if LANG == 'en' else 'fig')
FIG.mkdir(exist_ok=True)

EN = {
    # ── charts.py ──────────────────────────────────────────────────
    '성인 문해율이 가장 낮은 15개국': 'The 15 countries with the lowest adult literacy',
    '성인 문해율 (%)': 'Adult literacy (%)',
    '성인(15세 이상) 문해율 (%)': 'Adult (15+) literacy rate (%)',
    '세계 평균 88%': 'World average 88%',
    '문해율 (%)': 'Literacy rate (%)',
    '비율 (%)': 'Share (%)',
    '비문해 성인 (백만 명)': 'Non-literate adults (millions)',
    '사하라이남 아프리카의 문해율과 비문해 인구':
        'Literacy rate and non-literate population, sub-Saharan Africa',
    '비율은 4%p 올랐는데\n사람 수는 2,900만 명 늘었다':
        'The rate rose 4 points while\nthe head count grew by 29 million',
    '건강정보이해능력이 충분하지 않은 비율 (한국)':
        'Share without sufficient health literacy (Korea)',
    '전체 성인': 'All adults', '65세 이상': '65 and over',
    '소득 하위층': 'Lower income', '소득 상위층': 'Upper income',
    '격차 19%p': '19-point gap',
    '보유율 (%)': 'Ownership (%)',
    '50세 미만': 'Under 50', '50~64세': '50–64',
    '누락': 'Omission', '용량 오류': 'Dose error', '시각 오류': 'Timing error',
    '나머지': 'Other',
    '기준을 통과한 픽토그램 비율 (%)': 'Pictograms passing the criterion (%)',
    'Gutierrez (2022)\nUSP+FIP 108종 · ANSI 85%':
        'Gutierrez (2022)\n108 USP+FIP · ANSI 85%',
    'Dowse & Ehlers (2001)\nUSP-DI 23종 · ANSI 85%':
        'Dowse & Ehlers (2001)\n23 USP-DI · ANSI 85%',
    '같은 46명 · 현지 제작\n23종 · ANSI 85%':
        'Same 46 people · locally made\n23 symbols · ANSI 85%',
    'Dowse (2023)\n현지 제작 10종 · ISO 66.7%':
        'Dowse (2023)\n10 locally made · ISO 66.7%',
    '본 연구 SIGIL\n78종 · 기계 판정': 'This work, SIGIL\n78 morphemes · machine-scored',
    '가운데 둘은 같은 연구의 대조군·실험군이다 — 같은 46명에게 두 세트를 보였다.':
        'The middle two are the control and experimental arms of one study: '
        'two sets shown to the same 46 people.',
    '노출되는 것 — 재작업': 'Exposed on screen, reworked',
    '사전에만 존재 — 앱이 호출하지 않음': 'Dictionary only',
    'MAE% (평균 절대 오차)': 'MAE% (mean absolute error)',
    '단백질': 'Protein',
    '{v}백만 명': '{v} million',
    '{n}건 ({v}%)': '{n} ({v}%)',
    # 국가명
    '차드': 'Chad', '남수단': 'South Sudan', '부르키나파소': 'Burkina Faso',
    '아프가니스탄': 'Afghanistan', '니제르': 'Niger',
    '중앙아프리카공화국': 'Central African Rep.', '말리': 'Mali',
    '기니': 'Guinea', '라이베리아': 'Liberia', '에티오피아': 'Ethiopia',
    '소말리아': 'Somalia', '기니비사우': 'Guinea-Bissau', '베냉': 'Benin',
    '파키스탄': 'Pakistan', '시에라리온': 'Sierra Leone',

    # ── diagrams.py (사용자 흐름) ─────────────────────────────────
    '첫 실행 안내': 'First-run guide', '프로필 설정': 'Profile setup',
    '홈': 'Home', '촬영': 'Capture', '인식': 'Recognition',
    '판정': 'Verdict', '전달': 'Delivery',
    '그림 다섯 장 + 음성': 'Five pictures + speech',
    '건너뛸 수 있다': 'Skippable',
    '나이대 · 조건을 그림으로': 'Age and conditions',
    '입력란이 없다': 'No input field',
    '나이대를 모르면 판정 기준을 유도할 수 없다':
        'Without the age band no threshold can be derived',
    '촬영 버튼 하나': 'One capture button',
    '대상을 고르지 않는다': 'The subject is not chosen',
    'OCR · 모델': 'OCR · model',
    '진행 상태를 표시': 'Progress shown',
    '물리 검사 통과 후': 'Physical checks',
    '개인 기준과 대조': 'Personal limits',
    '그림 · 음성 · 색': 'Picture · speech · colour',
    'SIGIL 합성 픽토그램': 'SIGIL composed pictogram',
    'VOCA 재구성 문장': 'VOCA reconstructed sentence',
    '색 + 기호': 'Colour + symbol',
    '무엇을 해야 하는가': 'What to do',
    '그 그림이 무슨 뜻인가': 'What that picture means',
    '지금 안전한가': 'Is this safe now',
    '최초 1회': 'Once only', '매번': 'Every time',
    '설계 근거': 'Design basis',
    '그림': 'Picture', '음성': 'Speech',
    '색각이상 대응': 'For colour vision deficiency',
    '색만으로 판정하지 않는다 (WCAG 1.4.1)':
        'The verdict never rests on colour alone (WCAG 1.4.1)',
    '전달의 세 층 — 서로를 대체하지 않고 겹친다':
        'Three layers of delivery. They overlap rather than substitute',
    '계층을 두지 않는다 — 비문해 사용자에게 깊은 계층형 65.5초 대 평면 목록형 25초 (Medhi 등, 2013)':
        'No hierarchy. For non-literate users a deep hierarchy took 65.5 s '
        'against 25 s for a flat list (Medhi et al., 2013)',
    '인식 과정을 감추지 않는다 — 아무 표시 없이 멈춘 화면은 고장으로 읽힌다 (Medhi, Cutrell & Toyama, 2010)':
        'Recognition is not hidden. A screen stopped with no indication reads '
        'as a fault (Medhi, Cutrell & Toyama, 2010)',
    '[그림 11]': '[Figure 13]',

    # ── fig10.py (디스펜서) ───────────────────────────────────────
    '40핀 헤더 · BCM 번호': '40-pin header · BCM numbering',
    'SG90 트레이 {tray}': 'SG90 tray {tray}',
    'GPIO {gpio} · 신호만': 'GPIO {gpio} · signal only',
    'WS2812 링 12px': 'WS2812 ring, 12 px',
    '초록/파랑/호박/보라': 'green / blue / amber / violet',
    '피에조 버저': 'Piezo buzzer',
    '2.7 kHz — 난청이 덜 미치는 대역': '2.7 kHz, a band less affected by hearing loss',
    '확인 버튼': 'Confirm button',
    '20 ms 글리치 필터': '20 ms glitch filter',
    '전원이 끊겨도 시각을 안다': 'Keeps time through a power cut',
    '트레이 4–8은 핀만 예약되어 있다': 'Trays 4–8 have pins reserved only',
    'Pi 전용 5 V 2.5 A  ·  서보·링 전용 5 V 2 A+':
        'Pi rail 5 V 2.5 A  ·  servo and ring rail 5 V 2 A+',
    '전원 레일이 둘인 이유': 'Why there are two power rails',
    'SG90 한 개가 걸리면 약 700 mA 를 끈다. 같은 레일에서 뽑으면 Pi 가':
        'One SG90 under load draws about 700 mA. Pulling that from the same rail',
    '브라운아웃으로 내려앉고, 그 순간 쓰이던 파일이 "이 복용을 이미 줬는가"':
        'browns the Pi out, and the file in use at that instant is the one recording',
    '를 적는 파일이다. 접지는 공통으로 묶는다.':
        'whether this dose was already dispensed. Grounds are tied in common.',
    '기기 상태 — 시각·서보 백엔드·트레이별 GPIO·다음 복용':
        'Device state: time, servo backend, GPIO per tray, next dose',
    '복용 기록 — 손으로 내린 것 한 건과 놓친 복용 두 건':
        'Dose log: one manual dispense and two missed doses',
    '노트북에서 같은 펌웨어를 그대로 띄운 것이다. 서보 드라이버만 기록용으로':
        'The same firmware brought up on a laptop, with only the servo driver',
    '바꿨고 API·스케줄러·저장은 기기에서 도는 것과 같은 코드다.':
        'swapped for a recording stub. API, scheduler and storage are the same code.',

    # ── fig15.py (종이 서식) ──────────────────────────────────────
    '파서에 입력한 사진 (원근·조명·초점 열화 포함)':
        'The photograph fed to the parser (perspective, lighting and focus degraded)',
    '읽어낸 값': 'Values read',
    '약을 담은 칸': 'Tray holding the medicine',
    '복용 요일': 'Days of the week',
    '복용 기간': 'Duration',
    '복용 시각': 'Time of day',
    '{v}번 칸': 'Tray {v}',
    '7일': '7 days', '14일': '14 days', '30일': '30 days', '90일': '90 days',
    '계속': 'Ongoing',
    '고른 칸': 'Chosen cell',
    '· 나머지 최대': '· highest of the rest',
    '읽을 수 있다': 'Readable',
    '파서가 읽지 못했다: {r}': 'The parser could not read it: {r}',
    '네 귀퉁이 ArUco 마커로 원근을 보정한 뒤 정해진 좌표의 채움 비율을 읽는다.':
        'Perspective is corrected from the four ArUco corner markers, then the fill '
        'ratio is read at fixed coordinates.',
    '값은 합성 시 정한 정답(3번 칸 · 월수금 · 30일 · 08시)과 일치한다.':
        'The values match the answer set when the image was generated '
        '(tray 3 · Mon/Wed/Fri · 30 days · 08:00).',

    # ── panels.py (화면 묶음 캡션) ────────────────────────────────
    '(a) 촬영': '(a) Capture',
    '(b) 인식 진행': '(b) Recognition in progress',
    '(c) 처방 판정': '(c) Prescription verdict',
    '(a) 영양성분표 판정': '(a) Nutrition label verdict',
    '(b) 오늘 누적': "(b) Today's running total",
    '(c) 기기 연동': '(c) Device link',
    '(a) 첫 실행 안내': '(a) First-run guide',
    '(b) 프로필 설정': '(b) Profile setup',
    # ── 뒤늦게 채운 라벨 ──────────────────────────────────────────
    '조제 오류의 유형별 분포 (약사가 발견한 155건)':
        'Dispensing errors by type (155 found by pharmacists)',
    '진한 막대 = 그림으로 옮길 수 있는 지시 (84.5%)':
        'Dark bars = instructions that can be carried in a picture (84.5%)',
    '연령대별 스마트폰 보유율 (미국, 2025)':
        'Smartphone ownership by age group (United States, 2025)',
    '의약 픽토그램이 이해도 기준을 통과한 비율':
        'Pharmaceutical pictograms passing comprehension criteria',
    '파랑 = 현지 제작 · 회색 = 국제 표준 · 주황 = 본 연구':
        'Blue = locally made · grey = international standard · orange = this work',
    '형성 평가 — 수정 전후 (28회 시행)':
        'Formative evaluation, before and after the fix (28 runs)',
    '시행 수 (n = 28)': 'Runs (n = 28)',
    '여섯 항목 모두 만족': 'All six items satisfied',
    '픽토그램 0장으로 끝남': 'Ended with zero pictograms',
    '수정 전': 'Before fix', '수정 후': 'After fix',
    '형태소 78종의 1차 의미 검사': 'First-pass semantic check of the 78 morphemes',
    '형태소 수 (전체 78종)': 'Morphemes (78 in total)',
    '의도한 대로 읽힘': 'Read as intended',
    '영양 추정 모델의 항목별 오차 (n = 507)':
        'Per-item error of the nutrition estimation model (n = 507)',
    '열량': 'Energy', '질량': 'Mass', '지방': 'Fat', '탄수화물': 'Carbohydrate',
}



def T(s: str) -> str:
    """영어판이면 갈아 끼우고, 아니면 그대로 둔다."""
    if LANG != 'en':
        return s
    return EN.get(s, s)


def missing(strings) -> list:
    """사전에 없는 한국어 라벨을 돌려준다. 생성 뒤 점검용."""
    import re
    return [s for s in strings
            if re.search(r'[가-힣]', s) and s not in EN]