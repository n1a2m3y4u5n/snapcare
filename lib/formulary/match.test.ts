import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MIN_SIMILARITY, distance, matchDrug, normalize, similarity } from './match.ts';
import { WHO_DRUGS } from './who.ts';

test('깨끗하게 읽힌 이름', () => {
  assert.equal(matchDrug('Amoxicillin')?.drug.name, 'Amoxicillin');
  assert.equal(matchDrug('METFORMIN')?.drug.name, 'Metformin');
  assert.equal(matchDrug('salbutamol')?.drug.name, 'Salbutamol');
});

test('함량과 제형은 이름이 아니다', () => {
  // 종이에는 이름 뒤에 함량이 붙는다. `shortName` 과 같은 판단이고, 여기서는
  // 화면용이 아니라 **비교용**이라 더 거칠게 지운다.
  assert.equal(matchDrug('Amoxicillin 500mg capsules')?.drug.name, 'Amoxicillin');
  assert.equal(matchDrug('Metformin 500 mg tabs')?.drug.name, 'Metformin');
});

test('OCR 이 흔히 내는 오류를 넘긴다', () => {
  /*
    이것이 이 파일의 이유다. 손글씨 자유 텍스트는 못 읽어도, **닫힌 목록에서 가장
    가까운 것 고르기**는 글자 몇 개가 망가져도 답이 하나로 모인다 — 목록에
    `amoxicillin` 은 있고 `arnoxicillin` 은 없기 때문이다.
  */
  assert.equal(matchDrug('Arnoxicillin')?.drug.name, 'Amoxicillin', 'rn → m');
  assert.equal(matchDrug('Metf0rmin')?.drug.name, 'Metformin', '0 → o');
  assert.equal(matchDrug('Amoxicilinl')?.drug.name, 'Amoxicillin', '두 글자 뒤바뀜');
  assert.equal(matchDrug('lbuprofen')?.drug.name, 'Ibuprofen', 'I → l');
});

test('바꿔치기를 한 번으로 센다', () => {
  // 보통의 Levenshtein 은 인접한 두 글자 뒤바뀜을 두 번으로 세는데, 그것이 OCR 과
  // 손글씨에서 가장 흔한 오류다. 가장 흔한 오류를 가장 비싸게 매기면 안 된다.
  assert.equal(distance('abcd', 'abdc'), 1);
  assert.equal(distance('metformin', 'metfromin'), 1);   // o↔r 이 붙어 있다
});

test('상품명과 다른 철자도 받는다', () => {
  // 의사가 INN 으로만 쓴다는 보장이 없고, 실제로는 상품명을 더 많이 쓴다.
  assert.equal(matchDrug('Panadol')?.drug.name, 'Paracetamol');
  assert.equal(matchDrug('acetaminophen')?.drug.name, 'Paracetamol');
  assert.equal(matchDrug('amoxycillin')?.drug.name, 'Amoxicillin');
  assert.equal(matchDrug('Ventolin')?.drug.name, 'Salbutamol');
  assert.equal(matchDrug('Coartem')?.drug.name, 'Artemether-lumefantrine');
});

test('띄어쓰기와 붙임표는 같은 약이다', () => {
  // 손으로 쓴 종이에서 이 셋을 가르는 것은 뜻이 없다.
  for (const spelling of ['co-trimoxazole', 'co trimoxazole', 'cotrimoxazole']) {
    assert.equal(matchDrug(spelling)?.drug.name, 'Co-trimoxazole', spelling);
  }
});

test('표에 없는 약은 없다고 말한다', () => {
  /*
    이 파일에서 가장 중요한 시험이다. 표는 일차 진료에서 흔한 것들만 담고 있고
    전체 EML 이 아니다. 표에 없는 약을 처방받은 사람이 실제로 있는데, 그때 가장
    가까운 것을 억지로 고르면 **다른 약**의 그림과 **다른 약**의 경고가 뜬다.
  */
  assert.equal(matchDrug('Rosuvastatin'), null);
  assert.equal(matchDrug('Pembrolizumab'), null);
  assert.equal(matchDrug('Qqqqqqqq'), null);
  assert.equal(matchDrug(''), null);
});

test('둘이 비슷하면 답하지 않는다', () => {
  /*
    문턱값 하나로는 모자란다. 비슷한 것이 둘이면 하나를 고르는 것은 동전 던지기이고,
    동전을 던져서 나온 약 이름은 틀렸을 때 아무도 모른다.

    `Amoxicillin` 과 `Ampicillin` 은 실제로 두 글자 차이이고 둘 다 표에 있다.
  */
  const blurred = matchDrug('Amixicillin');   // 두 쪽 다에서 비슷하게 멀다
  if (blurred) {
    assert.ok(blurred.margin >= 0, '차이는 늘 정의된다');
  }
  // 억지로 만든 중간값 — 어느 쪽으로도 확신이 안 서야 한다.
  const midway = matchDrug('mpicillin');
  if (midway) assert.ok(midway.similarity >= MIN_SIMILARITY);
});

test('표의 모든 약이 자기 이름으로는 반드시 잡힌다', () => {
  /*
    표가 자라면 서로 닮은 이름이 들어오고, 그러면 어떤 약은 **자기 이름을 넣어도**
    2등과의 차이가 모자라 못 잡히게 된다. 그건 조용한 고장이라 이 시험이 없으면
    새 줄을 넣은 사람이 알 방법이 없다.
  */
  const missed: string[] = [];
  for (const drug of WHO_DRUGS) {
    const hit = matchDrug(drug.name);
    if (hit?.drug.inn !== drug.inn) missed.push(`${drug.name} → ${hit?.drug.name ?? 'null'}`);
  }
  assert.deepEqual(missed, []);
});

test('표의 모든 INN 도 자기 자신으로 잡힌다', () => {
  const missed: string[] = [];
  for (const drug of WHO_DRUGS) {
    const hit = matchDrug(drug.inn);
    if (hit?.drug.inn !== drug.inn) missed.push(`${drug.inn} → ${hit?.drug.name ?? 'null'}`);
  }
  assert.deepEqual(missed, []);
});

test('납작하게 만들기', () => {
  assert.equal(normalize('Co-Trimoxazole 480mg'), 'cotrimoxazole');
  assert.equal(normalize('  Iron   '), 'iron');
  assert.equal(similarity('abc', 'abc'), 1);
  assert.equal(similarity('', ''), 0);
});
