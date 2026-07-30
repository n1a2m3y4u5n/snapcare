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

/**
 * 배경 문항의 답(영문 선택지 문자열)에서 직군 id 를 되짚는다.
 *
 * `Field` 는 선택지의 영문 표기를 값으로 저장한다. 언어를 바꿔도 저장값이 흔들리지
 * 않게 하려고 그렇게 했는데, 그래서 직군 구획을 찾을 때 한 번 되짚어야 한다.
 */
export function fieldIdOf(answer: string | undefined): string | null {
  if (!answer) return null;
  const hit = FIELDS.find((f) => f.label.en === answer);
  return hit ? hit.id : null;
}

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
    id: 'b_title',
    kind: 'text',
    required: true,
    q: T('직함', 'Your role or title', 'Funcția dumneavoastră'),
    note: T(
      '교수·약사·연구원·과장 등으로 적어 주시면 됩니다. 같은 문항에 답하셔도 어느 자리에서 보신 것인지에 따라 저희가 다르게 읽어야 하기 때문입니다.',
      'Professor, pharmacist, researcher, programme officer, and so on. The same answer reads differently to us depending on where you sit.',
      'Profesor, farmacist, cercetător, responsabil de program și așa mai departe. Același răspuns se citește diferit în funcție de poziția dumneavoastră.',
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
      T('제 분야가 아니어서 판단할 근거가 없다', 'Not my field — I have no basis to judge', 'Nu este domeniul meu — nu am o bază pentru a judeca'),
    ],
    follow: T('덧붙일 말이 있으면 적어 주십시오.', 'Anything to add?', 'Aveți ceva de adăugat?'),
  },
  {
    // 직군을 가리지 않는 문항이다. 법제 응답자는 개인정보 쪽 반론을, 약사는 임상
    // 쪽 반론을 댈 수 있다. 논문 하나만 대 주어도 우리는 발표에서 당하지 않는다.
    id: 'c_counter',
    kind: 'longtext',
    q: T(
      '이 접근에 반대되는 근거나 사례를 아십니까?',
      'Do you know of evidence or a case that argues against this approach?',
      'Cunoașteți dovezi sau un caz care contrazice această abordare?',
    ),
    note: T(
      '논문 하나, 사례 하나만 대 주셔도 충분합니다. 저희에게는 찬성보다 반대 근거가 값어치 있습니다 — 발표 자리에서 처음 듣는 것보다 지금 아는 편이 낫습니다.',
      'A single paper or a single case is enough. Counter-evidence is worth more to us than agreement — we would much rather hear it now than for the first time at the presentation.',
      'O singură lucrare sau un singur caz este suficient. Contraargumentele valorează mai mult decât acordul — preferăm să le aflăm acum decât pentru prima dată la prezentare.',
    ),
  }

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

/**
 * 직군별 구획.
 *
 * 처음에는 Q1~Q8 로 나누고 링크로 지목했다. 그것이 잘못이었다 — Q1~Q8 은 **우리가
 * 알고 싶은 것**으로 나눈 것이고 **누가 답할 수 있는지**로 나눈 것이 아니다. 약사가
 * 표준 충돌 구획에 배정되면 답할 근거가 없다.
 *
 * 지금은 `id` 가 배경 문항 `b_field` 의 선택지 id 와 같다. 응답자가 자기 분야를
 * 고르면 그 구획이 열린다. 링크로 지목하지 않으므로 **잘못 배정될 일이 없다** —
 * 1103명의 전문분야를 키워드로 훑어 직군에 매핑하는 방식은 그 자체로 사고를 부른다.
 *
 * 구획당 3문항이고, 선택 하나를 반드시 둔다. 서술만 있으면 그 구획의 분모가 없어서
 * "이 직군 응답자 N명 중 M명" 을 쓸 수 없다.
 */
export const BRANCHES: Branch[] = [
  {
    id: 'pharmacy',
    title: T(
      '약국·복약지도 실무',
      'Pharmacy and medication counselling',
      'Farmacie și consiliere medicamentoasă',
    ),
    items: [
      {
        id: 'ph1_missing',
        kind: 'single',
        q: T(
          '실제 복약지도에서 말로 전하시는 것 중, 이 앱이 가장 놓칠 만한 것은 무엇입니까?',
          'Of the things you say aloud when counselling a patient, which would this app most likely miss?',
          'Dintre lucrurile pe care le spuneți în consiliere, ce ar rata cel mai probabil aplicația?',
        ),
        options: [
          T('환자가 이해했는지 되묻는 확인', 'Checking back whether the patient understood', 'Verificarea faptului că pacientul a înțeles'),
          T('그 환자에게만 해당하는 예외 설명', 'Exceptions that apply only to that patient', 'Excepții care se aplică doar acelui pacient'),
          T('부작용이 생기면 어떻게 하라는 지시', 'What to do if a side effect appears', 'Ce să facă dacă apare o reacție adversă'),
          T('다른 약이나 음식과의 상호작용', 'Interactions with other medicines or foods', 'Interacțiuni cu alte medicamente sau alimente'),
          T('안심시키는 말', 'Reassurance', 'Liniștirea pacientului'),
        ],
        follow: T('덧붙일 말이 있으면 적어 주십시오.', 'Anything to add?', 'Aveți ceva de adăugat?'),
      },
      {
        id: 'ph2_review',
        kind: 'single',
        q: T(
          '이 앱이 만들어 낸 복약 지시를 약사가 검토해야 합니까?',
          'Should a pharmacist review the dosing instructions this app produces?',
          'Ar trebui un farmacist să revizuiască instrucțiunile de dozare generate de aplicație?',
        ),
        options: [
          T('반드시 매번 검토해야 한다', 'Yes, every time', 'Da, de fiecare dată'),
          T('처음 한 번만 검토하면 된다', 'Once at the start is enough', 'O singură dată la început este suficient'),
          T('검토 없이 써도 된다', 'It can be used without review', 'Poate fi folosită fără revizuire'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('왜 그렇습니까?', 'Why?', 'De ce?'),
      },
      {
        id: 'ph3_current',
        kind: 'longtext',
        q: T(
          '글을 읽지 못하는 환자를 만나면 지금은 실제로 어떻게 하십니까?',
          'When you meet a patient who cannot read, what do you actually do now?',
          'Când întâlniți un pacient care nu poate citi, ce faceți efectiv în prezent?',
        ),
        note: T(
          '지금의 방법을 알면 저희가 무엇을 대체하려 하는지, 무엇을 도와야 하는지 판단할 수 있습니다. 저희는 이 자리를 본 적이 없습니다.',
          'Knowing what happens now tells us what we would be replacing and what we should be supporting instead. We have never seen this moment.',
          'Ce se întâmplă acum ne spune ce am înlocui și ce ar trebui să sprijinim. Nu am văzut niciodată acest moment.',
        ),
      },
    ],
  },
  {
    id: 'nursing',
    title: T('간호·보건', 'Nursing and public health', 'Nursing și sănătate publică'),
    items: [
      {
        id: 'nu1_measure',
        kind: 'single',
        q: T(
          '이 앱의 효과를 재려면 어느 측정도구를 쓰는 것이 맞습니까?',
          'To measure whether this app works, which instrument should be used?',
          'Pentru a măsura dacă aplicația funcționează, ce instrument ar trebui folosit?',
        ),
        options: [
          T('건강정보이해력 도구 (K-HLAT-8, HLS 계열 등)', 'A health-literacy instrument (K-HLAT-8, HLS family)', 'Un instrument de alfabetizare în sănătate (K-HLAT-8, familia HLS)'),
          T('eHealth 문해력 도구 (eHEALS 등)', 'An eHealth literacy instrument (eHEALS)', 'Un instrument de alfabetizare eHealth (eHEALS)'),
          T('복약순응도 도구', 'A medication-adherence instrument', 'Un instrument de aderență la tratament'),
          T('복약 오류 발생을 직접 센다', 'Count actual dosing errors directly', 'Numărați direct erorile de dozare'),
          T('기존 도구로는 맞지 않는다', 'None of the existing instruments fit', 'Niciunul dintre instrumentele existente nu se potrivește'),
        ],
        follow: T('사용 조건이나 주의할 점이 있으면 적어 주십시오.', 'Any conditions or caveats on using it?', 'Există condiții sau atenționări privind utilizarea?'),
      },
      {
        id: 'nu2_where_fails',
        kind: 'single',
        q: T(
          '독거 고령 환자에게 이 방식은 어디서 먼저 실패할 것 같습니까?',
          'For an older adult living alone, where would this approach fail first?',
          'Pentru un vârstnic care trăiește singur, unde ar eșua prima dată această abordare?',
        ),
        options: [
          T('화면을 조작하지 못한다', 'They cannot operate the screen', 'Nu poate folosi ecranul'),
          T('음성을 듣지 못한다', 'They cannot hear the speech', 'Nu poate auzi vocea'),
          T('기기를 관리하지 못한다 (충전·분실)', 'They cannot keep the device going — charging, loss', 'Nu poate întreține dispozitivul — încărcare, pierdere'),
          T('앱을 신뢰하지 않는다', 'They do not trust the app', 'Nu are încredere în aplicație'),
          T('먼저 실패할 지점이 없다', 'It would not fail first anywhere', 'Nu ar eșua prima dată nicăieri'),
        ],
        follow: T('덧붙일 말이 있으면 적어 주십시오.', 'Anything to add?', 'Aveți ceva de adăugat?'),
      },
      {
        id: 'nu3_causal',
        kind: 'longtext',
        q: T(
          '"문해력이 낮으면 복약 오류가 늘어난다" 는 저희 가설을 뒷받침하거나 반박하는 자료를 아십니까?',
          'Do you know data that supports or refutes our hypothesis that lower literacy leads to more dosing errors?',
          'Cunoașteți date care susțin sau infirmă ipoteza noastră că alfabetizarea scăzută duce la mai multe erori de dozare?',
        ),
        note: T(
          '이 가설이 제안서 §1.3 의 근거입니다. 반박하는 자료라면 더욱 알고 싶습니다.',
          'This hypothesis is the basis of §1.3 in our proposal. If the data refutes it, we want to know that even more.',
          'Această ipoteză este baza §1.3 din propunerea noastră. Dacă datele o infirmă, dorim să știm cu atât mai mult.',
        ),
      },
    ],
  },
  {
    id: 'aac',
    title: T('AAC·특수교육', 'AAC and special education', 'CAA și educație specială'),
    items: [
      {
        id: 'aa1_grammar',
        kind: 'single',
        q: T(
          '78개 형태소를 문법으로 결합해 새 지시를 만드는 접근이 성립한다고 보십니까?',
          'Does composing 78 visual morphemes by a grammar to generate new instructions hold up?',
          'Compunerea a 78 de morfeme vizuale printr-o gramatică pentru a genera instrucțiuni noi este o abordare validă?',
        ),
        note: T(
          '아래 형태소 전체를 펼쳐 보실 수 있습니다. Blissymbolics 처럼 요소를 결합하는 체계와 같은 전제입니다.',
          'You can expand the full morpheme set below. The premise is the same as symbol systems that combine elements, such as Blissymbolics.',
          'Puteți extinde setul complet de morfeme mai jos. Premisa este aceeași ca la sistemele care combină elemente, precum Blissymbolics.',
        ),
        options: [
          T('성립한다', 'It holds up', 'Este validă'),
          T('조건이 붙으면 성립한다', 'It holds up with conditions', 'Este validă cu anumite condiții'),
          T('낱개로 그리는 편이 낫다', 'Drawing each instruction separately is better', 'Este mai bine să desenați fiecare instrucțiune separat'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('왜 그렇습니까?', 'Why?', 'De ce?'),
      },
      {
        id: 'aa2_which_fail',
        kind: 'single',
        q: T(
          '저희 형태소 중 어떤 종류가 가장 먼저 잘못 읽힐 것 같습니까?',
          'Which kind of morpheme in our set is most likely to be misread first?',
          'Ce tip de morfem din setul nostru este cel mai probabil să fie citit greșit primul?',
        ),
        options: [
          T('추상적 개념 (공복, 상호작용 등)', 'Abstract concepts such as empty stomach or interaction', 'Concepte abstracte precum stomac gol sau interacțiune'),
          T('수량', 'Quantity', 'Cantitate'),
          T('시간과 시점', 'Time of day', 'Momentul zilei'),
          T('신체 부위', 'Body parts', 'Părți ale corpului'),
          T('금지와 경고', 'Prohibitions and warnings', 'Interdicții și avertismente'),
        ],
        follow: T('어느 그림이 특히 그렇습니까?', 'Which specific images?', 'Care imagini anume?'),
      },
      {
        id: 'aa3_how_test',
        kind: 'single',
        q: T(
          '글을 읽지 못하는 사람에게 그림의 이해도를 재려면 어느 방법이 맞습니까?',
          'To measure whether someone who cannot read understands an image, which method is right?',
          'Pentru a măsura dacă o persoană care nu poate citi înțelege o imagine, ce metodă este corectă?',
        ),
        options: [
          T('자유응답을 받아 연구자가 분류한다', 'Take an open-ended answer and have researchers classify it', 'Se ia un răspuns deschis și cercetătorii îl clasifică'),
          T('보기 중에서 고르게 한다', 'Have them choose from options', 'Se alege dintre variante'),
          T('실제로 약을 꺼내 보이게 한다', 'Ask them to demonstrate the dose', 'Se cere demonstrarea dozei'),
          T('보호자가 대신 답한다', 'Have a carer answer on their behalf', 'Un îngrijitor răspunde în locul lor'),
          T('그 밖', 'Other', 'Altele'),
        ],
        follow: T('설계할 때 주의할 점을 적어 주십시오.', 'What should we watch for in the design?', 'La ce ar trebui să fim atenți în proiectare?'),
      },
    ],
  },
  {
    id: 'literacy',
    title: T('성인문해교육', 'Adult literacy education', 'Educația alfabetizării adulților'),
    items: [
      {
        id: 'li1_now',
        kind: 'longtext',
        q: T(
          '문해교육 학습자가 약 정보를 만났을 때, 지금 실제로 어떻게 합니까?',
          'When an adult literacy learner is faced with medication information, what do they actually do now?',
          'Când un cursant adult se confruntă cu informații despre medicamente, ce face efectiv?',
        ),
        note: T(
          '이것이 저희 프로젝트에서 가장 검증되지 않은 부분입니다. 제안서 §1.1~1.3 전체가 이 가정 위에 서 있는데, 저희는 당사자를 한 번도 만난 적이 없습니다.',
          'This is the least verified part of our whole project. Sections 1.1 to 1.3 of our proposal rest on this assumption and we have never once met the people concerned.',
          'Aceasta este partea cel mai puțin verificată a proiectului. Secțiunile 1.1–1.3 se bazează pe această presupunere și nu am întâlnit niciodată persoanele în cauză.',
        ),
      },
      {
        id: 'li2_pilot',
        kind: 'single',
        q: T(
          '학습자를 대상으로 그림 이해도 시험을 하려면, 어떤 형태가 현장에서 받아들여집니까?',
          'If we wanted to run a comprehension test with learners, what format would your setting accept?',
          'Dacă am dori să facem un test de comprehensiune cu cursanții, ce format ar accepta instituția dumneavoastră?',
        ),
        options: [
          T('수업 시간의 일부로', 'As part of a class session', 'Ca parte a unei ore de curs'),
          T('개별 면담으로', 'As individual interviews', 'Ca interviuri individuale'),
          T('기관 협조 공문이 있으면 가능', 'Possible with a formal request to the institution', 'Posibil cu o solicitare oficială către instituție'),
          T('학습자 대상 시험은 어렵다', 'Testing with learners would be difficult', 'Testarea cu cursanții ar fi dificilă'),
        ],
        follow: T('절차나 조건을 적어 주십시오.', 'What procedure or conditions would apply?', 'Ce procedură sau condiții s-ar aplica?'),
      },
      {
        id: 'li3_what_worked',
        kind: 'longtext',
        q: T(
          '문해교육 현장에서 그림으로 전달할 때, 효과가 있었던 것과 없었던 것은 무엇입니까?',
          'In literacy education, what has worked and what has not when conveying meaning by picture?',
          'În educația alfabetizării, ce a funcționat și ce nu, atunci când sensul a fost transmis prin imagini?',
        ),
      },
    ],
  },
  {
    id: 'hci',
    title: T('HCI·디자인', 'HCI and design', 'HCI și design'),
    items: [
      {
        id: 'hc1_smalln',
        kind: 'single',
        q: T(
          '소규모 표본으로 ISO 9186 의 67% 나 ANSI Z535.3 의 85% 기준을 재려면 어느 방법이 현실적입니까?',
          'With a small sample, which approach to claiming the ISO 9186 67% or ANSI Z535.3 85% criterion is realistic?',
          'Cu un eșantion mic, ce abordare pentru criteriul ISO 9186 de 67% sau ANSI Z535.3 de 85% este realistă?',
        ),
        options: [
          T('자유응답을 연구자가 분류하는 방식', 'Open-ended answers classified by researchers', 'Răspunsuri deschise clasificate de cercetători'),
          T('보기 중 고르게 하는 방식', 'Multiple-choice matching', 'Alegere din variante'),
          T('실제 행동을 관찰하는 방식', 'Observing what they actually do', 'Observarea comportamentului real'),
          T('소표본으로는 기준을 주장할 수 없다', 'With a small sample you cannot claim the criterion', 'Cu un eșantion mic nu se poate invoca criteriul'),
        ],
        follow: T('표본 수와 절차를 어떻게 잡아야 합니까?', 'What sample size and procedure would you set?', 'Ce dimensiune a eșantionului și ce procedură ați stabili?'),
      },
      {
        id: 'hc2_prescreen',
        kind: 'single',
        q: T(
          '저희는 78개를 사람이 아니라 시각 언어 모델에게 물어 걸렀습니다. 이것을 사람 시험 앞의 사전 선별로 쓰는 것이 방법론적으로 정당합니까?',
          'We screened all 78 morphemes by asking a vision-language model rather than people. Is it methodologically defensible to use that as a pre-screen ahead of human testing?',
          'Am filtrat toate cele 78 de morfeme întrebând un model vizual-lingvistic, nu oameni. Este justificabil metodologic să folosim asta ca pre-filtrare înaintea testării umane?',
        ),
        note: T(
          '사람 시험을 대체하려는 것이 아니라 그 앞에 두려는 것입니다. 그 위치가 정당한지에 대한 판단을 듣고 싶습니다.',
          'We do not mean it to replace human testing but to sit in front of it. We want your judgement on whether that position is defensible.',
          'Nu intenționăm să înlocuim testarea umană, ci să o precedăm. Dorim opinia dumneavoastră dacă această poziție este justificabilă.',
        ),
        options: [
          T('정당하다', 'Defensible', 'Justificabil'),
          T('조건이 붙으면 정당하다', 'Defensible with conditions', 'Justificabil cu anumite condiții'),
          T('정당하지 않다', 'Not defensible', 'Nejustificabil'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('왜 그렇습니까?', 'Why?', 'De ce?'),
      },
      {
        id: 'hc3_breaks',
        kind: 'single',
        q: T(
          '형태소 조합이 늘어날 때 무엇이 가장 먼저 깨질 것 같습니까?',
          'As the number of composed combinations grows, what breaks first?',
          'Pe măsură ce numărul de combinații crește, ce se rupe primul?',
        ),
        options: [
          T('두 요소가 서로 가린다', 'Elements start occluding each other', 'Elementele se acoperă reciproc'),
          T('무엇이 주된 뜻인지 알 수 없어진다', 'It stops being clear which element carries the main meaning', 'Nu mai este clar care element are sensul principal'),
          T('비슷한 조합끼리 구별되지 않는다', 'Similar combinations become indistinguishable', 'Combinațiile similare devin imposibil de distins'),
          T('작게 표시하면 무너진다', 'It collapses at small sizes', 'Se destramă la dimensiuni mici'),
        ],
        follow: T('덧붙일 말이 있으면 적어 주십시오.', 'Anything to add?', 'Aveți ceva de adăugat?'),
      },
    ],
  },
  {
    id: 'law',
    title: T('법·개인정보', 'Law and data protection', 'Drept și protecția datelor'),
    items: [
      {
        id: 'la1_standing',
        kind: 'single',
        q: T(
          '계정도 비밀번호도 없이 기기 안의 키로만 인증하고, 서버는 암호화된 데이터만 보관하는 설계입니다. 건강정보를 이렇게 다루는 것이 법적으로 문제가 됩니까?',
          'The design has no account and no password: authentication uses a key held on the device, and the server stores only encrypted data. Is handling health data this way legally problematic?',
          'Designul nu are cont și nici parolă: autentificarea folosește o cheie păstrată pe dispozitiv, iar serverul stochează doar date criptate. Este problematic juridic să gestionăm astfel datele de sănătate?',
        ),
        options: [
          T('문제되지 않는다', 'Not problematic', 'Nu este problematic'),
          T('조건을 갖추면 문제되지 않는다', 'Not problematic if certain conditions are met', 'Nu este problematic dacă sunt îndeplinite anumite condiții'),
          T('문제가 된다', 'It is problematic', 'Este problematic'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('근거가 되는 조항이나 판단 기준을 적어 주십시오.', 'Which provision or test applies?', 'Ce prevedere sau criteriu se aplică?'),
      },
      {
        id: 'la2_processing',
        kind: 'single',
        q: T(
          '서버가 복호화할 수 없는 암호문만 보관한다면, 그것도 개인정보 처리에 해당합니까?',
          'If the server holds only ciphertext it cannot decrypt, does that still count as processing personal data?',
          'Dacă serverul păstrează doar text cifrat pe care nu îl poate decripta, aceasta constituie totuși prelucrare de date personale?',
        ),
        options: [
          T('해당한다', 'Yes', 'Da'),
          T('조건에 따라 다르다', 'It depends', 'Depinde'),
          T('해당하지 않는다', 'No', 'Nu'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('덧붙일 말이 있으면 적어 주십시오.', 'Anything to add?', 'Aveți ceva de adăugat?'),
      },
      {
        id: 'la3_consent',
        kind: 'longtext',
        q: T(
          '글을 읽지 못하는 사용자에게서 유효한 동의를 받으려면 어떻게 해야 합니까?',
          'How should valid consent be obtained from a user who cannot read?',
          'Cum ar trebui obținut un consimțământ valid de la un utilizator care nu poate citi?',
        ),
        note: T(
          '동의서를 읽을 수 없는 사람에게 동의를 받는 문제입니다. 저희는 이 지점에 답을 갖고 있지 않습니다.',
          'The problem is obtaining consent from someone who cannot read the consent form. We do not have an answer here.',
          'Problema este obținerea consimțământului de la cineva care nu poate citi formularul. Nu avem un răspuns aici.',
        ),
      },
    ],
  },
  {
    id: 'standards',
    title: T('표준·규제', 'Standards and regulation', 'Standardizare și reglementare'),
    items: [
      {
        id: 'st1_coexist',
        kind: 'single',
        q: T(
          '자체 제작한 픽토그램 세트가 기존 표준 세트와 병존할 수 있습니까?',
          'Can an in-house pictogram set coexist with the established standard sets?',
          'Poate coexista un set propriu de pictograme cu seturile standard consacrate?',
        ),
        options: [
          T('병존할 수 있다', 'Yes', 'Da'),
          T('검증 절차를 거치면 가능하다', 'Yes, if it goes through a validation procedure', 'Da, dacă trece printr-o procedură de validare'),
          T('표준 세트를 써야 한다', 'No, an established set should be used', 'Nu, ar trebui folosit un set consacrat'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('근거가 되는 표준이나 조항을 적어 주십시오.', 'Which standard or provision applies?', 'Ce standard sau prevedere se aplică?'),
      },
      {
        id: 'st2_wcag',
        kind: 'single',
        q: T(
          '글자를 읽지 않고도 쓸 수 있게 만든 이 경로가 WCAG 와 인지접근성(COGA) 지침을 만족합니까?',
          'Does this path — usable without reading any text — satisfy WCAG and the cognitive accessibility (COGA) guidance?',
          'Această cale — utilizabilă fără a citi text — satisface WCAG și ghidul de accesibilitate cognitivă (COGA)?',
        ),
        options: [
          T('만족한다', 'Yes', 'Da'),
          T('조건을 갖추면 만족한다', 'Yes, under certain conditions', 'Da, în anumite condiții'),
          T('만족하지 않는다', 'No', 'Nu'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('어느 항목이 문제가 됩니까?', 'Which criteria are at issue?', 'Care criterii sunt problematice?'),
      },
      {
        id: 'st3_country',
        kind: 'longtext',
        q: T(
          '귀국의 제도에서는 그림과 음성만으로 하는 복약 안내가 허용됩니까? 저가 자동 알약 디스펜서는 어떻게 분류됩니까?',
          'In your country, is medication guidance given only by picture and speech permitted? How would a low-cost automatic pill dispenser be classified?',
          'În țara dumneavoastră, este permis ghidajul medicamentos doar prin imagine și voce? Cum ar fi clasificat un dozator automat ieftin?',
        ),
      },
    ],
  },
  {
    id: 'industry',
    title: T(
      '산업 실무 — 제품 개발·운영',
      'Industry practice — building and operating products',
      'Practică industrială — dezvoltare și operare',
    ),
    items: [
      {
        id: 'in1_breaks',
        kind: 'single',
        q: T(
          '이 구조를 실제로 운영하면 무엇이 가장 먼저 깨질 것 같습니까?',
          'If this were actually operated in the field, what would break first?',
          'Dacă acest sistem ar fi operat efectiv pe teren, ce s-ar rupe primul?',
        ),
        options: [
          T('그림 생성이 실패하거나 느려진다', 'Pictogram generation fails or gets slow', 'Generarea pictogramelor eșuează sau devine lentă'),
          T('오프라인 상태의 데이터 동기화', 'Syncing data while offline', 'Sincronizarea datelor offline'),
          T('기기 분실과 데이터 복구', 'A lost device and unrecoverable data', 'Un dispozitiv pierdut și date nerecuperabile'),
          T('사용자가 며칠 뒤 그만 쓴다', 'Users stop after a few days', 'Utilizatorii renunță după câteva zile'),
          T('하드웨어 고장', 'The hardware fails', 'Hardware-ul se defectează'),
        ],
        follow: T('덧붙일 말이 있으면 적어 주십시오.', 'Anything to add?', 'Aveți ceva de adăugat?'),
      },
      {
        id: 'in2_offline',
        kind: 'longtext',
        q: T(
          '오프라인 우선이나 계정 없는 구조를 실제로 운영해 보셨다면, 무엇이 예상과 달랐습니까?',
          'If you have actually operated an offline-first or account-free system, what differed from what you expected?',
          'Dacă ați operat efectiv un sistem offline-first sau fără cont, ce a fost diferit de ce vă așteptați?',
        ),
        note: T(
          '설계로만 주장하는 것과 몇 년 돌려 본 것은 다릅니다. 저희는 아직 전자입니다.',
          'Claiming it in a design and running it for years are different things. We are still doing the former.',
          'A afirma ceva într-un design și a-l rula ani de zile sunt lucruri diferite. Noi suntem încă în prima situație.',
        ),
      },
      {
        id: 'in3_differently',
        kind: 'longtext',
        q: T(
          '같은 문제를 다시 푼다면 무엇을 다르게 하시겠습니까?',
          'If you were solving the same problem, what would you do differently?',
          'Dacă ați rezolva aceeași problemă, ce ați face diferit?',
        ),
      },
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
  glyphsToggle: T(
    '형태소 78개 전부 보기',
    'Show all 78 morphemes',
    'Afișați toate cele 78 de morfeme',
  ),
  glyphsNote: T(
    '위 그림들은 이 78개를 문법으로 결합해 만든 것입니다. 새 지시가 필요할 때 그림을 새로 그리지 않고 이것들을 조합합니다.',
    'The pictures above are composed from these 78 by a grammar. When a new instruction is needed we combine these rather than drawing a new picture.',
    'Imaginile de mai sus sunt compuse din aceste 78 printr-o gramatică. Când este nevoie de o instrucțiune nouă, le combinăm în loc să desenăm o imagine nouă.',
  ),
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
