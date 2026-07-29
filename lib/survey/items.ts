/**
 * 전문가 설문 문항 정의.
 *
 * 설계 근거는 scratchpad/survey-design.md 에 있다. 요점만 옮기면 네 가지다.
 *
 *  1) 문항이 제안서의 어떤 문장도 바꾸지 못하면 넣지 않는다. 설문은 우리가 모르는
 *     것을 메우려고 돌리는 것이고, 아는 것을 확인받으려고 돌리는 것이 아니다.
 *  2) 반증을 묻는다. "유용하십니까" 는 예의상 예가 돌아온다. 명단에 우리 설계에
 *     반대 근거를 가진 연구자가 8명 있는데, 유도형 문항을 쓰면 그 답까지 버린다.
 *  3) 공통 코어는 전원 필수로 둔다. 전부 선택이면 "응답자 N명 중 M명" 을 쓸 수
 *     없고 일화만 남는다. 선택은 문항 단위가 아니라 구획 단위에 둔다.
 *  4) 언어를 갈라도 분모는 갈리지 않게 한 폼에서 전환한다. 폼을 셋으로 나누면
 *     몰도바 대상자 45명이 별도 집계가 되어 버린다.
 */

export type Lang = 'ko' | 'en' | 'ro';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
  { id: 'ro', label: 'Română' },
];

/** 문항 한 개. `follow` 는 선택지를 고른 뒤 이어서 받는 자유 서술이다. */
export type Item = {
  id: string;
  kind: 'single' | 'text' | 'longtext' | 'scale';
  q: Record<Lang, string>;
  /** 왜 묻는지. 응답자에게 보여준다 — 맥락을 알면 답이 구체적으로 온다. */
  note?: Record<Lang, string>;
  options?: Record<Lang, string>[];
  follow?: Record<Lang, string>;
  required?: boolean;
};

const T = (ko: string, en: string, ro: string): Record<Lang, string> => ({ ko, en, ro });

/* ─────────────────────────── 동의 ─────────────────────────── */

export const CONSENT = {
  title: T('동의', 'Consent', 'Consimțământ'),
  body: T(
    '이 설문은 제16회 e-ICON 세계대회 출품작 SnapCare 에 대한 전문가 의견을 모읍니다. ' +
      '수집 항목은 응답 내용과 (선택 입력 시) 소속·이메일입니다. 대회 종료 후 12개월간 보관하고 그 뒤 삭제합니다. ' +
      '삭제나 열람을 원하시면 아래 연락처로 알려 주시면 됩니다. 이메일 입력은 선택이며, 익명으로도 답하실 수 있습니다.',
    'This survey collects expert feedback on SnapCare, an entry in the 16th e-ICON World Contest. ' +
      'We collect your answers and, if you choose to enter them, your affiliation and email. We keep responses for 12 months ' +
      'after the contest and then delete them. Write to the address below to access or delete yours. Email is optional — you may answer anonymously.',
    'Acest chestionar colectează opinii de specialitate despre SnapCare, o lucrare înscrisă la a 16-a ediție e-ICON World Contest. ' +
      'Colectăm răspunsurile dumneavoastră și, dacă alegeți să le introduceți, afilierea și adresa de e-mail. Păstrăm răspunsurile 12 luni ' +
      'după concurs, apoi le ștergem. Scrieți la adresa de mai jos pentru acces sau ștergere. E-mailul este opțional — puteți răspunde anonim.',
  ),
  agree: T(
    '위 내용을 읽었고 참여에 동의합니다.',
    'I have read the above and agree to take part.',
    'Am citit informațiile de mai sus și accept să participodat.',
  ),
  cite: T(
    '응답을 프로젝트 문서에 인용하는 것에 동의합니다. (인용 범위는 마지막에 다시 고르실 수 있습니다)',
    'I agree that my response may be quoted in the project documents. (You choose the scope at the end.)',
    'Accept ca răspunsul meu să fie citat în documentele proiectului. (Alegeți limita la final.)',
  ),
};

/* ──────────────────── 0. 응답자 배경 (필수) ──────────────────── */

export const FIELDS: { id: string; label: Record<Lang, string> }[] = [
  { id: 'pharmacy', label: T('약국·복약지도 실무', 'Pharmacy / medication counselling', 'Farmacie / consiliere medicamentoasă') },
  { id: 'nursing', label: T('간호·보건', 'Nursing / public health', 'Nursing / sănătate publică') },
  { id: 'aac', label: T('AAC·특수교육', 'AAC / special education', 'CAA / educație specială') },
  { id: 'literacy', label: T('성인문해교육', 'Adult literacy education', 'Educația alfabetizării adulților') },
  { id: 'hci', label: T('HCI·디자인', 'HCI / design', 'HCI / design') },
  { id: 'law', label: T('법·개인정보', 'Law / data protection', 'Drept / protecția datelor') },
  { id: 'standards', label: T('표준·규제', 'Standards / regulation', 'Standardizare / reglementare') },
  { id: 'industry', label: T('산업 실무 (제품 개발·운영)', 'Industry practitioner (building / operating products)', 'Practician în industrie (dezvoltare / operare produse)') },
  { id: 'other', label: T('그 밖', 'Other', 'Altele') },
];

export const BACKGROUND: Item[] = [
  {
    id: 'b_field',
    kind: 'single',
    required: true,
    q: T('주 분야는 무엇입니까?', 'What is your main field?', 'Care este domeniul dumneavoastră principal?'),
    options: FIELDS.map((f) => f.label),
  },
  {
    id: 'b_exposure',
    kind: 'single',
    required: true,
    q: T(
      '글로 된 복약 지시를 읽지 못하는 사람과 실제로 마주치는 빈도는 얼마나 됩니까?',
      'How often do you actually encounter someone who cannot read written medication instructions?',
      'Cât de des întâlniți efectiv o persoană care nu poate citi instrucțiunile scrise pentru medicamente?',
    ),
    note: T(
      '이 프로젝트는 그런 분들이 현장에 있다는 전제 위에 서 있는데, 우리는 당사자를 직접 만난 적이 없습니다. 그래서 이 문항이 전제 자체를 시험합니다.',
      'This project rests on the assumption that such people are there, and we have never met one directly. This question tests that assumption itself.',
      'Acest proiect se bazează pe presupunerea că astfel de persoane există, iar noi nu am întâlnit direct niciuna. Această întrebare testează chiar acea presupunere.',
    ),
    options: [
      T('거의 없다', 'Almost never', 'Aproape niciodată'),
      T('연 몇 회', 'A few times a year', 'De câteva ori pe an'),
      T('월 1회 정도', 'About monthly', 'Aproximativ lunar'),
      T('주 1회 이상', 'Weekly or more', 'Săptămânal sau mai des'),
      T('거의 매일', 'Almost daily', 'Aproape zilnic'),
    ],
  },
  {
    id: 'b_country',
    kind: 'text',
    q: T('주로 일하는 국가', 'Country where you mainly work', 'Țara în care lucrați în principal'),
  },
  {
    // 이름과 소속은 선택이다. 필수로 두면 비판적인 답이 줄어든다 — 이 설문에서
    // 가장 값어치 있는 것이 A2("이 시스템이 환자를 해칠 경로")의 솔직한 답이라
    // 익명을 허용하는 편이 낫다. 다만 익명 응답은 중복을 걸러낼 수 없다.
    id: 'b_name',
    kind: 'text',
    q: T('성함', 'Your name', 'Numele dumneavoastră'),
    note: T(
      '익명으로 답하셔도 됩니다. 이름을 남기시면 같은 분의 응답이 중복 집계되는 것을 막고, 인용을 허락하신 범위 안에서 출처를 밝힐 수 있습니다.',
      'You may answer anonymously. Giving a name lets us avoid counting the same person twice and lets us attribute your view within the citation scope you choose.',
      'Puteți răspunde anonim. Dacă vă dați numele, putem evita numărarea dublă și vă putem atribui opinia în limitele de citare pe care le alegeți.',
    ),
  },
  {
    id: 'b_affil',
    kind: 'text',
    q: T('소속', 'Affiliation', 'Afiliere'),
  },
];

/* ──────────────────── A. 공통 코어 (필수) ──────────────────── */

export const CORE: Item[] = [
  {
    id: 'a1_notext',
    kind: 'single',
    required: true,
    q: T(
      'SnapCare 는 판단 경로에서 문자를 완전히 없앴습니다. 이 선택은 어떻습니까?',
      'SnapCare removes text entirely from the decision path. What do you make of that choice?',
      'SnapCare elimină complet textul din traseul decizional. Ce părere aveți despre această alegere?',
    ),
    options: [
      T('필요조건이다', 'Necessary', 'Necesară'),
      T('도움은 되나 불충분하다', 'Helpful but insufficient', 'Utilă, dar insuficientă'),
      T('중립', 'Neutral', 'Neutră'),
      T('위험하다', 'Risky', 'Riscantă'),
      T('유해하다', 'Harmful', 'Dăunătoare'),
    ],
    follow: T('한 문장으로 이유를 적어 주십시오.', 'Give your reason in one sentence.', 'Motivați într-o singură frază.'),
  },
  {
    id: 'a2_harm',
    kind: 'longtext',
    required: true,
    q: T(
      '이 시스템 때문에 환자가 약을 잘못 복용하게 되는 가장 그럴듯한 경로는 무엇입니까?',
      'What is the most likely way this system leads a patient to take medication incorrectly?',
      'Care este modul cel mai probabil în care acest sistem duce un pacient să ia medicamentul greșit?',
    ),
    note: T(
      '칭찬보다 이 답이 훨씬 쓸모 있습니다. 구체적으로 적어 주시면 그대로 설계를 고칩니다.',
      'This answer is far more useful to us than praise. The more concrete it is, the more directly we change the design.',
      'Acest răspuns ne este mult mai util decât laudele. Cu cât este mai concret, cu atât schimbăm mai direct designul.',
    ),
  },
  {
    id: 'a3_voice',
    kind: 'single',
    required: true,
    q: T(
      '이 앱은 픽토그램과 음성을 함께 제시하고 문서 설명은 넣지 않습니다. 음성이 문서 설명을 충분히 대신합니까?',
      'The app pairs pictograms with synthesized speech and provides no written text. Does the speech channel adequately substitute for written instructions?',
      'Aplicația combină pictograme cu voce sintetizată și nu oferă text scris. Canalul vocal înlocuiește în mod adecvat instrucțiunile scrise?',
    ),
    note: T(
      '선행 연구(Gutierrez et al., 2022)는 픽토그램 단독 대신 구두와 문서 설명을 함께 쓰라고 권고했고, USP 픽토그램 라이선스도 픽토그램을 정보 전달의 유일한 수단으로 쓰지 말라고 정합니다. 우리는 구두는 받아들이고 문서는 뺐습니다. 그 판단이 옳은지 묻는 문항입니다.',
      'Prior work (Gutierrez et al., 2022) recommends complementing pictograms with verbal *and* written instructions, and the USP pictogram licence states pictograms should not be the sole means of conveying information. We adopted the verbal channel and dropped the written one. This question asks whether that was right.',
      'Studiile anterioare (Gutierrez et al., 2022) recomandă completarea pictogramelor cu instrucțiuni verbale *și* scrise, iar licența pictogramelor USP prevede că pictogramele nu trebuie să fie singurul mijloc de transmitere a informației. Am adoptat canalul verbal și am renunțat la cel scris. Această întrebare verifică dacă a fost corect.',
    ),
    options: [
      T('예, 충분하다', 'Yes, adequately', 'Da, în mod adecvat'),
      T('부분적으로', 'Partly', 'Parțial'),
      T('아니오', 'No', 'Nu'),
    ],
    follow: T('왜 그렇습니까?', 'Why?', 'De ce?'),
  },
  {
    id: 'a4_onefix',
    kind: 'longtext',
    required: true,
    q: T(
      '실제 환자가 쓰기 전에 딱 하나만 반드시 고치라고 요구한다면 무엇입니까?',
      'If you could require one change before real patients use this, what would it be?',
      'Dacă ați putea impune o singură modificare înainte ca pacienții reali să o folosească, care ar fi?',
    ),
  },
  {
    id: 'a5_notrecommend',
    kind: 'longtext',
    q: T(
      '당신의 현장에서 이 앱을 환자에게 권하지 않게 될 사유는 무엇입니까?',
      'In your setting, what would make you not recommend this to a patient?',
      'În contextul dumneavoastră, ce v-ar face să nu recomandați aceasta unui pacient?',
    ),
  },
  {
    id: 'a6_evidence',
    kind: 'longtext',
    required: true,
    q: T(
      '이것이 효과가 있는지 없는지, 무엇을 보면 판단하겠습니까? 어떤 결과가 나오면 납득하겠습니까?',
      'How would you judge whether this works — what outcome would convince you?',
      'Cum ați aprecia dacă funcționează — ce rezultat v-ar convinge?',
    ),
  },
  {
    id: 'a7_framing',
    kind: 'single',
    required: true,
    q: T(
      '문제 설정 — 저문해 성인이 복약 정보에서 소외되어 있다 — 이 진술은 당신의 경험과 맞습니까?',
      'Our problem framing — that adults with low literacy are underserved by medication instructions — does it match your experience?',
      'Formularea problemei noastre — că adulții cu alfabetizare redusă sunt deserviți insuficient de instrucțiunile pentru medicamente — corespunde experienței dumneavoastră?',
    ),
    options: [
      T('맞다', 'Yes', 'Da'),
      T('부분적으로', 'Partly', 'Parțial'),
      T('아니다', 'No', 'Nu'),
    ],
    follow: T('덧붙일 말이 있으면 적어 주십시오.', 'Anything to add?', 'Aveți ceva de adăugat?'),
  },
];

/* ──────────────────── C. 분야별 구획 (선택) ──────────────────── */

export type Branch = { id: string; title: Record<Lang, string>; items: Item[] };

const short = (id: string, ko: string, en: string, ro: string, note?: Record<Lang, string>): Item => ({
  id,
  kind: 'longtext',
  q: T(ko, en, ro),
  note,
});

export const BRANCHES: Branch[] = [
  {
    id: 'q1',
    title: T(
      'Q1. 글 못 읽는 성인은 실제로 복약 정보를 어떻게 다루는가',
      'Q1. How do adults who cannot read actually handle medication information?',
      'Q1. Cum gestionează efectiv adulții care nu pot citi informațiile despre medicamente?',
    ),
    items: [
      short('q1_now', '그 사람들이 지금 실제로 쓰는 방법은 무엇입니까?', 'What do those people actually do today?', 'Ce fac efectiv acele persoane în prezent?'),
      short('q1_proxy', '가족·약사 같은 매개자에게 의존하는 비중은 어느 정도로 보십니까?', 'How much do they rely on an intermediary — family, pharmacist?', 'Cât de mult depind de un intermediar — familie, farmacist?'),
      short('q1_phone', '스마트폰을 쓸 수 있는 사람의 비중은 어떻습니까?', 'What share of them can use a smartphone?', 'Ce proporție dintre ei pot folosi un smartphone?'),
      short(
        'q1_replace',
        '이 앱이 매개자를 대체하려 드는 것이 옳습니까, 매개자를 도와야 합니까?',
        'Should this app try to replace the intermediary, or support them?',
        'Ar trebui ca aplicația să înlocuiască intermediarul sau să îl sprijine?',
      ),
    ],
  },
  {
    id: 'q2',
    title: T('Q2. 픽토그램 단독으로 충분한가', 'Q2. Are pictograms alone sufficient?', 'Q2. Sunt pictogramele suficiente singure?'),
    items: [
      short('q2_limit', '픽토그램만으로 전달 가능한 복약 지시의 한계선은 어디입니까?', 'Where is the limit of what a pictogram alone can convey?', 'Unde este limita a ceea ce poate transmite singură o pictogramă?'),
      short('q2_culture', '문화나 지역에 따라 달리 읽히는 그림의 예를 들어 주십시오.', 'Give an example of an image that reads differently across cultures.', 'Dați un exemplu de imagine care se citește diferit în funcție de cultură.'),
      short('q2_grammar', '78개 형태소를 문법으로 결합한다는 접근에 대한 의견', 'Your view on composing 78 visual morphemes by a grammar', 'Părerea dumneavoastră despre compunerea a 78 de morfeme vizuale printr-o gramatică'),
      short(
        'q2_against',
        '우리 설계에 반대되는 근거를 알고 계시면 알려 주십시오.',
        'If you know evidence that argues against our design, please tell us.',
        'Dacă cunoașteți dovezi care contrazic designul nostru, vă rugăm să ni le spuneți.',
        T(
          '반대 근거가 찬성보다 값어치 있습니다. 발표 전에 알아야 합니다.',
          'Counter-evidence is worth more to us than agreement. We would rather know before we present.',
          'Contraargumentele valorează mai mult decât acordul. Preferăm să aflăm înainte de prezentare.',
        ),
      ),
    ],
  },
  {
    id: 'q3',
    title: T('Q3. 복약지도 실무와 맞는가', 'Q3. Does this match real medication-counselling practice?', 'Q3. Corespunde practicii reale de consiliere medicamentoasă?'),
    items: [
      short('q3_spoken', '실제 복약지도에서 말로 전달하는 것 중 이 앱이 놓치는 것은 무엇입니까?', 'What do you say aloud in counselling that this app misses?', 'Ce spuneți verbal în consiliere și ce omite aplicația?'),
      short('q3_duty', '약사의 법적 복약지도 의무와 충돌하는 지점이 있습니까?', 'Does this conflict with a pharmacist’s legal counselling duty?', 'Intră în conflict cu obligația legală de consiliere a farmacistului?'),
      short('q3_review', '이 앱이 출력하는 지시를 약사가 검토해야 합니까?', 'Should a pharmacist review the instructions this app produces?', 'Ar trebui un farmacist să revizuiască instrucțiunile generate?'),
      short('q3_adr', '부작용·이상반응 보고 경로와 어떻게 이어야 합니까?', 'How should this connect to adverse-event reporting?', 'Cum ar trebui să se conecteze la raportarea reacțiilor adverse?'),
    ],
  },
  {
    id: 'q4',
    title: T('Q4. 이해도 시험을 어떻게 설계하는가', 'Q4. How should the comprehension test be designed?', 'Q4. Cum ar trebui proiectat testul de comprehensiune?'),
    items: [
      short('q4_smalln', '소규모 표본으로 ISO 67% · ANSI 85% 를 재는 현실적 방법', 'A realistic way to measure ISO 67% / ANSI 85% with a small sample', 'O metodă realistă de a măsura ISO 67% / ANSI 85% cu un eșantion mic'),
      short(
        'q4_prescreen',
        '시각 언어 모델 채점을 사람 시험 앞의 사전 선별로 쓰는 것이 타당합니까?',
        'Is it methodologically sound to use vision-language-model scoring as a pre-screen ahead of human testing?',
        'Este corect din punct de vedere metodologic să folosim evaluarea printr-un model vizual-lingvistic ca pre-filtrare înaintea testării cu oameni?',
        T(
          '우리는 78개를 사람이 아니라 기계에게 물어 걸렀습니다. 사람 시험을 대체하려는 것이 아니라 그 앞에 두려는 것인데, 그 위치가 정당한지 판단을 듣고 싶습니다.',
          'We screened all 78 by asking a model, not people. We do not mean it to replace human testing but to sit in front of it — we want your judgement on whether that position is defensible.',
          'Am filtrat toate cele 78 întrebând un model, nu oameni. Nu intenționăm să înlocuim testarea umană, ci să o precedăm — dorim opinia dumneavoastră dacă această poziție este justificabilă.',
        ),
      ),
      short('q4_outcome', '이해도에서 복약 오류로 넘어가려면 무엇을 재야 합니까?', 'To move from comprehension to actual dosing errors, what should we measure?', 'Pentru a trece de la comprehensiune la erorile reale de dozare, ce ar trebui măsurat?'),
      short('q4_recruit', '저문해 참가자를 모집할 때 유의할 점', 'What to watch for when recruiting low-literacy participants', 'La ce trebuie atenție când recrutați participanți cu alfabetizare redusă'),
    ],
  },
  {
    id: 'q5',
    title: T('Q5. 78개 형태소 체계가 일관·확장 가능한가', 'Q5. Is the 78-morpheme system coherent and extensible?', 'Q5. Este sistemul de 78 de morfeme coerent și extensibil?'),
    items: [
      short('q5_break', '형태소 조합이 늘어날 때 시각적으로 깨지는 지점은 어디라고 보십니까?', 'Where does a composed set start to break down visually as combinations grow?', 'Unde începe să se destrame vizual un set compus, pe măsură ce combinațiile cresc?'),
      short('q5_iconicity', '도상성(transparency · translucency)을 어떤 지표로 보고해야 합니까?', 'Which iconicity measures should we report — transparency, translucency?', 'Ce indicatori de iconicitate ar trebui să raportăm — transparență, translucență?'),
      short('q5_compare', '조합 규칙을 공개한 기존 체계(ARASAAC · Blissymbolics)와 비교하면 어떻습니까?', 'How does this compare with existing systems that publish composition rules (ARASAAC, Blissymbolics)?', 'Cum se compară cu sistemele existente care publică reguli de compunere (ARASAAC, Blissymbolics)?'),
      short('q5_color', '색·크기·배치가 뜻에 관여할 때 주의할 점', 'What to watch for when colour, size, or placement carries meaning', 'La ce trebuie atenție când culoarea, dimensiunea sau poziția transmit sens'),
    ],
  },
  {
    id: 'q6',
    title: T('Q6. 익명 인증으로 건강정보를 다뤄도 되는가', 'Q6. Is anonymous authentication acceptable for health data?', 'Q6. Este acceptabilă autentificarea anonimă pentru datele de sănătate?'),
    items: [
      short('q6_status', '계정·비밀번호 없이 기기 내 키로만 인증하는 설계의 법적 지위', 'The legal standing of authenticating only with an in-device key, with no account or password', 'Statutul juridic al autentificării doar cu o cheie din dispozitiv, fără cont sau parolă'),
      short('q6_blob', '서버가 암호화된 데이터만 보관하면 개인정보 처리에 해당합니까?', 'If the server holds only encrypted blobs, is that still processing personal data?', 'Dacă serverul păstrează doar date criptate, aceasta constituie totuși prelucrare de date personale?'),
      short('q6_loss', '기기를 잃으면 데이터가 사라지는 설계는 받아들여집니까?', 'Is a design where losing the device loses the data acceptable?', 'Este acceptabil un design în care pierderea dispozitivului duce la pierderea datelor?'),
      short('q6_consent', '저문해 사용자에게 동의를 받는 방법', 'How to obtain informed consent from a user who cannot read', 'Cum se obține consimțământul informat de la un utilizator care nu poate citi'),
    ],
  },
  {
    // 처음에는 이 구획이 "몰도바에서 쓸 수 있는가" 였다. 그것이 잘못이었다.
    // 몰도바는 팀원이 있는 나라이지 문제가 몰린 나라가 아니고, 이 프로젝트는
    // 몰도바를 겨냥해 만든 것도 아니다. 게다가 몰도바 보건부 연락처 페이지가
    // 30명을 공개해 놓은 탓에, 주소를 구할 수 있다는 사실이 구획의 크기를
    // 정해 버렸다 — 문항이 명단을 정해야 하는데 반대로 간 것이다.
    //
    // 실제로 물어야 할 것은 나라가 아니라 **전이** 다. 우리 78개 형태소는
    // 한국에서 만들어 한 번도 다른 문화에서 시험된 적이 없고, 현지 제작
    // 픽토그램이 국제 표준 세트보다 이해도가 높다는 결과가 이미 있다
    // (Dowse & Ehlers, 2005). 몰도바는 그 질문의 첫 사례일 뿐 주제가 아니다.
    id: 'q7',
    title: T(
      'Q7. 문화와 언어를 넘어가면 무엇이 깨지는가',
      'Q7. What breaks when this crosses into another language and culture?',
      'Q7. Ce se rupe când trece într-o altă limbă și cultură?',
    ),
    items: [
      short(
        'q7_firstbreak',
        '우리 78개 형태소는 한국에서 만들어 다른 문화에서 시험된 적이 없습니다. 가장 먼저 깨질 그림은 어떤 종류라고 보십니까?',
        'Our 78 morphemes were drawn in Korea and have never been tested in another culture. What kind of image do you expect to break first?',
        'Cele 78 de morfeme au fost desenate în Coreea și nu au fost testate niciodată în altă cultură. Ce fel de imagine credeți că se va rupe prima?',
      ),
      short(
        'q7_remake',
        '현지 제작 픽토그램이 국제 표준 세트보다 이해도가 높았다는 결과가 있습니다 (Dowse & Ehlers, 2005). 그렇다면 세트를 나라마다 다시 만들어야 합니까, 조합 문법만 옮기면 됩니까?',
        'Locally produced pictograms have outperformed an international standard set (Dowse & Ehlers, 2005). Does that mean the set must be redrawn per country, or is it enough to carry over the composition grammar?',
        'Pictogramele produse local au depășit un set standard internațional (Dowse & Ehlers, 2005). Înseamnă că setul trebuie redesenat pentru fiecare țară sau este suficient să transferăm gramatica de compunere?',
      ),
      short(
        'q7_mustretest',
        '문화를 넘을 때 반드시 다시 시험해야 하는 범주는 무엇입니까? 반대로 그대로 통할 것 같은 범주가 있습니까?',
        'Which categories must be retested when crossing cultures, and are there any you would expect to transfer unchanged?',
        'Ce categorii trebuie retestate la trecerea între culturi și există unele care ați aștepta să se transfere neschimbate?',
      ),
      short(
        'q7_voice',
        '음성 안내를 현지 언어로 옮길 때 주의할 점은 무엇입니까? 저희 음성은 문장을 다시 구성해서 읽습니다.',
        'What should we watch for when moving the spoken guidance into another language? Our voice engine reconstructs the sentence rather than reading a label aloud.',
        'La ce trebuie să fim atenți când mutăm ghidajul vocal în altă limbă? Motorul nostru vocal reconstruiește propoziția, nu citește o etichetă.',
      ),
      short(
        'q7_regulatory',
        '귀국의 제도에서는 어떻습니까 — 픽토그램만으로 하는 복약 안내가 허용됩니까, 저가 자동 디스펜서는 어떻게 분류됩니까?',
        'How does it stand in your country — is pictogram-only medication guidance permitted, and how would a low-cost automatic dispenser be classified?',
        'Cum stau lucrurile în țara dumneavoastră — este permis ghidajul medicamentos doar prin pictograme și cum ar fi clasificat un dozator automat ieftin?',
      ),
    ],
  },
  {
    id: 'q8',
    title: T('Q8. 기존 표준과 충돌하지 않는가', 'Q8. Does it conflict with existing standards?', 'Q8. Intră în conflict cu standardele existente?'),
    items: [
      short('q8_coexist', '자체 제작 픽토그램 세트가 기존 표준과 병존 가능합니까?', 'Can an in-house pictogram set coexist with the established standards?', 'Poate coexista un set propriu de pictograme cu standardele consacrate?'),
      short('q8_wcag', '문자 없는 UI 가 WCAG · 인지접근성(COGA) 지침을 만족합니까?', 'Does a text-free UI satisfy WCAG and the cognitive-accessibility (COGA) guidance?', 'O interfață fără text satisface WCAG și ghidul de accesibilitate cognitivă (COGA)?'),
      short('q8_iso', 'KS S ISO 7001 · ISO 9186 과의 관계에서 유의할 점', 'What to watch for in relation to KS S ISO 7001 and ISO 9186', 'La ce trebuie atenție în raport cu KS S ISO 7001 și ISO 9186'),
      short('q8_labeling', '라벨링·환자정보 관련 규정과 충돌 가능성', 'Possible conflicts with labelling and patient-information regulation', 'Posibile conflicte cu reglementările privind etichetarea și informarea pacientului'),
    ],
  },
];

/* ──────────────────── D. 마무리 (필수) ──────────────────── */

export const CLOSE_CITE = {
  q: T(
    '응답을 프로젝트 문서에 인용하는 범위를 골라 주십시오.',
    'Choose how we may cite your response in the project documents.',
    'Alegeți cum putem cita răspunsul dumneavoastră în documentele proiectului.',
  ),
  options: [
    T('익명으로만', 'Anonymously only', 'Doar anonim'),
    T('소속까지', 'With my affiliation', 'Cu afilierea mea'),
    T('이름과 소속까지', 'With my name and affiliation', 'Cu numele și afilierea mea'),
    T('인용하지 말 것', 'Do not cite me', 'Nu mă citați'),
  ],
};

export const CLOSE: Item[] = [
  {
    // 이해도 시험을 설문에서 뺀 자리를 이 문항이 대신한다. ISO 9186 과 ANSI
    // Z535.3 의 이해도 시험은 실제 사용자를 대상으로 해야 한다. 전문가가 우리
    // 그림을 읽어내는지는 글을 읽지 못하는 환자가 읽어내는지에 대해 거의 아무것도
    // 말해 주지 않으므로, 전문가에게서 얻은 수치를 기준 통과로 쓸 수 없다.
    // 그래서 묻는 것을 바꿨다 — 시험해 달라고 하는 대신 대상자에게 닿는 경로를 묻는다.
    id: 'd1_recruit',
    kind: 'longtext',
    q: T(
      '저문해 성인이나 고령 환자를 대상으로 픽토그램 이해도를 실제로 시험할 수 있는 경로를 알고 계십니까?',
      'Do you know of a route by which we could test pictogram comprehension with actual low-literacy or older adult participants?',
      'Cunoașteți o cale prin care am putea testa comprehensiunea pictogramelor cu participanți reali cu alfabetizare redusă sau vârstnici?',
    ),
    note: T(
      '저희는 아직 사람을 대상으로 이해도를 시험한 적이 없습니다. 기관, 프로그램, 또는 소개해 주실 분이 있다면 그것이 이 설문에서 저희가 가장 필요한 답입니다.',
      'We have not yet tested comprehension with people. If you know an institution, a programme, or someone who could introduce us, that is the single most useful answer we could receive.',
      'Nu am testat încă comprehensiunea cu oameni. Dacă știți o instituție, un program sau pe cineva care ne-ar putea face legătura, acesta este cel mai util răspuns pe care l-am putea primi.',
    ),
  },
  {
    id: 'd2_referral',
    kind: 'longtext',
    q: T(
      '이 주제로 물어볼 만한 다른 분을 알려 주십시오.',
      'Is there someone else we should ask about this?',
      'Există altcineva pe care ar trebui să întrebăm despre acest lucru?',
    ),
  },
  {
    id: 'd3_email',
    kind: 'text',
    q: T(
      '후속 질문으로 다시 연락드려도 되면 이메일을 남겨 주십시오.',
      'If we may follow up, please leave an email.',
      'Dacă putem reveni cu întrebări, vă rugăm să lăsați un e-mail.',
    ),
  },
];

/* ──────────────────── UI 문자열 ──────────────────── */

export const UI = {
  title: T('SnapCare 전문가 의견 조사', 'SnapCare — Expert Feedback', 'SnapCare — Opinia specialiștilor'),
  intro: T(
    'SnapCare 는 글을 읽지 못하는 사람이 약을 안전하게 복용하도록 돕는 웹앱입니다. 문자 대신 픽토그램과 음성으로 복약 지침을 전달합니다. ' +
      '제16회 e-ICON 세계대회에 한국·몰도바 합동 팀으로 출품했습니다. 저희는 고등학생 팀이고, 이 조사는 영리 목적이 아닙니다.',
    'SnapCare is a web app that helps people who cannot read text take medication safely. It delivers dosing instructions as pictograms and synthesized speech instead of writing. ' +
      'It is the joint Korea–Moldova entry in the 16th e-ICON World Contest. We are a high-school team and this survey is not commercial.',
    'SnapCare este o aplicație web care ajută persoanele care nu pot citi să își administreze medicamentele în siguranță. Transmite instrucțiunile de dozare prin pictograme și voce sintetizată, în loc de text. ' +
      'Este lucrarea comună Coreea–Moldova la a 16-a ediție e-ICON World Contest. Suntem o echipă de liceu, iar acest chestionar nu are scop comercial.',
  ),
  timeNote: T(
    '6~7분 걸립니다. 공통 문항 뒤에 선생님 분야에 해당하는 문항이 몇 개 붙습니다. 답하고 싶은 것만 답하셔도 됩니다.',
    'It takes 6–7 minutes — the common questions, then a few questions for your own field. Answer only what you wish.',
    'Durează 6–7 minute — întrebările comune, apoi câteva întrebări pentru domeniul dumneavoastră. Răspundeți doar la ce doriți.',
  ),
  start: T('시작', 'Start', 'Începeți'),
  next: T('다음', 'Next', 'Următorul'),
  back: T('이전', 'Back', 'Înapoi'),
  submit: T('제출', 'Submit', 'Trimiteți'),
  skip: T('이 구획 건너뛰기', 'Skip this section', 'Săriți această secțiune'),
  required: T('이 문항은 답해 주셔야 넘어갈 수 있습니다.', 'This question needs an answer before you can continue.', 'Această întrebare necesită un răspuns pentru a continua.'),
  progress: T('진행', 'Progress', 'Progres'),
  thanksTitle: T('보내 주셔서 감사합니다', 'Thank you', 'Vă mulțumim'),
  thanksBody: T(
    '응답이 저장되었습니다. 결과는 대회 최종 보고서에 반영하고, 인용을 허락해 주신 범위 안에서만 씁니다.',
    'Your response has been saved. We will use it in the final contest report, and only within the citation scope you chose.',
    'Răspunsul dumneavoastră a fost salvat. Îl vom folosi în raportul final al concursului, doar în limitele de citare pe care le-ați alegeți.',
  ),
  saveFail: T(
    '저장에 실패했습니다. 아래 버튼으로 다시 시도해 주십시오. 입력하신 내용은 이 브라우저에 남아 있습니다.',
    'Saving failed. Please try again with the button below — your answers are still held in this browser.',
    'Salvarea a eșuat. Încercați din nou cu butonul de mai jos — răspunsurile sunt încă păstrate în acest browser.',
  ),
  retry: T('다시 시도', 'Try again', 'Încercați din nou'),
  contact: T('문의', 'Contact', 'Contact'),
  optional: T('선택', 'optional', 'opțional'),
  moreSections: T(
    '다른 분야 문항도 보기',
    'Show the other field sections',
    'Afișați celelalte secțiuni',
  ),
  branchPick: T(
    '분야별 문항입니다. 답하고 싶은 구획만 여시면 됩니다.',
    'These are the field-specific sections. Open only the ones you want to answer.',
    'Acestea sunt secțiunile specifice domeniului. Deschideți doar cele la care doriți să răspundeți.',
  ),
};
