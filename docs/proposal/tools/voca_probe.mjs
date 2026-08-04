/**
 * 제형마다 VOCA 가 실제로 내놓는 문장을 찍어 준다.
 *
 * §2.3 이 제형별로 동사와 부위와 마무리 문장을 표로 적는다. 안약을 "드세요"
 * 라고 말하는 것은 어색한 표현이 아니라 잘못된 지시이므로, 그 표가 구현과
 * 어긋나면 문서가 틀린 지시를 싣게 된다. 사람이 눈으로 맞출 표가 아니다.
 *
 * `check_docs.py` 의 `voca_verbs` 가 이것을 돌려 표와 견준다. 따로 돌려
 * 보려면 저장소 뿌리에서:
 *
 *     node --experimental-strip-types docs/proposal/tools/voca_probe.mjs
 *
 * 저장소에 node_modules 가 있어야 한다.
 */
import { doseSentence } from '../../../lib/snapcare/say.ts';

const FORMS = ['eyedrop', 'cream', 'inhaler', 'syrup', 'injection',
  'suppository', 'tablet', 'capsule'];

const out = {};
for (const form of FORMS) {
  out[form] = doseSentence({ doseText: '1', form, freqText: '', name: 'X' });
}
console.log(JSON.stringify(out, null, 0));
