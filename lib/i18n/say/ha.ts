import type { SayPack } from '../types.ts';

/**
 * Hausa — 나이지리아 북부. Ahmadu Bello University 의 Samirah Abdu-Aguye 교수가
 * 답해 준 곳이고, 되말하기를 실무에서 하고 있다고 적은 사람이다.
 *
 * 어순은 영어와 같아 꾸밈말이 뒤에 온다.
 */
export const ha: SayPack = {
  order: 'head-first',
  join: ', ',
  phrases: {
    /*
      홈 화면이 도착하자마자 하는 말. 이 앱에서 **가장 많이 들리는 문장**이고, 언어를
      고를 때 미리 들려주는 것도 이것이다 — 고르는 자리에서 듣는 소리와 실제로 앱을
      열었을 때 나는 소리가 같아야 고른 것이 무엇인지 알 수 있다.
    */
    'home.intro': 'SnapCare. Ɗauki hoton abinci ko magani don a duba shi. Babban maɓalli kore da ke tsakiya yana ɗaukar hoto.',
    /*
      판정 세 단계. 그림에는 없는 말이라 여기 둔다 — 그림은 "무엇이 들었나" 를
      말하고, 이 셋은 "그래서 어떻게 하라" 를 말한다. 문장을 짧게 두는 것이 규칙이다:
      되감기가 없는 매체에서 첫마디가 행동이어야 한다.
    */
    'verdict.avoid': 'Kada a sha ko a ci.',
    'verdict.caution': 'A yi hankali.',
    'verdict.safe.eat': 'Yana da lafiya a ci.',
    'verdict.safe.drink': 'Yana da lafiya a sha.',
    'allergen_peanut.yes': 'Yana da gyada.',
    'allergen_peanut.no': 'Kada ka ci wannan. Yana da gyada.',
    'allergen_tree_nut.yes': 'Yana da goro.',
    'allergen_tree_nut.no': 'Kada ka ci wannan. Yana da goro.',
    'allergen_milk.yes': 'Yana da madara.',
    'allergen_milk.no': 'Kada ka ci wannan. Yana da madara.',
    'allergen_egg.yes': 'Yana da kwai.',
    'allergen_egg.no': 'Kada ka ci wannan. Yana da kwai.',
    'allergen_shellfish.yes': 'Yana da kifin bawo.',
    'allergen_shellfish.no': 'Kada ka ci wannan. Yana da kifin bawo.',
    'allergen_gluten.yes': 'Yana da alkama.',
    'allergen_gluten.no': 'Kada ka ci wannan. Yana da alkama.',
    'allergen_soy.yes': 'Yana da waken soya.',
    'allergen_soy.no': 'Kada ka ci wannan. Yana da waken soya.',
    'allergen_sesame.yes': 'Yana da ridi.',
    'allergen_sesame.no': 'Kada ka ci wannan. Yana da ridi.',
    'food_sugar.yes': 'Yana da sukari mai yawa.',
    'food_sugar.no': 'Sukari ya yi maka yawa.',
    'food_salt.yes': 'Yana da gishiri mai yawa.',
    'food_salt.no': 'Gishiri ya yi maka yawa.',
    'food_oil.yes': 'Yana da mai mai yawa.',
    'food_oil.no': 'Mai ya yi maka yawa.',
    'caffeine.yes': 'Yana da kafeyin.',
    'caffeine.no': 'Kada ka sha kafeyin.',
    'no_alcohol.yes': 'Kada ka sha giya lokacin da kake shan wannan magani.',
    'warn_bleeding.yes': 'Wannan na iya kara zubar jini.',
    'state_pregnant.yes': 'Ba shi da lafiya lokacin ciki.',
    'state_breastfeeding.yes': 'Ba shi da lafiya lokacin shayarwa.',

    'capsule_strip.yes': 'Kwaya ta kapsul.',
    'capsule_strip.no': 'Kada ka sha wannan kapsul.',
    'tablet_blister.yes': 'Kwaya.',
    'tablet_blister.no': 'Kada ka sha wannan kwaya.',
    'pill_bottle.yes': 'Wannan magani.',
    'pill_bottle.no': 'Kada ka sha wannan magani.',
    'liquid_bottle.yes': 'Maganin ruwa.',
    'liquid_bottle.no': 'Kada ka sha wannan magani.',
    'dropper_bottle.yes': 'Digon magani.',
    'dropper_bottle.no': 'Kada ka yi amfani da wadannan digo.',
    'cream_tube.yes': 'Man shafawa.',
    'cream_tube.no': 'Kada ka yi amfani da wannan man shafawa.',
    "inhaler.yes": "Na'urar shaka.",
    'inhaler.no': "Kada ka yi amfani da wannan na'ura.",
    'syringe.yes': 'Allura.',
    'syringe.no': 'Kada ka yi amfani da wannan allura.',
    'sachet.yes': 'Maganin garin.',
    'sachet.no': 'Kada ka sha wannan garin.',
    'suppository.yes': 'Maganin dubura.',
    'suppository.no': 'Kada ka yi amfani da wannan magani.',

    'body_eye.yes': 'a cikin ido',
    'body_skin.yes': 'a kan fata',
    'body_mouth.yes': 'a cikin baki',
    'food_bowl.yes': 'tare da abinci',
    'food_empty_bowl.yes': 'a kan komai a ciki',
    'time_morning.yes': 'da safe',
    'time_morning.alone': 'Ka sha da safe.',
    'time_noon.yes': 'da rana',
    'time_noon.alone': 'Ka sha da rana.',
    'time_evening.yes': 'da yamma',
    'time_evening.alone': 'Ka sha da yamma.',
    'time_night.yes': 'da dare',
    'time_night.alone': 'Ka sha da dare.',
    'storage_fridge.yes': 'ka ajiye a firiji',
    'storage_dry.yes': 'ka ajiye a wuri bushe, nesa da zafi',
    'qty_one.yes': 'daya a kowane lokaci',
    'qty_two.yes': 'biyu a kowane lokaci',
    'qty_three.yes': 'uku a kowane lokaci',
    'qty_four.yes': 'hudu a kowane lokaci',
    'qty_five.yes': 'biyar a kowane lokaci',
    'contact_lens.yes': 'ruwan tabarau na ido',
    'contact_lens.no': 'Ka cire ruwan tabarau na ido tukuna.',
    'hand_wash.yes': 'Ka wanke hannunka tukuna.',
    'shake_bottle.yes': 'Ka girgiza kwalbar sosai kafin ka yi amfani da ita.',
    'finish_course.yes': 'Ka gama duka, ko da ka ji sauki.',

    'cadence.twice_daily': 'sau biyu a rana',
    'cadence.three_times_daily': 'sau uku a rana',
    'cadence.four_times_daily': 'sau hudu a rana',
    'missing': 'Ba mu da hoto don wannan.',
  },
};
