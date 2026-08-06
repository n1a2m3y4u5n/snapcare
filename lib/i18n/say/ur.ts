import type { SayPack } from '../types.ts';

/**
 * اردو — 파키스탄. Atif Usman 교수가 답해 준 나라의 언어다.
 *
 * 한국어처럼 서술어가 끝에 오므로 꾸밈말이 앞이다. 글자는 오른쪽에서 왼쪽으로 쓰지만
 * 여기서 다루는 것은 소리라 배치와 무관하다 — 화면 번역은 그 다음 일이고, 그때는
 * `dir="rtl"` 이 따로 필요하다(lib/i18n/languages.ts 에 적어 두었다).
 */
export const ur: SayPack = {
  order: 'mod-first',
  join: ' ',
  phrases: {
    /*
      홈 화면이 도착하자마자 하는 말. 이 앱에서 **가장 많이 들리는 문장**이고, 언어를
      고를 때 미리 들려주는 것도 이것이다 — 고르는 자리에서 듣는 소리와 실제로 앱을
      열었을 때 나는 소리가 같아야 고른 것이 무엇인지 알 수 있다.
    */
    'home.intro': 'SnapCare۔ کھانے یا دوا کی تصویر لے کر اسے جانچیں۔ درمیان والا بڑا سبز بٹن تصویر لیتا ہے۔',
    /*
      판정 세 단계. 그림에는 없는 말이라 여기 둔다 — 그림은 "무엇이 들었나" 를
      말하고, 이 셋은 "그래서 어떻게 하라" 를 말한다. 문장을 짧게 두는 것이 규칙이다:
      되감기가 없는 매체에서 첫마디가 행동이어야 한다.
    */
    'verdict.avoid': 'استعمال نہ کریں۔',
    'verdict.caution': 'احتیاط کریں۔',
    'verdict.safe.eat': 'کھانا محفوظ ہے۔',
    'verdict.safe.drink': 'پینا محفوظ ہے۔',
    'allergen_peanut.yes': 'اس میں مونگ پھلی ہے۔',
    'allergen_peanut.no': 'یہ مت کھائیں۔ اس میں مونگ پھلی ہے۔',
    'allergen_tree_nut.yes': 'اس میں خشک میوہ جات ہیں۔',
    'allergen_tree_nut.no': 'یہ مت کھائیں۔ اس میں خشک میوہ جات ہیں۔',
    'allergen_milk.yes': 'اس میں دودھ ہے۔',
    'allergen_milk.no': 'یہ مت کھائیں۔ اس میں دودھ ہے۔',
    'allergen_egg.yes': 'اس میں انڈا ہے۔',
    'allergen_egg.no': 'یہ مت کھائیں۔ اس میں انڈا ہے۔',
    'allergen_shellfish.yes': 'اس میں جھینگا مچھلی ہے۔',
    'allergen_shellfish.no': 'یہ مت کھائیں۔ اس میں جھینگا مچھلی ہے۔',
    'allergen_gluten.yes': 'اس میں گندم ہے۔',
    'allergen_gluten.no': 'یہ مت کھائیں۔ اس میں گندم ہے۔',
    'allergen_soy.yes': 'اس میں سویا ہے۔',
    'allergen_soy.no': 'یہ مت کھائیں۔ اس میں سویا ہے۔',
    'allergen_sesame.yes': 'اس میں تل ہیں۔',
    'allergen_sesame.no': 'یہ مت کھائیں۔ اس میں تل ہیں۔',
    'food_sugar.yes': 'اس میں چینی بہت ہے۔',
    'food_sugar.no': 'آپ کے لیے چینی بہت زیادہ ہے۔',
    'food_salt.yes': 'اس میں نمک بہت ہے۔',
    'food_salt.no': 'آپ کے لیے نمک بہت زیادہ ہے۔',
    'food_oil.yes': 'اس میں چکنائی بہت ہے۔',
    'food_oil.no': 'آپ کے لیے چکنائی بہت زیادہ ہے۔',
    'caffeine.yes': 'اس میں کیفین ہے۔',
    'caffeine.no': 'آپ کے لیے کیفین منع ہے۔',
    'no_alcohol.yes': 'یہ دوا لیتے ہوئے شراب مت پئیں۔',
    'warn_bleeding.yes': 'اس سے خون بہنا بڑھ سکتا ہے۔',
    'state_pregnant.yes': 'حمل کے دوران محفوظ نہیں۔',
    'state_breastfeeding.yes': 'دودھ پلانے کے دوران محفوظ نہیں۔',

    'capsule_strip.yes': 'ایک کیپسول لیں۔',
    'capsule_strip.no': 'یہ کیپسول مت لیں۔',
    'tablet_blister.yes': 'ایک گولی لیں۔',
    'tablet_blister.no': 'یہ گولی مت لیں۔',
    'pill_bottle.yes': 'یہ دوا لیں۔',
    'pill_bottle.no': 'یہ دوا مت لیں۔',
    'liquid_bottle.yes': 'شربت لیں۔',
    'liquid_bottle.no': 'یہ دوا مت لیں۔',
    'dropper_bottle.yes': 'قطرے ڈالیں۔',
    'dropper_bottle.no': 'یہ قطرے استعمال مت کریں۔',
    'cream_tube.yes': 'کریم لگائیں۔',
    'cream_tube.no': 'یہ کریم استعمال مت کریں۔',
    'inhaler.yes': 'انہیلر استعمال کریں۔',
    'inhaler.no': 'یہ انہیلر استعمال مت کریں۔',
    'syringe.yes': 'ٹیکہ لگائیں۔',
    'syringe.no': 'یہ ٹیکہ استعمال مت کریں۔',
    'sachet.yes': 'سفوف والا ساشے لیں۔',
    'sachet.no': 'یہ ساشے مت لیں۔',
    'suppository.yes': 'سپازٹری استعمال کریں۔',
    'suppository.no': 'یہ سپازٹری استعمال مت کریں۔',

    'body_eye.yes': 'آنکھ میں',
    'body_skin.yes': 'جلد پر',
    'body_mouth.yes': 'منہ میں',
    'food_bowl.yes': 'کھانے کے ساتھ',
    'food_empty_bowl.yes': 'خالی پیٹ',
    'time_morning.yes': 'صبح',
    'time_morning.alone': 'صبح لیں۔',
    'time_noon.yes': 'دوپہر کو',
    'time_noon.alone': 'دوپہر کو لیں۔',
    'time_evening.yes': 'شام کو',
    'time_evening.alone': 'شام کو لیں۔',
    'time_night.yes': 'رات کو',
    'time_night.alone': 'رات کو لیں۔',
    'storage_fridge.yes': 'فریج میں رکھیں',
    'storage_dry.yes': 'خشک جگہ پر، گرمی سے دور رکھیں',
    'qty_one.yes': 'ہر بار ایک',
    'qty_two.yes': 'ہر بار دو',
    'qty_three.yes': 'ہر بار تین',
    'qty_four.yes': 'ہر بار چار',
    'qty_five.yes': 'ہر بار پانچ',
    'contact_lens.yes': 'کانٹیکٹ لینز',
    'contact_lens.no': 'پہلے اپنے کانٹیکٹ لینز اتاریں۔',
    'hand_wash.yes': 'پہلے اپنے ہاتھ دھوئیں۔',
    'shake_bottle.yes': 'استعمال سے پہلے بوتل کو اچھی طرح ہلائیں۔',
    'finish_course.yes': 'طبیعت بہتر ہو جائے تب بھی پوری دوا مکمل کریں۔',

    'cadence.twice_daily': 'دن میں دو بار،',
    'cadence.three_times_daily': 'دن میں تین بار،',
    'cadence.four_times_daily': 'دن میں چار بار،',
    'missing': 'اس کے لیے ہمارے پاس تصویر نہیں ہے۔',
  },
};
