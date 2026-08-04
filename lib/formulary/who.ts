import type { ItemFlag } from '@/lib/snapcare/types';

/**
 * **약품표.** 이름 하나로 그림까지 가는 길.
 *
 * 왜 표가 필요한가
 * ----------------
 * 처방전에서 읽어야 할 것이 여섯이다 — 이름, 그림, 몇 번째 층, 무슨 요일, 며칠치,
 * 몇 시. 뒤의 넷은 폼시트가 이미 버블로 읽는다(`form_sheet_config.json`). 이름은
 * 종이에 손으로 적히고, **그림은 종이 어디에도 없다.**
 *
 * 그림이 없는 이유는 종이가 게을러서가 아니다. 픽토그램 엔진이 필요로 하는 것은
 * 제형(정제·캡슐·시럽·안약…)과 경고 플래그인데(`lib/snapcare/sigil.ts` 의
 * `FORM_HEAD`, `VOICE`), `"Amoxicillin"` 이라는 글자에는 그 중 어느 것도 들어 있지
 * 않다. 이름에서 그림을 뽑는 것은 원리상 불가능하고, 그 사이를 잇는 것이 표다.
 *
 * 그리고 표가 **OCR 을 쓸 만하게 만든다.** 손글씨 자유 텍스트를 그대로 믿는 것은
 * 이 저장소가 이미 실패를 측정한 일이다 — 라고스 안과 처방전에서 `8hrly` 가
 * `8mg` 로 읽혔다. 그런데 "아무 글자나 맞히기" 와 "이 목록에서 가장 가까운 것
 * 고르기" 는 전혀 다른 문제다. 뒤쪽은 어휘가 닫혀 있어서 몇 글자가 망가져도 답이
 * 하나로 모인다. 그것이 `match.ts` 가 하는 일이다.
 *
 * 무엇을 담았나
 * -------------
 * WHO 필수의약품 목록(Model List of Essential Medicines)에서 골랐다. 고른 기준은
 * 대상 지역의 일차 진료에서 실제로 처방되는 것들이고, 절 번호를 줄마다 남겨 두어
 * 어디서 온 값인지 되짚을 수 있게 했다.
 *
 * **전체가 아니다.** eEML 은 667개 의약품에 1,400개가 넘는 권고를 담고 있고,
 * 기계가 읽을 수 있는 배포본은 없다(엑셀과 PDF 뿐이다). 여기 있는 것은 그 중
 * 일차 진료에서 흔한 것들이다. 표에 없는 약은 **없다고 말한다** — 가장 가까운
 * 것을 억지로 고르는 것이 이 파일에서 가장 하면 안 되는 일이고, `match.ts` 의
 * 문턱값이 그것을 막는 장치다.
 *
 * 플래그는 보수적으로 달았다. 확립된 것만 — ACE 억제제·ARB·스타틴·발프로산의
 * 임신 금기, 테트라사이클린계의 임신 금기, 메트로니다졸의 음주 금기처럼 교과서
 * 수준으로 굳은 것들이다. 애매한 것은 안 달았다. 빠진 경고는 화면에 안 뜨지만,
 * 틀린 경고는 사람이 약을 안 먹게 만든다.
 */

/** 제형. `ScanItem.rx.form` 과 같은 어휘라 그대로 넘어간다. */
export type DrugForm =
  | 'tablet' | 'capsule' | 'syrup' | 'eyedrop' | 'cream'
  | 'inhaler' | 'injection' | 'suppository' | 'sachet';

export interface Drug {
  /** INN. 표의 열쇠이자 맞추기의 기본 후보. */
  inn: string;
  /** 화면에 쓸 이름. 보통 INN 을 그대로 쓰지만 병합제는 짧게 줄인다. */
  name: string;
  /**
   * 같은 약이 종이에 적힐 수 있는 다른 이름들.
   *
   * 상품명(Panadol), 다른 철자(amoxycillin), 미국 이름(acetaminophen).
   * 의사가 INN 으로만 쓴다는 보장이 없고, 실제로는 상품명을 더 많이 쓴다.
   */
  also?: string[];
  form: DrugForm;
  /** 판정과 픽토그램이 함께 쓰는 플래그. */
  flags?: ItemFlag[];
  /** WHO EML 절 — 이 줄의 출처. */
  eml: string;
}

/**
 * 표 본체.
 *
 * 순서는 EML 의 절 순서다. 알파벳순이 아닌 이유는 이 파일을 사람이 검토할 때
 * 필요한 물음이 "이 약이 있나" 가 아니라 "이 분야가 비어 있나" 이기 때문이다.
 */
export const WHO_DRUGS: Drug[] = [
  // ── 2. 통증·해열 ─────────────────────────────────────────────────────
  { inn: 'paracetamol', name: 'Paracetamol', also: ['acetaminophen', 'panadol'], form: 'tablet', eml: '2.1' },
  { inn: 'ibuprofen', name: 'Ibuprofen', also: ['brufen'], form: 'tablet', flags: ['nsaid_bleed'], eml: '2.1' },
  { inn: 'acetylsalicylic acid', name: 'Aspirin', also: ['aspirin', 'asa'], form: 'tablet', flags: ['nsaid_bleed'], eml: '2.1' },
  { inn: 'morphine', name: 'Morphine', form: 'tablet', flags: ['alcohol'], eml: '2.2' },

  // ── 3. 알레르기 ──────────────────────────────────────────────────────
  { inn: 'chlorphenamine', name: 'Chlorphenamine', also: ['chlorpheniramine'], form: 'tablet', flags: ['alcohol'], eml: '3' },
  { inn: 'loratadine', name: 'Loratadine', form: 'tablet', eml: '3' },

  // ── 6.1 구충 ─────────────────────────────────────────────────────────
  { inn: 'albendazole', name: 'Albendazole', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '6.1.1' },
  { inn: 'mebendazole', name: 'Mebendazole', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '6.1.1' },
  { inn: 'praziquantel', name: 'Praziquantel', form: 'tablet', eml: '6.1.2' },
  { inn: 'ivermectin', name: 'Ivermectin', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '6.1.3' },

  // ── 6.2 항균 ─────────────────────────────────────────────────────────
  { inn: 'amoxicillin', name: 'Amoxicillin', also: ['amoxycillin', 'amoxil'], form: 'capsule', eml: '6.2.1' },
  { inn: 'amoxicillin + clavulanic acid', name: 'Co-amoxiclav', also: ['coamoxiclav', 'augmentin'], form: 'tablet', eml: '6.2.1' },
  { inn: 'ampicillin', name: 'Ampicillin', form: 'injection', eml: '6.2.1' },
  { inn: 'benzylpenicillin', name: 'Benzylpenicillin', also: ['penicillin g'], form: 'injection', eml: '6.2.1' },
  { inn: 'phenoxymethylpenicillin', name: 'Phenoxymethylpenicillin', also: ['penicillin v'], form: 'tablet', eml: '6.2.1' },
  { inn: 'cloxacillin', name: 'Cloxacillin', form: 'capsule', eml: '6.2.1' },
  { inn: 'cefalexin', name: 'Cefalexin', also: ['cephalexin', 'keflex'], form: 'capsule', eml: '6.2.1' },
  { inn: 'ceftriaxone', name: 'Ceftriaxone', form: 'injection', eml: '6.2.1' },
  { inn: 'azithromycin', name: 'Azithromycin', also: ['zithromax'], form: 'tablet', eml: '6.2.1' },
  { inn: 'erythromycin', name: 'Erythromycin', form: 'tablet', eml: '6.2.1' },
  { inn: 'clarithromycin', name: 'Clarithromycin', form: 'tablet', eml: '6.2.1' },
  { inn: 'ciprofloxacin', name: 'Ciprofloxacin', also: ['cipro'], form: 'tablet', eml: '6.2.2' },
  { inn: 'doxycycline', name: 'Doxycycline', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '6.2.1' },
  { inn: 'metronidazole', name: 'Metronidazole', also: ['flagyl'], form: 'tablet', flags: ['alcohol'], eml: '6.2.2' },
  { inn: 'nitrofurantoin', name: 'Nitrofurantoin', form: 'tablet', eml: '6.2.1' },
  { inn: 'sulfamethoxazole + trimethoprim', name: 'Co-trimoxazole', also: ['cotrimoxazole', 'septrin', 'bactrim'], form: 'tablet', eml: '6.2.1' },
  { inn: 'gentamicin', name: 'Gentamicin', form: 'injection', eml: '6.2.2' },
  { inn: 'clindamycin', name: 'Clindamycin', form: 'capsule', eml: '6.2.2' },
  { inn: 'vancomycin', name: 'Vancomycin', form: 'injection', eml: '6.2.3' },
  { inn: 'chloramphenicol', name: 'Chloramphenicol', form: 'capsule', eml: '6.2.2' },

  // ── 6.2.4 결핵 ───────────────────────────────────────────────────────
  { inn: 'isoniazid', name: 'Isoniazid', also: ['inh'], form: 'tablet', eml: '6.2.4' },
  { inn: 'rifampicin', name: 'Rifampicin', also: ['rifampin'], form: 'capsule', eml: '6.2.4' },
  { inn: 'pyrazinamide', name: 'Pyrazinamide', form: 'tablet', eml: '6.2.4' },
  { inn: 'ethambutol', name: 'Ethambutol', form: 'tablet', eml: '6.2.4' },

  // ── 6.4 항바이러스 ───────────────────────────────────────────────────
  { inn: 'aciclovir', name: 'Aciclovir', also: ['acyclovir'], form: 'tablet', eml: '6.4.1' },
  { inn: 'tenofovir disoproxil fumarate', name: 'Tenofovir', also: ['tdf'], form: 'tablet', eml: '6.4.2' },
  { inn: 'lamivudine', name: 'Lamivudine', also: ['3tc'], form: 'tablet', eml: '6.4.2' },
  { inn: 'dolutegravir', name: 'Dolutegravir', also: ['dtg'], form: 'tablet', eml: '6.4.2' },
  { inn: 'efavirenz', name: 'Efavirenz', also: ['efv'], form: 'tablet', eml: '6.4.2' },
  { inn: 'nevirapine', name: 'Nevirapine', also: ['nvp'], form: 'tablet', eml: '6.4.2' },
  { inn: 'zidovudine', name: 'Zidovudine', also: ['azt'], form: 'tablet', eml: '6.4.2' },

  // ── 6.5.3 말라리아 ───────────────────────────────────────────────────
  { inn: 'artemether + lumefantrine', name: 'Artemether-lumefantrine', also: ['coartem', 'al'], form: 'tablet', eml: '6.5.3' },
  { inn: 'artesunate', name: 'Artesunate', form: 'injection', eml: '6.5.3' },
  { inn: 'chloroquine', name: 'Chloroquine', form: 'tablet', eml: '6.5.3' },
  { inn: 'primaquine', name: 'Primaquine', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '6.5.3' },
  { inn: 'sulfadoxine + pyrimethamine', name: 'Sulfadoxine-pyrimethamine', also: ['sp', 'fansidar'], form: 'tablet', eml: '6.5.3' },

  // ── 12. 심혈관 ───────────────────────────────────────────────────────
  { inn: 'amlodipine', name: 'Amlodipine', form: 'tablet', eml: '12.3' },
  { inn: 'atenolol', name: 'Atenolol', form: 'tablet', eml: '12.2' },
  { inn: 'bisoprolol', name: 'Bisoprolol', form: 'tablet', eml: '12.2' },
  { inn: 'enalapril', name: 'Enalapril', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '12.3' },
  { inn: 'lisinopril', name: 'Lisinopril', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '12.3' },
  { inn: 'losartan', name: 'Losartan', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '12.3' },
  { inn: 'methyldopa', name: 'Methyldopa', form: 'tablet', eml: '12.3' },
  { inn: 'hydrochlorothiazide', name: 'Hydrochlorothiazide', also: ['hctz'], form: 'tablet', eml: '16' },
  { inn: 'furosemide', name: 'Furosemide', also: ['frusemide', 'lasix'], form: 'tablet', eml: '16' },
  { inn: 'spironolactone', name: 'Spironolactone', form: 'tablet', eml: '16' },
  { inn: 'simvastatin', name: 'Simvastatin', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '12.6' },
  { inn: 'atorvastatin', name: 'Atorvastatin', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '12.6' },
  { inn: 'digoxin', name: 'Digoxin', form: 'tablet', eml: '12.4' },
  { inn: 'warfarin', name: 'Warfarin', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '10.2' },
  { inn: 'glyceryl trinitrate', name: 'Glyceryl trinitrate', also: ['gtn', 'nitroglycerin'], form: 'tablet', eml: '12.1' },

  // ── 17. 소화기 ───────────────────────────────────────────────────────
  { inn: 'omeprazole', name: 'Omeprazole', form: 'capsule', eml: '17.1' },
  { inn: 'oral rehydration salts', name: 'Oral rehydration salts', also: ['ors'], form: 'sachet', eml: '17.5.1' },
  { inn: 'zinc sulfate', name: 'Zinc sulfate', also: ['zinc'], form: 'tablet', eml: '17.5.1' },
  { inn: 'ondansetron', name: 'Ondansetron', form: 'tablet', eml: '17.2' },

  // ── 18.5 당뇨 ────────────────────────────────────────────────────────
  { inn: 'metformin', name: 'Metformin', also: ['glucophage'], form: 'tablet', eml: '18.5.2' },
  { inn: 'glibenclamide', name: 'Glibenclamide', also: ['glyburide'], form: 'tablet', eml: '18.5.2' },
  { inn: 'gliclazide', name: 'Gliclazide', form: 'tablet', eml: '18.5.2' },
  { inn: 'insulin human', name: 'Insulin', also: ['insulin'], form: 'injection', eml: '18.5.1' },

  // ── 21. 안과 ─────────────────────────────────────────────────────────
  { inn: 'timolol', name: 'Timolol', form: 'eyedrop', eml: '21.4' },
  { inn: 'aciclovir eye ointment', name: 'Aciclovir eye ointment', form: 'cream', eml: '21.1' },
  { inn: 'tetracycline eye ointment', name: 'Tetracycline eye ointment', form: 'cream', eml: '21.1' },

  // ── 22. 산과 ─────────────────────────────────────────────────────────
  { inn: 'oxytocin', name: 'Oxytocin', form: 'injection', eml: '22.1' },
  { inn: 'misoprostol', name: 'Misoprostol', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '22.1' },

  // ── 24. 정신 ─────────────────────────────────────────────────────────
  { inn: 'amitriptyline', name: 'Amitriptyline', form: 'tablet', flags: ['alcohol'], eml: '24.2.1' },
  { inn: 'fluoxetine', name: 'Fluoxetine', form: 'capsule', eml: '24.2.1' },
  { inn: 'haloperidol', name: 'Haloperidol', form: 'tablet', flags: ['alcohol'], eml: '24.1' },
  { inn: 'diazepam', name: 'Diazepam', also: ['valium'], form: 'tablet', flags: ['alcohol'], eml: '24.3' },

  // ── 5. 항경련 ────────────────────────────────────────────────────────
  { inn: 'carbamazepine', name: 'Carbamazepine', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '5' },
  { inn: 'phenytoin', name: 'Phenytoin', form: 'tablet', flags: ['unsafe_pregnancy'], eml: '5' },
  { inn: 'valproic acid', name: 'Sodium valproate', also: ['sodium valproate', 'valproate'], form: 'tablet', flags: ['unsafe_pregnancy'], eml: '5' },
  { inn: 'phenobarbital', name: 'Phenobarbital', also: ['phenobarbitone'], form: 'tablet', flags: ['alcohol'], eml: '5' },

  // ── 25. 호흡기 ───────────────────────────────────────────────────────
  { inn: 'salbutamol', name: 'Salbutamol', also: ['albuterol', 'ventolin'], form: 'inhaler', eml: '25.1' },
  { inn: 'beclometasone', name: 'Beclometasone', also: ['beclomethasone'], form: 'inhaler', eml: '25.1' },
  { inn: 'prednisolone', name: 'Prednisolone', form: 'tablet', eml: '25.1' },
  { inn: 'epinephrine', name: 'Adrenaline', also: ['adrenaline'], form: 'injection', eml: '25.2' },

  // ── 13. 피부 ─────────────────────────────────────────────────────────
  { inn: 'hydrocortisone', name: 'Hydrocortisone cream', form: 'cream', eml: '13.3' },
  { inn: 'miconazole', name: 'Miconazole cream', form: 'cream', eml: '13.1' },
  { inn: 'permethrin', name: 'Permethrin', form: 'cream', eml: '13.5' },

  // ── 27. 비타민·무기질 ────────────────────────────────────────────────
  { inn: 'ferrous salt', name: 'Iron', also: ['ferrous sulfate', 'ferrous sulphate', 'iron'], form: 'tablet', eml: '10.1' },
  { inn: 'folic acid', name: 'Folic acid', form: 'tablet', eml: '10.1' },
  { inn: 'retinol', name: 'Vitamin A', also: ['vitamin a'], form: 'capsule', flags: ['unsafe_pregnancy'], eml: '27' },
  { inn: 'colecalciferol', name: 'Vitamin D', also: ['cholecalciferol', 'vitamin d'], form: 'tablet', eml: '27' },
];

/** 표에 실린 약의 수. 화면이 "몇 개 중에서 골랐는지" 를 말할 때 쓴다. */
export const DRUG_COUNT = WHO_DRUGS.length;
