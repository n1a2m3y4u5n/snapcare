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

/**
 * 공통 실질 문항은 두지 않는다.
 *
 * 한때 다섯 개가 있었다. 문자를 없앤 접근이 어떤지, 그림과 음성 둘만으로
 * 충분한지, 무엇이 확인되면 납득하는지, 우리 전제가 경험과 맞는지, 반대 근거를
 * 아는지. 전부 뺐다 — **전원에게 성립하는 질문이 아니었다.**
 *
 * 컴퓨터공학 교수에게 "현장에서 글 못 읽는 분을 보십니까" 는 답할 근거가 없고,
 * 표준 기관 담당자에게 "읽어야 할 연구가 있습니까" 도 그렇다. 받는 사람이 "왜
 * 나한테 이걸 묻는가" 라고 생각하면 그 문항은 답을 얻지 못하고 설문 전체의 신뢰만
 * 깎는다.
 *
 * 전원에게 성립하는 것은 하나뿐이다 — **눈앞의 데모를 보고 판단하는 것**(SERVICE).
 * 그것이 유일한 공통 문항이고 제안서에 쓸 대표 숫자가 된다.
 *
 * 분모도 이 편이 낫다. 서로 다른 여덟 분야를 섞은 "전체 43명 중 20명" 보다
 * "약사 18명 중 14명" 이 훨씬 강한 문장이다.
 */
export const CORE: Item[] = [];

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
    note: T(
      '화면에는 글자도 있지만, 글을 읽지 못하는 분에게 남는 것은 그림과 음성 둘뿐입니다. 그 둘만으로 충분한지가 이 프로젝트의 핵심 질문입니다 — 선행 연구(Gutierrez et al., 2022)는 픽토그램에 구두와 문서 설명을 함께 붙이라고 권고했고, USP 픽토그램 라이선스도 픽토그램을 정보 전달의 유일한 수단으로 쓰지 말라고 정합니다. 스피커 표시를 눌러 음성을 들어 보신 뒤 답해 주시면 좋겠습니다.',
      'The screen also carries text, but for someone who cannot read, only the pictograms and the speech remain. Whether those two are enough is the central question of this project — prior work (Gutierrez et al., 2022) recommends pairing pictograms with verbal *and* written instructions, and the USP pictogram licence states pictograms should not be the sole means of conveying information. Please press a speaker mark and listen before answering.',
      'Ecranul conține și text, dar pentru cineva care nu poate citi rămân doar pictogramele și vocea. Dacă acestea două sunt suficiente este întrebarea centrală a proiectului — studiile anterioare (Gutierrez et al., 2022) recomandă asocierea pictogramelor cu instrucțiuni verbale *și* scrise, iar licența pictogramelor USP prevede că pictogramele nu trebuie să fie singurul mijloc de transmitere a informației. Vă rugăm să apăsați un simbol de difuzor și să ascultați înainte de a răspunde.',
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
        // 약사에게만 물을 수 있는 것이다. 우리는 그림을 만들 줄은 알지만 무엇이
        // 의학적으로 치명적인지는 모른다. 선택지로 우선순위를 받고, 우리가 놓친
        // 것은 서술로 받는다. 안내에 우리가 이미 다루는 것을 적어 두는 것이
        // 요점이다 — 없으면 이미 있는 것을 다시 적어 준다.
        id: 'ph4_medical',
        kind: 'single' as const,
        q: T(
          '이 엔진이 복약 지시를 그림으로 바꿀 때, 의학적으로 가장 틀리면 안 되는 것은 무엇입니까?',
          'When this engine turns a dosing instruction into pictures, what is the most dangerous thing to get wrong medically?',
          'Când acest motor transformă o instrucțiune de dozare în imagini, ce este cel mai periculos să greșească din punct de vedere medical?',
        ),
        note: T(
          '저희 세트가 이미 다루는 것은 이렇습니다 — 복용량(1~5), 시점(아침·정오·저녁·취침), 식전·식후·공복, 보관(냉장·건조·차광), 알레르기 9종, 특수 상태(임신·수유·소아·영아·고령), 출혈 경고, 운전, 항생제 완주, 분할 금지, 금주. 이 목록에 없는 것을 짚어 주시면 특히 값어치 있습니다.',
          'Our set already covers: quantity (1–5), time of day (morning, midday, evening, night), before or after food and empty stomach, storage (fridge, dry, dark), nine allergens, special states (pregnancy, breastfeeding, child, infant, older adult), bleeding warning, driving, finishing an antibiotic course, do-not-split, and no alcohol. Pointing at something absent from that list is especially valuable.',
          'Setul nostru acoperă deja: cantitatea (1–5), momentul zilei (dimineață, amiază, seară, noapte), înainte sau după masă și pe stomacul gol, păstrarea (frigider, uscat, ferit de lumină), nouă alergeni, stări speciale (sarcină, alăptare, copil, sugar, vârstnic), avertisment de sângerare, condusul, finalizarea tratamentului cu antibiotic, interdicția de divizare și interzicerea alcoolului. Este deosebit de valoros să indicați ceva ce lipsește din această listă.',
        ),
        options: [
          T('복용량과 횟수', 'Dose and frequency', 'Doza și frecvența'),
          T('투여 경로 — 경구·좌약·외용·흡입 등', 'Route of administration — oral, rectal, topical, inhaled', 'Calea de administrare — orală, rectală, topică, inhalatorie'),
          T('병용금기와 상호작용', 'Contraindications and interactions', 'Contraindicații și interacțiuni'),
          T('복용 시점 조건 — 식전·식후·공복·취침 전', 'Timing conditions — before or after food, empty stomach, at bedtime', 'Condiții de moment — înainte sau după masă, pe stomacul gol, la culcare'),
          T('특수 인구 — 임신·수유·소아·고령·신기능 저하', 'Special populations — pregnancy, breastfeeding, children, older adults, renal impairment', 'Populații speciale — sarcină, alăptare, copii, vârstnici, insuficiență renală'),
          T('임의 중단 금지 — 항생제 완주 등', 'Do not stop early — finishing an antibiotic course', 'Nu întrerupeți devreme — finalizarea tratamentului cu antibiotic'),
          T('제형 조작 금지 — 분할·분쇄 금지', 'Do not alter the dose form — no splitting or crushing', 'Nu modificați forma — fără divizare sau sfărâmare'),
        ],
        follow: T(
          '위 목록에 없는 의학적 고려사항이나, 그림으로는 전달할 수 없다고 보시는 것이 있으면 적어 주십시오.',
          'Please tell us any medical consideration missing from that list, or anything you believe a picture simply cannot convey.',
          'Vă rugăm să ne spuneți orice considerație medicală care lipsește din listă sau orice credeți că o imagine pur și simplu nu poate transmite.',
        ),
      },
      {
        // 우리 78개에 대응하는 형태소가 아예 없는 의학 개념이 셋 있다 — 병용금기와
        // 상호작용, 복용 누락 대처, 용량 조절. 그림으로 만들 수 없어서 없는 것인지
        // 우리가 놓친 것인지 우리는 모른다. 그 경계를 정하는 것이 이 문항이다.
        //
        // 앞 문항(ph4_medical)이 "무엇을 틀리면 안 되는가" 를 묻는다면, 이 문항은
        // "무엇을 애초에 그림으로 다루면 안 되는가" 를 묻는다. 전자는 정확도의
        // 문제이고 후자는 범위의 문제다. §5.3 에 적을 한계선이 여기서 나온다.
        id: 'ph5_boundary',
        kind: 'single' as const,
        q: T(
          '복약 지시 중에서, 그림과 음성만으로는 애초에 전달하면 안 된다고 보시는 것이 있습니까?',
          'Is there any part of a dosing instruction that you believe should never be delivered by picture and speech alone?',
          'Există vreo parte a unei instrucțiuni de dozare care, în opinia dumneavoastră, nu ar trebui transmisă niciodată doar prin imagine și voce?',
        ),
        note: T(
          '저희 형태소 78개에는 병용금기·상호작용, 복용을 잊었을 때의 대처, 용량 조절에 해당하는 그림이 아예 없습니다. 만들 수 없다고 보아 넣지 않은 것인지 저희가 놓친 것인지 판단이 서지 않습니다. 이 문항의 답은 저희가 문서에 적을 한계선이 됩니다.',
          'Our 78 morphemes contain nothing for contraindications and interactions, what to do after a missed or doubled dose, or dose adjustment. We cannot tell whether those are genuinely impossible to draw or simply things we overlooked. Your answer becomes the limit we state in our documents.',
          'Cele 78 de morfeme ale noastre nu conțin nimic pentru contraindicații și interacțiuni, ce să faci după o doză omisă sau dublată, ori ajustarea dozei. Nu putem spune dacă acestea sunt imposibil de desenat sau doar lucruri pe care le-am omis. Răspunsul dumneavoastră devine limita pe care o vom declara în documente.',
        ),
        options: [
          T('없다 — 원칙적으로 모두 그림과 음성으로 다룰 수 있다', 'No — in principle all of it can be carried by picture and speech', 'Nu — în principiu totul poate fi transmis prin imagine și voce'),
          T('있다 — 병용금기와 상호작용', 'Yes — contraindications and interactions', 'Da — contraindicații și interacțiuni'),
          T('있다 — 복용을 잊었거나 두 번 먹었을 때의 대처', 'Yes — what to do after a missed or doubled dose', 'Da — ce să faci după o doză omisă sau dublată'),
          T('있다 — 부작용이 나타났을 때의 판단', 'Yes — judging what to do when a side effect appears', 'Da — ce să faci când apare o reacție adversă'),
          T('있다 — 용량 조절이 필요한 경우', 'Yes — cases needing dose adjustment', 'Da — cazuri care necesită ajustarea dozei'),
          T('있다 — 그 밖', 'Yes — something else', 'Da — altceva'),
        ],
        follow: T(
          '그렇게 보시는 이유와, 그 경우 그림·음성 대신 무엇이 있어야 하는지 적어 주십시오.',
          'Please say why, and what should be in place instead of picture and speech in that case.',
          'Vă rugăm să explicați de ce și ce ar trebui să existe în locul imaginii și vocii în acel caz.',
        ),
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
      {
        id: 'ph7_ref',
        kind: 'longtext' as const,
        q: T(
          '이 주제로 저희가 반드시 읽어야 할 약학 쪽 연구나 지침이 있습니까?',
          'Is there pharmacy research or guidance we really ought to have read on this?',
          'Există cercetări sau ghiduri din farmacie pe care ar trebui neapărat să le fi citit?',
        ),
        note: T(
          '제목이나 저자 이름만 적어 주셔도 찾아 읽겠습니다. 저희 접근을 반박하는 것이라면 더욱 알고 싶습니다.',
          'A title or an author name is enough and we will find it. If it argues against our approach, we want it all the more.',
          'Este suficient un titlu sau un nume de autor. Dacă infirmă abordarea noastră, cu atât mai mult dorim să îl aflăm.',
        ),
      },
      {
        id: 'ph8_workflow',
        kind: 'single' as const,
        q: T(
          '이 앱을 약국 업무 흐름 안에서 환자에게 권할 수 있다고 보십니까?',
          'Could this app realistically be offered to a patient within a pharmacy workflow?',
          'Ar putea această aplicație să fie oferită realist unui pacient în fluxul de lucru al farmaciei?',
        ),
        options: [
          T('조제하면서 권할 수 있다', 'Yes, while dispensing', 'Da, în timpul eliberării'),
          T('시간이 없어 어렵다', 'No — there is no time', 'Nu — nu este timp'),
          T('약사가 아닌 직원이 도울 수 있다', 'A non-pharmacist staff member could help', 'Un membru al personalului non-farmacist ar putea ajuta'),
          T('약국 밖에서 이뤄져야 한다', 'It should happen outside the pharmacy', 'Ar trebui să se întâmple în afara farmaciei'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('그렇게 보시는 이유를 적어 주십시오.', 'Please say why.', 'Vă rugăm să explicați de ce.'),
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
      {
        id: 'nu4_seen',
        kind: 'single' as const,
        q: T(
          '선생님 현장에서, 글을 읽지 못하는 분들이 복약 정보를 제대로 받지 못하고 있다고 보십니까?',
          'In your own setting, would you say people who cannot read are not getting medication information properly?',
          'În contextul dumneavoastră, ați spune că persoanele care nu pot citi nu primesc corect informațiile despre medicamente?',
        ),
        note: T(
          '저희 프로젝트 전체가 이 전제 위에 서 있는데, 저희는 당사자를 직접 만난 적이 없습니다. 어긋난다면 그것이 가장 먼저 알아야 할 것입니다.',
          'Our entire project rests on this premise and we have never met the people concerned. If it does not match what you see, that is the first thing we need to know.',
          'Întregul proiect se bazează pe această premisă și nu am întâlnit niciodată persoanele în cauză. Dacă nu corespunde, acesta este primul lucru pe care trebuie să îl aflăm.',
        ),
        options: [
          T('맞다', 'Yes', 'Da'),
          T('부분적으로', 'Partly', 'Parțial'),
          T('아니다', 'No', 'Nu'),
          T('그런 분을 만날 자리가 아니다', 'I am not in a position to meet such people', 'Nu sunt în poziția de a întâlni astfel de persoane'),
        ],
        follow: T('덧붙일 말이 있으면 적어 주십시오.', 'Anything to add?', 'Aveți ceva de adăugat?'),
      },
      {
        id: 'nu5_ref',
        kind: 'longtext' as const,
        q: T(
          '이 주제로 저희가 반드시 읽어야 할 간호·보건 쪽 연구가 있습니까?',
          'Is there a study in nursing or public health that we really ought to have read on this?',
          'Există un studiu din nursing sau sănătate publică pe care ar trebui neapărat să îl fi citit?',
        ),
        note: T(
          '제목이나 저자 이름만 적어 주셔도 찾아 읽겠습니다. 저희 접근을 반박하는 것이라면 더욱 알고 싶습니다.',
          'A title or an author name is enough and we will find it. If it argues against our approach, we want it all the more.',
          'Este suficient un titlu sau un nume de autor. Dacă infirmă abordarea noastră, cu atât mai mult dorim să îl aflăm.',
        ),
      },
      {
        id: 'nu6_proxy',
        kind: 'single' as const,
        q: T(
          '저희는 환자 본인이 앱을 쓴다고 전제했습니다. 실제로는 보호자가 약을 관리하는 경우가 많다고 들었습니다. 누구를 대상으로 설계해야 합니까?',
          'We assumed the patient uses the app themselves. We are told a carer often manages the medicines in practice. Who should this be designed for?',
          'Am presupus că pacientul folosește singur aplicația. Ni s-a spus că, în practică, un îngrijitor gestionează adesea medicamentele. Pentru cine ar trebui proiectat?',
        ),
        options: [
          T('환자 본인', 'The patient themselves', 'Pacientul însuși'),
          T('보호자', 'The carer', 'Îngrijitorul'),
          T('둘을 각각 다르게', 'Both, with separate designs', 'Ambii, cu design separat'),
          T('보호자 중심이어야 한다', 'It should centre on the carer', 'Ar trebui să se centreze pe îngrijitor'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('왜 그렇습니까?', 'Why?', 'De ce?'),
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
      {
        id: 'aa4_seen',
        kind: 'single' as const,
        q: T(
          '선생님이 만나시는 분들 중, 글을 읽지 못해 복약 정보를 제대로 받지 못하는 경우가 있습니까?',
          'Among the people you work with, are there those who miss medication information because they cannot read?',
          'Printre persoanele cu care lucrați, există cele care pierd informațiile despre medicamente pentru că nu pot citi?',
        ),
        options: [
          T('맞다', 'Yes', 'Da'),
          T('부분적으로', 'Partly', 'Parțial'),
          T('아니다', 'No', 'Nu'),
          T('그런 분을 만날 자리가 아니다', 'I am not in a position to meet such people', 'Nu sunt în poziția de a întâlni astfel de persoane'),
        ],
        follow: T('어떤 상황인지 적어 주십시오.', 'Please describe the situation.', 'Vă rugăm să descrieți situația.'),
      },
      {
        id: 'aa5_ref',
        kind: 'longtext' as const,
        q: T(
          '기존 상징 체계 가운데 저희가 반드시 봐야 할 사례나 연구가 있습니까?',
          'Among existing symbol systems, is there a case or study we really ought to look at?',
          'Dintre sistemele de simboluri existente, există un caz sau un studiu la care ar trebui neapărat să ne uităm?',
        ),
        note: T(
          'ARASAAC·Blissymbolics·PCS·Widgit 같은 세트나, 그 세트의 이해도를 시험한 연구를 알려 주시면 됩니다.',
          'A set such as ARASAAC, Blissymbolics, PCS or Widgit, or a study that tested comprehension of one of them.',
          'Un set precum ARASAAC, Blissymbolics, PCS sau Widgit, ori un studiu care a testat comprehensiunea unuia dintre ele.',
        ),
      },
      {
        id: 'aa6_learning',
        kind: 'single' as const,
        q: T(
          'AAC 상징은 보통 학습을 전제합니다. 저희는 처음 본 사람이 즉시 이해하기를 기대하고 있습니다. 그 전제가 성립합니까?',
          'AAC symbols usually presuppose teaching. We are expecting someone to understand ours on first sight. Does that assumption hold?',
          'Simbolurile CAA presupun de obicei o instruire prealabilă. Noi ne așteptăm ca cineva să le înțeleagă la prima vedere. Se susține această presupunere?',
        ),
        options: [
          T('성립한다', 'It holds', 'Se susține'),
          T('일부 범주만 성립한다', 'It holds for some categories only', 'Se susține doar pentru unele categorii'),
          T('학습 없이는 어렵다', 'Without teaching it will not work', 'Fără instruire nu va funcționa'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('학습이 필요하다면 어느 정도가 필요합니까?', 'If teaching is needed, how much?', 'Dacă este necesară instruirea, cât de multă?'),
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
      {
        id: 'li4_ref',
        kind: 'longtext' as const,
        q: T(
          '성인문해교육 쪽에서 저희가 반드시 봐야 할 자료나 연구가 있습니까?',
          'In adult literacy education, is there material or research we really ought to look at?',
          'În educația alfabetizării adulților, există materiale sau cercetări la care ar trebui neapărat să ne uităm?',
        ),
        note: T(
          '교재, 조사 보고서, 논문 무엇이든 좋습니다. 제목만 적어 주셔도 찾아 읽겠습니다.',
          'A textbook, a survey report, a paper — anything. A title alone is enough and we will find it.',
          'Un manual, un raport, o lucrare — orice. Este suficient un titlu și îl vom găsi.',
        ),
      },
      {
        id: 'li5_tension',
        kind: 'single' as const,
        q: T(
          '이런 도구가 글을 배우려는 동기를 줄인다고 보십니까?',
          'Do you think a tool like this reduces the motivation to learn to read?',
          'Credeți că un astfel de instrument reduce motivația de a învăța să citești?',
        ),
        note: T(
          '저희 도구는 읽지 않고도 되게 만드는 것이므로, 문해교육의 목적과 부딪칠 수 있습니다. 이 자리에서 물어야 할 질문이라고 생각했습니다.',
          'Our tool is built so that reading is not needed, which may run against the purpose of literacy education. We thought this was the right place to ask.',
          'Instrumentul nostru este construit astfel încât cititul să nu fie necesar, ceea ce poate intra în conflict cu scopul educației alfabetizării. Am considerat că acesta este locul potrivit pentru a întreba.',
        ),
        options: [
          T('그렇다', 'Yes', 'Da'),
          T('일부 그런 면이 있다', 'In part', 'În parte'),
          T('아니다 — 오히려 도움이 된다', 'No — it helps, if anything', 'Nu — mai degrabă ajută'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('덧붙일 말이 있으면 적어 주십시오.', 'Anything to add?', 'Aveți ceva de adăugat?'),
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
      {
        id: 'hc4_ref',
        kind: 'longtext' as const,
        q: T(
          '저문해 사용자용 인터페이스 연구 가운데 저희가 반드시 읽어야 할 것이 있습니까?',
          'In the literature on interfaces for low-literacy users, is there work we really ought to have read?',
          'În literatura despre interfețe pentru utilizatori cu alfabetizare redusă, există lucrări pe care ar trebui neapărat să le fi citit?',
        ),
        note: T(
          '저희는 text-free UI 계열(Medhi Thies 등)과 ICTD 쪽을 근거로 삼고 있습니다. 그 밖에 놓친 계보가 있으면 알려 주십시오.',
          'We build on the text-free UI line of work (Medhi Thies and others) and on ICTD. Tell us if there is a lineage we have missed.',
          'Ne bazăm pe linia de lucru text-free UI (Medhi Thies și alții) și pe ICTD. Spuneți-ne dacă am ratat o direcție.',
        ),
      },
      {
        id: 'hc5_onboarding',
        kind: 'single' as const,
        q: T(
          '글을 읽지 못하는 사람이 이 앱에 처음 닿을 때, 가장 먼저 막힐 지점은 어디입니까?',
          'When someone who cannot read first reaches this app, where do they get stuck first?',
          'Când cineva care nu poate citi ajunge prima dată la această aplicație, unde se blochează întâi?',
        ),
        options: [
          T('앱을 찾아 설치하는 것', 'Finding and installing it', 'Găsirea și instalarea'),
          T('카메라 권한 허용', 'Granting camera permission', 'Acordarea permisiunii pentru cameră'),
          T('처방전을 촬영하는 조작', 'Operating the camera to photograph a prescription', 'Fotografierea prescripției'),
          T('첫 화면이 무엇을 하라는 것인지 아는 것', 'Working out what the first screen is asking them to do', 'Înțelegerea a ceea ce cere primul ecran'),
          T('막히지 않는다', 'They do not get stuck', 'Nu se blochează'),
        ],
        follow: T('왜 그렇습니까?', 'Why?', 'De ce?'),
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
      {
        id: 'la5_photo',
        kind: 'single' as const,
        q: T(
          '처방전을 촬영해 기기 안에서만 처리하는 방식은 법적으로 어떻습니까?',
          'What is the legal position on photographing a prescription and processing it only on the device?',
          'Care este poziția juridică privind fotografierea unei prescripții și prelucrarea ei doar pe dispozitiv?',
        ),
        options: [
          T('문제되지 않는다', 'Not problematic', 'Nu este problematic'),
          T('조건을 갖추면 문제되지 않는다', 'Not problematic under conditions', 'Nu este problematic în anumite condiții'),
          T('문제가 된다', 'It is problematic', 'Este problematic'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('근거가 되는 조항이나 유의점을 적어 주십시오.', 'Which provision or caveat applies?', 'Ce prevedere sau atenționare se aplică?'),
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
      {
        id: 'st5_samd',
        kind: 'single' as const,
        q: T(
          '복약 지시를 자동으로 만들어 환자에게 제시하는 것이 의료기기 소프트웨어(SaMD)에 해당할 수 있습니까?',
          'Could automatically generating dosing instructions and presenting them to a patient fall under software as a medical device (SaMD)?',
          'Ar putea generarea automată a instrucțiunilor de dozare și prezentarea lor pacientului să intre sub incidența software-ului ca dispozitiv medical (SaMD)?',
        ),
        note: T(
          '저희가 전혀 검토하지 못한 지점입니다. 해당한다면 프로젝트의 성격 자체가 달라지므로, 지금 아는 편이 낫습니다.',
          'This is something we have not examined at all. If it applies, the nature of the project changes entirely, so we would rather know now.',
          'Acesta este un aspect pe care nu l-am examinat deloc. Dacă se aplică, natura proiectului se schimbă complet, deci preferăm să aflăm acum.',
        ),
        options: [
          T('해당하지 않는다', 'No', 'Nu'),
          T('기능에 따라 해당할 수 있다', 'It could, depending on the function', 'Ar putea, în funcție de funcție'),
          T('해당한다', 'Yes', 'Da'),
          T('판단하기 어렵다', 'Hard to say', 'Greu de spus'),
        ],
        follow: T('어느 기준이 갈림길이 됩니까?', 'Which criterion is the deciding one?', 'Care criteriu este decisiv?'),
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
      {
        id: 'in5_sustain',
        kind: 'single' as const,
        q: T(
          '학생 팀이 만든 것이 대회가 끝난 뒤에도 유지되려면 무엇이 필요합니까?',
          'For something built by a student team to survive after the contest, what does it take?',
          'Pentru ca ceva construit de o echipă de studenți să supraviețuiască după concurs, ce este necesar?',
        ),
        options: [
          T('운영을 맡을 주체를 찾아 넘겨야 한다', 'Hand it to an organisation that will operate it', 'Predarea către o organizație care îl va opera'),
          T('오픈소스로 공개해 두어야 한다', 'Release it as open source', 'Publicarea ca open source'),
          T('기관과 제휴해야 한다', 'Partner with an institution', 'Parteneriat cu o instituție'),
          T('대회 뒤 멈추는 것이 자연스럽다', 'Stopping after the contest is the normal outcome', 'Oprirea după concurs este rezultatul firesc'),
          T('그 밖', 'Something else', 'Altceva'),
        ],
        follow: T('무엇을 준비해 두어야 합니까?', 'What should we put in place now?', 'Ce ar trebui să pregătim acum?'),
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
    '6~7분 걸립니다. 저희가 만든 화면을 보시고, 이어서 선생님 분야에 해당하는 문항에 답하시게 됩니다. 답하고 싶은 것만 답하셔도 됩니다.',
    'It takes 6–7 minutes — you look at what we built, then answer a few questions for your own field. Answer only what you wish.',
    'Durează 6–7 minute — priviți ce am construit, apoi răspundeți la câteva întrebări pentru domeniul dumneavoastră. Răspundeți doar la ce doriți.',
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
