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
      '수집 항목은 응답 내용, 성함·소속·국가, 그리고 기술 정보입니다. 기술 정보란 메일에 담긴 수신자 식별 문자열, ' +
      '설문을 시작하고 제출한 시각, 표준시간대와 언어 설정, 화면이 모바일인지 데스크톱인지입니다. 브라우저 식별 정보는 수집하지 않습니다. ' +
      '대회 종료 후 12개월간 보관하고 그 뒤 삭제하며, 삭제나 열람을 원하시면 아래 연락처로 알려 주시면 됩니다. ' +
      '응답은 프로젝트 문서에 인용될 수 있으며, 실명·소속을 밝힐지 익명으로 할지는 마지막 문항에서 직접 고르실 수 있습니다. 인용을 원하지 않으신다는 선택도 있습니다.',
    'This survey collects expert feedback on SnapCare, an entry in the 16th e-ICON World Contest. ' +
      'We collect your answers, your name, affiliation and country, and some technical information: the recipient identifier carried ' +
      'in the invitation link, the times you started and submitted, your time zone and language setting, and whether you answered on a ' +
      'mobile or desktop screen. We do not collect browser fingerprinting data. We keep responses for 12 months after the contest and ' +
      'then delete them; write to the address below to access or delete yours. Your response may be quoted in the project documents, and ' +
      'in the final question you choose whether that is with your name, with your affiliation only, or anonymously — one option is not to be quoted at all.',
    'Acest chestionar colectează opinii de specialitate despre SnapCare, o lucrare înscrisă la a 16-a ediție e-ICON World Contest. ' +
      'Colectăm răspunsurile, numele, afilierea și țara dumneavoastră, precum și unele informații tehnice: identificatorul destinatarului ' +
      'din linkul de invitație, momentele în care ați început și ați trimis, fusul orar și setarea de limbă, și dacă ați răspuns pe un ecran ' +
      'mobil sau desktop. Nu colectăm date de amprentare a browserului. Păstrăm răspunsurile 12 luni după concurs, apoi le ștergem; ' +
      'scrieți la adresa de mai jos pentru acces sau ștergere. Răspunsul poate fi citat în documentele proiectului, iar în ultima întrebare ' +
      'alegeți dacă acest lucru se face cu numele, doar cu afilierea sau anonim — una dintre opțiuni este să nu fiți citat deloc.',
  ),
  agree: T(
    '위 내용을 읽었고 참여에 동의합니다.',
    'I have read the above and agree to take part.',
    'Am citit informațiile de mai sus și accept să participarea.',
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
    required: true,
    q: T('주로 일하는 국가', 'Country where you mainly work', 'Țara în care lucrați în principal'),
  },
  {
    // 이름과 소속은 선택이다. 필수로 두면 비판적인 답이 줄어든다 — 이 설문에서
    // 가장 값어치 있는 것이 A2("이 시스템이 환자를 해칠 경로")의 솔직한 답이라
    // 익명을 허용하는 편이 낫다. 다만 익명 응답은 중복을 걸러낼 수 없다.
    id: 'b_name',
    kind: 'text',
    required: true,
    q: T('성함', 'Your name', 'Numele dumneavoastră'),
    note: T(
      '응답이 명단의 어느 분에게서 왔는지 확인하고 중복 집계를 막기 위해 필요합니다. 이름을 적으시는 것과 문서에 실명이 실리는 것은 다릅니다 — 마지막 문항에서 익명 인용이나 인용 거부를 고르실 수 있습니다.',
      'We need this to confirm the response came from someone on our list and to avoid counting anyone twice. Giving your name here is not the same as appearing by name in the documents — in the final question you may choose anonymous citation, or none at all.',
      'Ne este necesar pentru a confirma că răspunsul provine de la o persoană din lista noastră și pentru a evita numărarea dublă. A vă da numele aici nu înseamnă că veți apărea cu numele în documente — în ultima întrebare puteți alege citarea anonimă sau deloc.',
    ),
  },
  {
    id: 'b_affil',
    kind: 'text',
    required: true,
    q: T('소속', 'Affiliation', 'Afiliere'),
  },
];

/* ──────────────────── A. 공통 코어 (필수) ──────────────────── */

export const CORE: Item[] = [
  {
    // 이 문항은 처음에 "판단 경로에서 문자를 완전히 없앴습니다" 로 되어 있었다.
    // 사실이 아니다. 코드를 확인하니 판정 화면에는 약 이름·복용법·판정 배지·조언
    // 줄·복용 시각이 모두 보이는 글자로 있고, 글자가 없는 것은 픽토그램 줄 하나뿐이다
    // (거기서만 문장이 alt·aria-label 과 음성으로만 들어간다).
    //
    // 실제 설계 의도는 app/scan/page.tsx 의 주석에 적혀 있다 — 글을 읽는 사람에게는
    // 글자가 쓸모 있으므로 남겨 두고, 읽지 못하는 사람을 위해 그림과 음성으로 **독립된
    // 경로**를 따로 깐 것이다. 문자를 없앤 것이 아니라 문자 없이도 성립하게 만든 것이다.
    //
    // 데모를 화면에 놓은 뒤로는 응답자가 글자를 직접 보게 되므로, 틀린 서술을 두면
    // 문항 자체를 믿지 않는다.
    id: 'a1_notext',
    kind: 'single',
    required: true,
    q: T(
      'SnapCare 는 화면의 글자를 없애지 않았습니다. 대신 글을 읽지 못하는 사람이 글자를 하나도 읽지 않고도 복약 지시를 온전히 받을 수 있도록, 픽토그램과 음성으로 독립된 경로를 깔았습니다. 이 접근은 어떻습니까?',
      'SnapCare does not remove the text from the screen. Instead it lays down an independent path — pictograms and speech — so that someone who cannot read any of the text still receives the full dosing instruction. What do you make of that approach?',
      'SnapCare nu elimină textul din ecran. În schimb, creează o cale independentă — pictograme și voce — astfel încât cineva care nu poate citi niciun text să primească totuși instrucțiunea completă de dozare. Ce părere aveți despre această abordare?',
    ),
    options: [
      T('옳은 접근이다', 'The right approach', 'Abordarea corectă'),
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
    // 이 문항도 사실과 달랐다. "문서 설명은 넣지 않습니다" 로 되어 있었는데, 화면에는
    // 글자가 남아 있다. 우리가 한 것은 문서를 뺀 것이 아니라, 글자를 읽지 못해도
    // 성립하도록 그림과 음성 경로를 따로 완성한 것이다.
    //
    // 그러면 Gutierrez 권고에 대한 우리 위치도 달라진다. 그 논문은 픽토그램 단독 대신
    // 구두 **와** 문서 병행을 권고했는데, 우리는 셋 다 갖고 있다. 다만 읽지 못하는
    // 사람에게는 그중 둘만 남으므로, 물어야 할 것은 "문서를 빼도 되는가" 가 아니라
    // "둘만으로 충분한가" 다.
    id: 'a3_voice',
    kind: 'single',
    required: true,
    q: T(
      '이 앱은 그림·음성·글자 세 경로를 함께 제시합니다. 글을 읽지 못하는 사람에게는 그림과 음성 둘만 남습니다. 그 두 경로만으로 충분합니까?',
      'The app presents three channels at once — pictograms, speech, and text. For someone who cannot read, only the pictograms and the speech remain. Are those two channels enough on their own?',
      'Aplicația prezintă trei canale simultan — pictograme, voce și text. Pentru cineva care nu poate citi, rămân doar pictogramele și vocea. Sunt suficiente aceste două canale?',
    ),
    note: T(
      '선행 연구(Gutierrez et al., 2022)는 픽토그램 단독 대신 구두와 문서 설명을 함께 쓰라고 권고했고, USP 픽토그램 라이선스도 픽토그램을 정보 전달의 유일한 수단으로 쓰지 말라고 정합니다. 저희는 세 경로를 다 두었으나, 글을 읽지 못하는 분에게는 문서 경로가 사실상 없는 것과 같습니다. 위 데모에서 스피커 표시를 눌러 음성을 들어 보신 뒤 답해 주시면 좋겠습니다.',
      'Prior work (Gutierrez et al., 2022) recommends complementing pictograms with verbal *and* written instructions, and the USP pictogram licence states pictograms should not be the sole means of conveying information. We kept all three channels, but for someone who cannot read, the written one is effectively absent. Please press a speaker mark in the demo above and listen before answering.',
      'Studiile anterioare (Gutierrez et al., 2022) recomandă completarea pictogramelor cu instrucțiuni verbale *și* scrise, iar licența pictogramelor USP prevede că pictogramele nu trebuie să fie singurul mijloc de transmitere a informației. Am păstrat toate trei canalele, dar pentru cineva care nu poate citi, cel scris este practic absent. Vă rugăm să apăsați un simbol de difuzor în demonstrația de mai sus și să ascultați înainte de a răspunde.',
    ),
    options: [
      T('예, 충분하다', 'Yes, enough', 'Da, suficiente'),
      T('부분적으로', 'Partly', 'Parțial'),
      T('아니오', 'No', 'Nu'),
    ],
    follow: T('왜 그렇습니까?', 'Why?', 'De ce?'),
  },
  {
    // a2(해칠 경로)·a4(하나만 고치라면)·a5(권하지 않을 사유)는 "무엇이 잘못됐나" 를
    // 세 번 다르게 물은 것이었다. 서술 세 칸을 받아 가면서 얻는 것은 거의 같으므로
    // 가장 구체적인 a2 만 남기고 둘을 지웠다.
    //
    // a6 은 서술이었는데 선택으로 바꿨다. 서술만 받으면 답이 제각각이라 셀 수 없다.
    // 후보를 주고 고르게 하면 분모가 생기고, §5 에서 우리가 무엇을 재야 하는지가
    // 표로 나온다. 어떻게 재야 하는지는 이어지는 서술에서 받는다.
    id: 'a6_evidence',
    kind: 'single',
    required: true,
    q: T(
      '이것이 효과가 있다고 납득하시려면 무엇이 확인되어야 합니까? 가장 중요한 하나를 골라 주십시오.',
      'What would have to be shown before you accepted that this works? Pick the single most important one.',
      'Ce ar trebui demonstrat pentru a accepta că funcționează? Alegeți cel mai important element.',
    ),
    options: [
      T('실제 환자가 픽토그램을 의도대로 읽어낸다', 'Real patients read the pictograms as intended', 'Pacienții reali citesc pictogramele conform intenției'),
      T('복약 오류가 실제로 줄어든다', 'Dosing errors actually go down', 'Erorile de dozare scad efectiv'),
      T('약사의 복약지도와 어긋나지 않는다', 'It does not diverge from what a pharmacist would say', 'Nu se abate de la ce ar spune un farmacist'),
      T('도움 없이 혼자서 끝까지 쓸 수 있다', 'People can complete it without help', 'Oamenii îl pot folosi fără ajutor'),
      T('오래 써도 계속 쓴다', 'People keep using it over time', 'Oamenii continuă să îl folosească în timp'),
    ],
    follow: T('그것을 어떻게 재야 한다고 보십니까?', 'How should that be measured?', 'Cum ar trebui măsurat?'),
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

/* ──────────── S. 서비스 피드백 — 동작하는 데모를 보고 답한다 ──────────── */

/**
 * 이 세 문항은 위에 놓인 데모를 보고(그리고 들어 보고) 답하는 것이다.
 *
 * S1 을 필수로 둔 이유는 이것이 제안서에 쓸 대표 숫자가 되기 때문이다 — 그림
 * 하나만 보면 누구나 답할 수 있고, "전문가 N명 중 M명이 혼자 복용이 어렵다고
 * 보았다" 는 문장은 우리가 아직 갖지 못한 종류의 근거다.
 *
 * S2·S3 은 선택입력이다. 서술을 강제하면 응답을 잃는다.
 */
export const SERVICE: Item[] = [
  {
    id: 's1_alone',
    kind: 'single',
    required: true,
    q: T(
      '위 데모만 보고, 글을 읽지 못하는 환자가 혼자서 약을 제대로 복용할 수 있을 것 같습니까?',
      'Looking only at the demo above, could a patient who cannot read take the medicine correctly on their own?',
      'Privind doar demonstrația de mai sus, ar putea un pacient care nu poate citi să ia corect medicamentul singur?',
    ),
    options: [
      T('예, 가능할 것 같다', 'Yes, probably', 'Da, probabil'),
      T('부분적으로 — 일부는 되고 일부는 안 된다', 'Partly — some of it, not all', 'Parțial — o parte, nu tot'),
      T('아니오', 'No', 'Nu'),
      T('판단할 근거가 없다', 'I have no basis to judge', 'Nu am o bază pentru a judeca'),
    ],
    follow: T('한 문장으로 이유를 적어 주십시오.', 'Give your reason in one sentence.', 'Motivați într-o singură frază.'),
  },
  {
    id: 's2_misread',
    kind: 'longtext',
    q: T(
      '위 데모에서 잘못 읽힐 곳이 있으면 짚어 주십시오.',
      'If anything in the demo above would be misread, please point to it.',
      'Dacă ceva din demonstrația de mai sus ar fi citit greșit, vă rugăm să indicați.',
    ),
    note: T(
      '그림 하나, 문장 하나만 지적해 주셔도 됩니다. 어느 것인지 적어 주시면 그대로 고칩니다. 칭찬보다 이 답이 훨씬 쓸모 있습니다.',
      'Pointing at a single pictogram or a single line is enough. Tell us which one and we will change it. This is far more useful to us than praise.',
      'Este suficient să indicați o singură pictogramă sau un singur rând. Spuneți-ne care și o vom schimba. Acest lucru ne este mult mai util decât laudele.',
    ),
  },
  {
    id: 's3_tried',
    kind: 'longtext',
    q: T(
      '앱을 직접 열어 보셨다면, 무엇이 예상과 달랐습니까?',
      'If you opened the actual app, what differed from what you expected?',
      'Dacă ați deschis aplicația reală, ce a fost diferit de ceea ce vă așteptați?',
    ),
    note: T(
      '열어 보지 않으셨다면 비워 두셔도 됩니다.',
      'Leave this blank if you did not open it.',
      'Lăsați necompletat dacă nu ați deschis-o.',
    ),
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
    'SnapCare 는 글을 읽지 못하는 사람이 약을 안전하게 복용하도록 돕는 웹앱입니다. 글자를 하나도 읽지 못해도 복약 지시가 온전히 전달되도록, 픽토그램과 음성으로 독립된 경로를 깔았습니다. ' +
      '제16회 e-ICON 세계대회에 한국·몰도바 합동 팀으로 출품했습니다. 저희는 고등학생 팀이고, 이 조사는 영리 목적이 아닙니다.',
    'SnapCare is a web app that helps people who cannot read text take medication safely. It lays down an independent path — pictograms and synthesized speech — so that the full dosing instruction arrives even if none of the writing can be read. ' +
      'It is the joint Korea–Moldova entry in the 16th e-ICON World Contest. We are a high-school team and this survey is not commercial.',
    'SnapCare este o aplicație web care ajută persoanele care nu pot citi să își administreze medicamentele în siguranță. Creează o cale independentă — pictograme și voce sintetizată — astfel încât instrucțiunea completă de dozare să ajungă chiar dacă textul nu poate fi citit. ' +
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
  demoTitle: T(
    '실제로 동작하는 데모입니다',
    'This is the working thing, not a screenshot',
    'Aceasta este versiunea funcțională, nu o captură de ecran',
  ),
  demoNote: T(
    '처방 문구를 넣으면 아래처럼 픽토그램이 나옵니다. 스피커 표시를 누르면 저희 음성 엔진이 그 줄을 읽어 줍니다 — 그림과 음성만으로 충분한지는 들어 보셔야 판단하실 수 있습니다. 소리가 나지 않으면 브라우저에 해당 언어 음성이 없는 경우이니 그대로 넘어가 주십시오.',
    'Enter a prescription and the pictograms below are what comes out. Press a speaker mark and our voice engine reads that line aloud — whether the pictograms and the speech are enough on their own is something you have to hear to judge. If nothing plays, your browser has no voice for that language; please move on.',
    'Introduceți o prescripție și pictogramele de mai jos sunt rezultatul. Apăsați un simbol de difuzor și motorul nostru vocal citește rândul — dacă pictogramele și vocea sunt suficiente este ceva ce trebuie auzit. Dacă nu se aude nimic, browserul nu are voce pentru acea limbă; vă rugăm să continuați.',
  ),
  rxLabel: T('처방 문구', 'The prescription', 'Prescripția'),
  previewTitle: T(
    '먼저 화면을 보십시오',
    'Please look at the screens first',
    'Vă rugăm să priviți mai întâi ecranele',
  ),
  previewNote: T(
    '아래 문항은 이 화면들을 보고 답해 주시면 됩니다. 왼쪽은 판정 결과, 가운데는 픽토그램 세트, 오른쪽은 연동되는 알약 디스펜서입니다.',
    'The questions below refer to these screens. Left: the verdict shown to the user. Middle: the pictogram set. Right: the pill dispenser it links to.',
    'Întrebările de mai jos se referă la aceste ecrane. Stânga: verdictul afișat utilizatorului. Mijloc: setul de pictograme. Dreapta: dozatorul de pastile conectat.',
  ),
  tryIt: T(
    '실제로 열어 보기 (새 창)',
    'Open the actual app (new tab)',
    'Deschideți aplicația reală (filă nouă)',
  ),
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
