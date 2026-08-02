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
    '전문가 판단 문항과 95% 신뢰구간 (n = {n})': 'Expert judgement with 95% confidence intervals (n = 24)',
    '점이 비율, 가로선이 95% 신뢰구간이다. 선이 긴 것이 표본이 작다는 뜻이다.':
        'Dot is the proportion, bar is the 95% confidence interval. A long bar means a small sample.',
    '부분적으로': 'Partly',
    '예, 가능할 것 같다': 'Yes, probably',
    '판단할 근거가 없다': 'No basis to judge',
    '아니오': 'No',
    '예방 가능한 약물 위해가 생기는 단계 (WHO, 2024)': 'Where preventable medication harm arises (WHO, 2024)',
    '저·중소득국에서 처방 단계로 더 쏠린다. 이 앱은 처방 단계에 개입하지 않는다.':
        'The concentration at prescribing is stronger in LMICs. This app does not intervene at the prescribing stage.',
    '처방·지시': 'Prescribing / ordering', '모니터링·보고': 'Monitoring / reporting',
    '전 세계': 'Worldwide', '저·중소득국': 'LMICs',
    '예방 가능한 위해 중 비율 (%)': 'Share of preventable harm (%)',
    'Medication Without Harm 이 국가 단위로 내려온 정도 (WHO, 2024)':
        'How far Medication Without Harm has reached national level (WHO, 2024)',
    '받아들인 나라와 실제로 조직을 둔 나라 사이가 세 배 벌어진다.':
        'A threefold gap between countries that endorsed it and countries with a body for it.',
    '과제를 승인하고 이행 중': 'Endorsed and implementing',
    '국가 전문가 조직을 둠': 'Has a national expert group',
    '감축 목표를 수로 세움': 'Has a numeric reduction target',
    'WHO 회원국 중 비율 (%)': 'Share of WHO member states (%)',
    '처방전을 읽지 못하는 세 갈래': 'Three ways a prescription goes unread',
    '셋은 서로 겹치며 출처와 분모가 다르다. 크기를 견주려고 놓은 것이 아니다.':
        'The three overlap and come from different sources and denominators. They are not placed here to be ranked.',
    '시력 손상 (WHO)': 'Vision impairment (WHO)',
    '비문해 성인 (UNESCO)': 'Non-literate adults (UNESCO)',
    '선진국 최저 문해 수준 (PIAAC)': 'Below the lowest literacy level, 31 countries (PIAAC)',
    '{v}억 명': '{v}00 million',
    '31개국 성인의 18% · 분모가 달라 막대로 그리지 않는다':
        '18% of adults across 31 countries. A different denominator, so no bar is drawn',
    '사람 수 (백만 명)': 'People (millions)',
    '보고된 세균 감염 중 항생제 내성 비율 (WHO GLASS, 2025)':
        'Share of reported bacterial infections resistant to antibiotics (WHO GLASS, 2025)',
    '세계 평균은 여섯 중 하나다. 값이 높은 두 지역에 문해율이 가장 낮은 나라들이 있다.':
        'The world average is one in six. The two highest regions overlap with those of lowest literacy.',
    '동남아시아 · 동지중해': 'South-East Asia · Eastern Mediterranean',
    '아프리카': 'Africa', '세계 평균': 'World average', '아메리카': 'Americas',
    '셋 중 하나': '1 in 3', '다섯 중 하나': '1 in 5', '여섯 중 하나': '1 in 6', '일곱 중 하나': '1 in 7',
    '내성을 보인 감염의 비율 (%)': 'Share of infections showing resistance (%)',
    '그 밖': 'Other',
    '사용자가 고른 것': 'What the user picked',
    '나이 구간': 'Age band', '그림 넷 중 하나': 'One of four pictures',
    '조건': 'Conditions', '그림 카드': 'Picture cards',
    '대표 나이': 'Representative age', '유발 성분': 'Trigger ingredients',
    '조건마다 다름': 'Varies by condition',
    '하루 에너지': 'Daily energy', '1,200~2,400 kcal': '1,200–2,400 kcal',
    '이 사람의 하루 기준치': "This person's daily reference",
    '유리당 10%E · 포화지방 10%E · 소금 5 g × 비율':
        'Free sugars 10%E · sat fat 10%E · salt 5 g × ratio',
    'WHO 권고가 비율로 쓰여 있으므로 표가 아니라 유도로 푼다 (§2.4)':
        'WHO guidance is written as proportions, so this is derived rather than tabulated (§2.4)',
    '같은 음료 한 캔이 7세에게는 경고, 성인에게는 무해가 되는 이유가 이 경로다':
        'This path is why the same can of drink warns a 7-year-old and not an adult',
    '"무슨 알레르기가 있습니까" 를 셋으로 나눈다':
        '"What are you allergic to" split three ways',
    '지금 아는 것': 'What you know now', '임신 중 · 수유 중': 'Pregnant · breastfeeding',
    '누구나 답할 수 있다': 'Anyone can answer',
    '겪은 것': 'What you have experienced',
    '먹고 속이 안 좋았던 적': 'Ever felt unwell after eating',
    '진단 없이도 답할 수 있다': 'Answerable without a diagnosis',
    '진단받은 것': 'What you were told', '당뇨 · 고혈압': 'Diabetes · hypertension',
    '검사를 받은 사람만': 'Only those who were tested',
    '당뇨 성인의 43%, 고혈압 성인의 44% 는 셋째 칸에 답할 수 없다 (§1.5)':
        '43% of adults with diabetes and 44% with hypertension cannot answer the third box (§1.5)',
    '앞의 두 칸이 있어야 그 사람들이 첫 화면에서 걸러지지 않는다':
        'The first two boxes are what keep those people from being filtered out at the first screen',
    '영양 정보가 들어오는 세 경로': 'Three routes nutrition information arrives by',
    '영양성분표 OCR': 'Nutrition label OCR', '기기 안': 'On device',
    '제품 데이터베이스': 'Product database', '서버 경유': 'Via server',
    '음식 사진 추정': 'Estimation from a food photo',
    '기기 안 · 나중에 추가': 'On device · added later',
    '물리 검사 한 곳': 'One place for the physical checks',
    '범위 · 부분집합 · 질량 보존 · Atwater 항등식':
        'Range · subset · mass balance · Atwater identity',
    '어느 경로로 들어왔는지 묻지 않는다': 'It does not ask which route the value came by',
    '이 사람의 하루 기준치와 대조': "Compared against this person's daily reference",
    '셋째 경로는 나중에 들어왔고, 그때 새로 쓴 검증 코드는 없다 (§4.2)':
        'The third route arrived later, and no new verification code was written for it (§4.2)',
    '경로마다 검사를 두면 붙이는 것을 잊은 경로가 검증 없는 통로가 된다':
        'Per-route checks turn any route someone forgot to attach them to into an unverified channel',
    '전문가 조사 응답자 {n}명의 구성': 'Composition of the {n} expert respondents',
    '왼쪽은 응답자가 고른 분야, 오른쪽은 일한다고 적은 지역이다.':
        'Left: the field each respondent chose. Right: the region they said they work in.',
    '약국·복약지도': 'Pharmacy', '간호·보건': 'Nursing / public health',
    'HCI·디자인': 'HCI / design', '그 외 셋': 'Three others',
    '분야': 'Field', '대륙': 'Continent',
    '아시아': 'Asia', '유럽': 'Europe', '아프리카': 'Africa',
    '북미': 'N. America', '오세아니아': 'Oceania',
    '그림 생성': 'Generate the picture', '형태소 하나': 'One morpheme',
    '관문 1. 기계 검사': 'Gate 1. Mechanical check',
    '잉크 비율 · 32px 생존': 'Ink ratio · survival at 32px',
    '덩어리 개수': 'Number of blobs',
    '관문 2. 의미 검사': 'Gate 2. Semantic check',
    '"무엇으로 보이는가"': '"What does this look like"',
    '보기를 주지 않는다': 'No options are given',
    '통과하면 설치': 'Installed if it passes',
    '떨어지면 사유에 맞춰 다시 그린다': 'On failure it is redrawn according to the reason',
    '뭉쳤다': 'Too clotted', '더 작게 · 구멍을 뚫어': 'Smaller · punch holes',
    '가늘다': 'Too thin', '더 두껍게 · 채워': 'Thicker · fill more',
    '개수가 다르다': 'Wrong count', '정확히 그 수만큼': 'Exactly that many',
    '뜻이 안 맞는다': 'Meaning is wrong',
    '형태를 바꿔 · 무게는 그대로': 'Change the shape · not the weight',
    '처음에는 시도 횟수로 사다리를 올렸다. 둘째 칸이 "더 두껍게" 였고,':
        'At first the ladder was climbed by attempt count. The second rung was "thicker",',
    '뭉쳐서 떨어진 그림에 그 지시를 주면 실패한 방향으로 더 민다.':
        'and giving that to a picture that failed for being clotted pushes it further the way it failed.',
    '마지막 칸이 중요하다. 뜻이 어긋난 것은 형태의 문제이지 무게의 문제가 아니다.':
        'The last rung matters. A wrong meaning is a problem of shape, not of weight.',
    '사진 한 장': 'One photograph',
    '무엇을 찍었는지 고르지 않는다': 'The subject is not chosen',
    '층 1. 기기 안에서 글자를 읽는다': 'Layer 1. Text is read on the device',
    '표지와 영양소 이름을 센다': 'Markers and nutrient names are counted',
    '표지가 맞으면': 'markers match', '글자가 없거나 안 맞으면': 'no text, or no match',
    '전용 해석기': 'Dedicated parser', '성분표 · 처방전': 'Label · prescription',
    '서버를 부르지 않는다': 'No server is called',
    '서버의 시각 모형': 'Vision model on the server',
    '음식 · 음료': 'Food · drink', '인터넷이 필요하다': 'Needs a connection',
    '이 순서 덕분에 처방전과 성분표는 인터넷 없이 읽힌다 (§4.5)':
        'This order is why prescriptions and labels are read without a connection (§4.5)',
    '이 앱에서 가장 급한 두 가지가 그 둘이다': 'Those two are the most urgent things in this app',
    '기기에 인쇄된 열 글자': 'Ten characters printed on the device',
    '양쪽이 각자 가지고 있다': 'Both sides hold it independently',
    '기기 표': 'Device id', '릴레이의 주소': "The relay's address",
    '접근 토큰': 'Access token', '그 사서함의 권한': 'Rights to that mailbox',
    '사서함 열쇠': 'Box key', '일정을 연다': 'Opens the schedule',
    '릴레이가 본다': 'The relay sees it',
    '릴레이가 절대 못 본다': 'The relay never sees it',
    '오가는 것은 전부 AES-256-GCM 이고, 여는 열쇠를 어느 쪽도 보내지 않는다':
        'Everything in transit is AES-256-GCM, and neither side ever sends the opening key',
    '릴레이가 멎었든 닿지 않든, 일정은 이미 기기의 SD 카드에 있다 (§4.3)':
        'Down or unreachable, the schedule is already on the device SD card (§4.3)',
    '서비스워커가 요청을 가르는 세 갈래': 'Three ways the service worker splits requests',
    '판정 API': 'Verdict API', '가로채지 않는다': 'Not intercepted',
    '오래된 답보다 실패가 낫다': 'Failing beats a stale answer',
    '화면 이동': 'Navigation', '네트워크 우선': 'Network first',
    '접속되면 늘 최신': 'Always latest when connected',
    '자산 · 모델 · OCR': 'Assets · model · OCR', '캐시 우선': 'Cache first',
    '처음 쓸 때 받는다': 'Fetched on first use',
    '실패는 사용자가 알아차리지만 오래된 성공은 알아차리지 못한다':
        'A failure is noticed by the user. A stale success is not',
    '16 MB 를 첫 화면에서 요구하면 망이 느린 곳에서는 앱이 안 열린 것처럼 보인다':
        'Demanding 16 MB at the first screen makes the app look unopened where the network is slow',
    '캐시 이름에 자산 지문을 찍는다. 지문이 없으면 고친 그림이 옛 그림으로 계속 나간다':
        'Cache names carry an asset fingerprint. Without it a fixed picture keeps being served as the old one',
    '같은 국제 표준 기호를 네 나라에 시험한 결과 (Hermans 등, 2011)':
        'The same international-standard symbols tested in four countries (Hermans et al., 2011)',
    '왼쪽은 18종 중 ISO 기준을 넘긴 수, 오른쪽은 생물학적 위험 기호 하나의 정답률.':
        'Left: how many of 18 passed the ISO criterion. Right: the correct-response rate for one symbol, biological risk.',
    '벨기에': 'Belgium', '쿠바': 'Cuba', '콩고민주공화국': 'DR Congo', '캄보디아': 'Cambodia',
    '18종 중 통과한 수': 'Passed, of 18', '정답률 (%)': 'Correct responses (%)',
    '형태소 78종의 갈래와 복약 오류 분포의 대응':
        'The 78 morphemes by category, against the distribution of medication errors',
    '진한 막대가 표 4 의 상위 세 오류에 곧바로 대응하는 갈래다.':
        'The dark bars are the categories that map directly onto the top errors in Table 4.',
    '제형·기기·행위': 'Form · device · action', '음식': 'Food', '알레르겐': 'Allergen',
    '증상': 'Symptom', '상태': 'State', '부위': 'Body site',
    '개수': 'Count', '시각': 'Time of day', '보관': 'Storage',
    '무엇을': 'What', '무엇을 피하나': 'What to avoid', '무엇을 겪었나': 'What was experienced',
    '누구인가': 'Who', '어디에': 'Where', '어떻게': 'How',
    '얼마나 · 용량 오류 28.4%': 'How much · dose errors 28.4%',
    '언제 · 시각 오류 23.2%': 'When · timing errors 23.2%',
    '형태소 수 (합계 78)': 'Morphemes (78 in total)',
    '약국 {p}명과 간호·보건 {n}명이 답한 것':
        'What the 11 pharmacy and 9 nursing respondents answered',
    '분모가 작아 백분율 대신 사람 수로 적었다. 한 사람이 8%p 를 움직인다.':
        'Counts rather than percentages, because the denominators are small. One person moves 9 points.',
    '약사가 매번 검토': 'Pharmacist reviews every time',
    '조제하면서 권할 수 있다': 'Can be recommended while dispensing',
    '그림·음성만으로 안 되는 것이 있다': 'Some things need more than picture and speech',
    '용량·횟수가 가장 중요': 'Dose and frequency matter most',
    '약국·복약지도 ({n}명)': 'Pharmacy ({n})',
    '조건이 갖춰지면 결과를 바꾼다': 'Can change outcomes given conditions',
    '그런 환자를 본 적이 있다': 'Have seen such patients',
    '환자와 보호자를 각각 다르게': 'Design patient and carer separately',
    '복약순응도 도구로 재야 한다': 'Measure with an adherence instrument',
    '간호·보건 ({n}명)': 'Nursing / public health ({n})',
    '음식 · 음료': 'Food · drink', '처방전 · 의약품': 'Prescription · medicine',
    '원형 그림과 판정 문장': 'Round picture and verdict sentence',
    '색과 기호의 요약 띠': 'Summary bar with colour and symbol',
    '픽토그램 시퀀스': 'Pictogram sequence',
    '영양소 막대 (최대 3)': 'Nutrient bars (up to 3)',
    '대안 제시 카드': 'Alternative suggestion card', '확인 버튼': 'Confirm button',
    '원형 그림': 'Round picture', '약 이름과 1회 용량': 'Drug name and dose',
    '색과 기호의 안전 띠': 'Safety bar with colour and symbol',
    '용량 카드와 보관 카드': 'Dose card and storage card',
    '복용 시각 표': 'Dosing schedule',
    '처방전에서는 픽토그램을 글 카드보다 위로 올렸다':
        'For prescriptions the pictograms were moved above the text cards',
    '아래에 두었을 때, 글을 읽지 못하는 사람은 빈 카드 셋을 지나야 그림에 닿았다':
        'With them below, someone who cannot read had to pass three empty cards to reach a picture',
    'ArUco 네 귀퉁이': 'ArUco at four corners', '적응형 이진화': 'Adaptive threshold',
    '칸별 채움 비율': 'Fill ratio per cell', '값 정하기': 'Deciding the value',
    '못 찾으면 값을 지어내지 않는다': 'If not found, no value is invented',
    '하나만 고르는 항목에서 값을 내지 않는 세 갈래':
        'Three ways a single-choice item yields no value',
    '아무것도 안 칠했다': 'Nothing filled in', '빈 종이': 'Blank',
    '둘 다 제대로 칠했다': 'Both properly filled', '종이가 두 말을 한다': 'The paper says two things',
    '갈라지지 않는다': 'Does not separate', '1등과 2등이 붙어 있다': 'First and second are too close',
    '셋 다 값을 내지 않고 문제로 보고한다. 잘못 읽은 복용 시각은 못 읽은 것보다 위험하다':
        'All three yield no value and report a problem. A misread dosing time is worse than none',
    '이름이 붙은 문제는 사용자를 종이로 돌려보내며 되돌릴 수 있다. 확신에 찬 오독은 되돌릴 수 없다':
        'A named problem sends the user back to the paper and is recoverable. A confident misreading is not',
    '기기가 만든 개인키': 'Device-generated key',
    '브라우저 밖으로 못 나간다': 'Cannot leave the browser',
    '서명하는 대상': 'What is signed',
    '시각 · 메서드 · 본문 해시': 'Timestamp · method · body hash',
    '시각': 'Timestamp', '본문 해시': 'Body hash',
    '접근 통제는 서명과 별개다. 저장 위치를 공개키에서 유도하므로 남의 자료를 요청할 방법이 없다':
        'Access control is separate from the signature. The storage location is derived from the '
        'public key, so there is no way to request another person\'s data',
    '가로챈 서명을 나중에 못 쓴다. 5분 넘으면 거절':
        'An intercepted signature cannot be replayed. Older than five minutes is refused',
    '서명만 떼어 다른 내용에 못 붙인다':
        'A signature cannot be detached and attached to other content',
    '둘 중 하나라도 빠지면 서명은 있으나 마나가 된다':
        'Missing either one makes the signature worthless',
    # ── diagrams.py · problem_synthesis (§1.11) ───────────────────
    '1장이 댄 것': 'What chapter 1 established',
    '그래서 필요한 것': 'What that calls for',
    '규모': 'Scale', '대가': 'Cost', '시각적 방법': 'The visual route',
    '표준의 제약': 'The standard\'s constraint', '열린 경로': 'An open channel',
    '비문해 성인 7억 3,900만 명 · 한국 65세 이상 59.7%':
        '739 million non-literate adults; 59.7% of Koreans aged 65+',
    '내성 사망 127만 명 · 복약 오류 연 420억 달러':
        '1.27 million deaths from resistance; USD 42 billion a year in medication error',
    '기억에는 남지만 108종 중 17종만 기준 통과':
        'Better remembered, yet only 17 of 108 symbols met the criterion',
    'USP 81종은 결합이 라이선스로 금지되어 있다':
        'The USP set of 81 is barred by licence from being combined',
    '65세 이상의 78%가 이미 손전화를 가지고 있다':
        '78% of adults aged 65+ already carry a smartphone',
    '조합': 'Composition', '배포 전 측정': 'Measured before release',
    '문자 없는 전달': 'Delivery without text',
    '처방 지시 하나를 그림 하나로 세울 것':
        'One prescription instruction should stand as one picture',
    '읽히는지를 사람에게 내보내기 전에 잴 것':
        'Whether it reads should be measured before it reaches anyone',
    '보조 수단까지 읽기를 요구하지 않을 것':
        'The fallback must not demand reading either',
    '우리가 찾은 범위에서 이 셋을 함께 갖춘 것은 없었다. 없다가 아니라 찾지 못했다로 읽어야 한다':
        'Within what we searched, nothing held all three. Read that as '
        '"we did not find it", not as "it does not exist"',

    # ── charts.py · chart_ageing (§1.7) ───────────────────────────
    '고령 인구는 늘면서 저·중소득국으로 옮겨간다':
        'The older population is growing and shifting to lower-income countries',
    '왼쪽 WHO, 2024 · 오른쪽 65세 이상 · 질병관리청 2023, Lee 등 2021':
        'Left: WHO, 2024 · Right: age 65+, KDCA 2023 and Lee et al. 2021',
    '2020년': '2020', '2030년': '2030', '2050년': '2050',
    '저·중소득국\n3분의 2': '2/3 in\nlower-income\ncountries',
    '60세 이상 인구 (십억 명)': 'Population aged 60+ (billions)',
    '스스로 약을 먹는다': 'Manage their own medicines',
    '건강정보이해능력 적절': 'Adequate health literacy',
    '복약 안전 교육 받음': 'Received medication-safety education',
    '한국 고령자에서의 비율 (%)': 'Share among older adults in Korea (%)',

    # ── charts.py · 손글씨 측정 (§5.7) ────────────────────────────
    '손글씨 약 이름 {n}장을 읽힌 결과': 'Reading {n} handwritten drug names',
    'RxHandBD (Zenodo 18478741) · 방글라데시 실제 처방전에서 잘라낸 낱말':
        'RxHandBD (Zenodo 18478741) · words cut from real Bangladeshi prescriptions',
    '정확히 읽음': 'Read exactly', '한두 글자 어긋남': 'Off by a\ncharacter or two',
    '전혀 다르게 읽음': 'Read as\nsomething else', '장수': 'Count',
    '붉은 칸이 더 위험하다': 'The red bar is the more dangerous one',
    '남는 비율': 'Share surviving', '남은 것의 정확도': 'Accuracy of survivors',
    '확신도 문턱': 'Confidence threshold',
    '둘을 함께 만족하는\n문턱이 없다': 'No threshold satisfies\nboth at once',
    '처방전 전장 {n}장. 답이 잘리던 것을 고치기 전과 뒤':
        '{n} full prescription pages, before and after fixing the truncated replies',
    'Mendeley k62rfd23kz · 약 이름 영역 개수가 주석된 방글라데시 처방전':
        'Mendeley k62rfd23kz · Bangladeshi prescriptions annotated with drug-name counts',
    '처방전으로 알아본 비율': 'Recognised as a prescription',
    '약 가짓수 재현율': 'Recall of medicine count',
    '실패한 11장은 무작위가 아니었다.\n전부 약이 5~12가지 적힌 장이었다':
        'The 11 failures were not random.\nEvery one carried 5 to 12 medicines',

    # ── charts.py · chart_expressive (§1.9) ───────────────────────
    '고정 목록과 문법은 다른 속도로 늘어난다':
        'A fixed list and a grammar grow at different rates',
    '연산자(금지 · 하루 횟수 · 반쪽)를 적용하기 전의 수':
        'Counted before any operator (negation, daily cadence, half) is applied',
    'USP 세트': 'USP set', 'SIGIL 문법': 'SIGIL grammar',
    'USP 심볼': 'One USP symbol', 'SIGIL 머리': 'One SIGIL head',
    'SIGIL 수식어': 'One SIGIL modifier',
    '지금 낼 수 있는 칸 수': 'Cells the set can render today',
    '하나를 더 만들 때 늘어나는 칸 수': 'Cells gained by drawing one more',

    # ── diagrams.py · voca_rebuild (§2.3) ─────────────────────────
    '처방전 한 장에 적혀 있는 것': 'What one prescription sheet carries',
    '읽지 않고 버린다': 'Dropped, never read aloud',
    '환자 등록번호': 'Patient record number',
    '의료기관명': 'Name of the institution',
    '처방 코드': 'Prescription code',
    '의사 면허번호': 'Prescriber licence number',
    '교부 일자': 'Date of issue',
    '약품 코드': 'Drug code',
    '남긴다': 'Kept',
    '약 이름': 'Drug name',
    '1회 용량': 'Dose per intake',
    '복용법': 'How to take it',
    '보관 방법': 'Storage',
    '제형 (문장이 되지 않는다)': 'Dosage form (never becomes a sentence)',
    '남긴 것을 이 순서로 말한다. 듣는 사람은 되감을 수 없다':
        'What is kept is spoken in this order. The listener cannot rewind',
    '무엇에 대한 말인지 세운다': 'Establishes what this is about',
    '형성 평가 첫 측정에서 음성까지 도달하지 않던 항목':
        'Did not reach the speech channel in the first formative measurement',
    '언제 · 얼마나 자주': 'When and how often',
    '냉장일 때만 말한다': 'Spoken only when refrigeration is required',
    '제형은 읽히지 않는다. 동사와 부위를 정하고 사라진다 (표 9)':
        'The dosage form is never spoken. It fixes the verb and the site, then disappears (Table 9)',
    '안약에 "Take as prescribed." 를 붙이면 동사를 가른 이유가 마지막 문장에서 무너진다':
        'Ending an eye drop with "Take as prescribed." undoes, in the last sentence, '
        'the reason the verbs were split at all',
    '버린 여섯 줄은 환자가 할 일을 하나도 바꾸지 않는다. 읽어 주면 그만큼 앞의 넷이 묻힌다':
        'None of the six dropped lines changes what the patient has to do. '
        'Reading them aloud only buries the four that do',

    '읽지 못했다': 'Could not read it',
    '다시 찍으면 된다': 'Another photograph will do',
    '422 · 못 알아봄': '422 · not recognised',
    '더 가까이 · 평평하게 · 손을 멈추고':
        'Move closer · lay it flat · hold steady',
    '다시 찍어도 소용없다': 'Retrying will not help',
    '501 · 수단 없음': '501 · no means available',
    '성분표를 찍거나 예시를 고른다': 'Photograph a label or pick a sample',
    '실패 문장은 화면에 뜨는 동시에 스스로 소리 내어 읽힌다':
        'The failure sentence is spoken aloud as it appears',
    '앱의 다른 화면은 모두 그림과 음성으로 말하는데, 실패했을 때만 글자 한 줄이 조용히 떠 있었다':
        'Every other screen speaks in pictures and speech; on failure alone a line of text sat there silently',
    '가장 도움이 필요한 순간에만 유일하게 글을 요구하고 있었던 셈이다':
        'The one moment that most needed help was the only one demanding text',
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