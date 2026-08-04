import type { SayPack } from '../types.ts';

/**
 * 한국어.
 *
 * 어순이 영어와 반대라 꾸밈말이 앞에 온다(`order: 'mod-first'`). 영어의
 * "A capsule, with food, three times a day." 를 그대로 이으면 "캡슐, 식사와 함께,
 * 하루 세 번." 이 되는데, 그것은 한국어 문장이 아니라 영어 문장에 한국어 낱말을
 * 끼운 것이다. 앞에 붙이면 "하루 세 번, 식사와 함께 캡슐을 드세요." 가 된다.
 *
 * 그래서 머리 문장은 서술어까지 갖춘 한 문장으로 두고("캡슐을 드세요."), 꾸밈말은
 * 그 앞에 놓이는 조각으로 둔다.
 */
export const ko: SayPack = {
  order: 'mod-first',
  join: ' ',
  phrases: {
    /*
      판정 세 단계. 그림에는 없는 말이라 여기 둔다 — 그림은 "무엇이 들었나" 를
      말하고, 이 셋은 "그래서 어떻게 하라" 를 말한다. 문장을 짧게 두는 것이 규칙이다:
      되감기가 없는 매체에서 첫마디가 행동이어야 한다.
    */
    'verdict.avoid': '드시지 마세요.',
    'verdict.caution': '주의하세요.',
    'verdict.safe.eat': '드셔도 됩니다.',
    'verdict.safe.drink': '마셔도 됩니다.',
    'allergen_peanut.yes': '땅콩이 들어 있습니다.',
    'allergen_peanut.no': '드시지 마세요. 땅콩이 들어 있습니다.',
    'allergen_tree_nut.yes': '견과류가 들어 있습니다.',
    'allergen_tree_nut.no': '드시지 마세요. 견과류가 들어 있습니다.',
    'allergen_milk.yes': '우유가 들어 있습니다.',
    'allergen_milk.no': '드시지 마세요. 우유가 들어 있습니다.',
    'allergen_egg.yes': '달걀이 들어 있습니다.',
    'allergen_egg.no': '드시지 마세요. 달걀이 들어 있습니다.',
    'allergen_shellfish.yes': '조개류가 들어 있습니다.',
    'allergen_shellfish.no': '드시지 마세요. 조개류가 들어 있습니다.',
    'allergen_gluten.yes': '밀이 들어 있습니다.',
    'allergen_gluten.no': '드시지 마세요. 밀이 들어 있습니다.',
    'allergen_soy.yes': '콩이 들어 있습니다.',
    'allergen_soy.no': '드시지 마세요. 콩이 들어 있습니다.',
    'allergen_sesame.yes': '참깨가 들어 있습니다.',
    'allergen_sesame.no': '드시지 마세요. 참깨가 들어 있습니다.',
    'food_sugar.yes': '설탕이 많이 들어 있습니다.',
    'food_sugar.no': '설탕이 너무 많습니다.',
    'food_salt.yes': '소금이 많이 들어 있습니다.',
    'food_salt.no': '소금이 너무 많습니다.',
    'food_oil.yes': '지방이 많이 들어 있습니다.',
    'food_oil.no': '지방이 너무 많습니다.',
    'caffeine.yes': '카페인이 들어 있습니다.',
    'caffeine.no': '카페인은 드시면 안 됩니다.',
    'no_alcohol.yes': '이 약을 드시는 동안 술을 드시면 안 됩니다.',
    'warn_bleeding.yes': '출혈이 심해질 수 있습니다.',
    'state_pregnant.yes': '임신 중에는 안 됩니다.',
    'state_breastfeeding.yes': '모유 수유 중에는 안 됩니다.',

    'capsule_strip.yes': '캡슐을 드세요.',
    'capsule_strip.no': '이 캡슐을 드시지 마세요.',
    'tablet_blister.yes': '알약을 드세요.',
    'tablet_blister.no': '이 알약을 드시지 마세요.',
    'pill_bottle.yes': '이 약을 드세요.',
    'pill_bottle.no': '이 약을 드시지 마세요.',
    'liquid_bottle.yes': '물약을 드세요.',
    'liquid_bottle.no': '이 약을 드시지 마세요.',
    'dropper_bottle.yes': '물약을 넣으세요.',
    'dropper_bottle.no': '이 물약을 쓰지 마세요.',
    'cream_tube.yes': '연고를 바르세요.',
    'cream_tube.no': '이 연고를 쓰지 마세요.',
    'inhaler.yes': '흡입기를 쓰세요.',
    'inhaler.no': '이 흡입기를 쓰지 마세요.',
    'syringe.yes': '주사를 맞으세요.',
    'syringe.no': '이 주사를 쓰지 마세요.',
    'sachet.yes': '가루약을 드세요.',
    'sachet.no': '이 가루약을 드시지 마세요.',
    'suppository.yes': '좌약을 쓰세요.',
    'suppository.no': '이 좌약을 쓰지 마세요.',

    'body_eye.yes': '눈에',
    'body_skin.yes': '피부에',
    'body_mouth.yes': '입에',
    'food_bowl.yes': '식사와 함께',
    'food_empty_bowl.yes': '빈속에',
    'time_morning.yes': '아침에',
    'time_morning.alone': '아침에 드세요.',
    'time_noon.yes': '낮에',
    'time_noon.alone': '낮에 드세요.',
    'time_evening.yes': '저녁에',
    'time_evening.alone': '저녁에 드세요.',
    'time_night.yes': '밤에',
    'time_night.alone': '밤에 드세요.',
    'storage_fridge.yes': '냉장고에 두세요',
    'storage_dry.yes': '뜨거운 곳을 피해 마른 곳에 두세요',
    'qty_one.yes': '한 번에 한 개씩',
    'qty_two.yes': '한 번에 두 개씩',
    'qty_three.yes': '한 번에 세 개씩',
    'qty_four.yes': '한 번에 네 개씩',
    'qty_five.yes': '한 번에 다섯 개씩',
    'contact_lens.yes': '콘택트렌즈',
    'contact_lens.no': '먼저 콘택트렌즈를 빼세요.',
    'hand_wash.yes': '먼저 손을 씻으세요.',
    'shake_bottle.yes': '쓰기 전에 병을 잘 흔드세요.',
    'finish_course.yes': '다 나은 것 같아도 끝까지 드세요.',

    'cadence.twice_daily': '하루 두 번,',
    'cadence.three_times_daily': '하루 세 번,',
    'cadence.four_times_daily': '하루 네 번,',
    'missing': '이 그림은 아직 없습니다.',
  },
};
