import type { SayPack } from '../types.ts';

/**
 * Română — 몰도바. 이 팀의 나머지 절반이 있는 곳이다.
 *
 * 어순은 영어와 같아 꾸밈말이 뒤에 온다.
 */
export const ro: SayPack = {
  order: 'head-first',
  join: ', ',
  phrases: {
    /*
      홈 화면이 도착하자마자 하는 말. 이 앱에서 **가장 많이 들리는 문장**이고, 언어를
      고를 때 미리 들려주는 것도 이것이다 — 고르는 자리에서 듣는 소리와 실제로 앱을
      열었을 때 나는 소리가 같아야 고른 것이 무엇인지 알 수 있다.
    */
    'home.intro': 'SnapCare. Fotografiați mâncarea sau medicamentul ca să îl verificați. Butonul verde mare din mijloc face poza.',
    /*
      판정 세 단계. 그림에는 없는 말이라 여기 둔다 — 그림은 "무엇이 들었나" 를
      말하고, 이 셋은 "그래서 어떻게 하라" 를 말한다. 문장을 짧게 두는 것이 규칙이다:
      되감기가 없는 매체에서 첫마디가 행동이어야 한다.
    */
    'verdict.avoid': 'Nu consumați.',
    'verdict.caution': 'Atenție.',
    'verdict.safe.eat': 'Se poate mânca.',
    'verdict.safe.drink': 'Se poate bea.',
    'allergen_peanut.yes': 'Conține arahide.',
    'allergen_peanut.no': 'Nu mâncați asta. Conține arahide.',
    'allergen_tree_nut.yes': 'Conține nuci.',
    'allergen_tree_nut.no': 'Nu mâncați asta. Conține nuci.',
    'allergen_milk.yes': 'Conține lapte.',
    'allergen_milk.no': 'Nu mâncați asta. Conține lapte.',
    'allergen_egg.yes': 'Conține ou.',
    'allergen_egg.no': 'Nu mâncați asta. Conține ou.',
    'allergen_shellfish.yes': 'Conține crustacee.',
    'allergen_shellfish.no': 'Nu mâncați asta. Conține crustacee.',
    'allergen_gluten.yes': 'Conține grâu.',
    'allergen_gluten.no': 'Nu mâncați asta. Conține grâu.',
    'allergen_soy.yes': 'Conține soia.',
    'allergen_soy.no': 'Nu mâncați asta. Conține soia.',
    'allergen_sesame.yes': 'Conține susan.',
    'allergen_sesame.no': 'Nu mâncați asta. Conține susan.',
    'food_sugar.yes': 'Conține mult zahăr.',
    'food_sugar.no': 'Prea mult zahăr pentru dumneavoastră.',
    'food_salt.yes': 'Conține multă sare.',
    'food_salt.no': 'Prea multă sare pentru dumneavoastră.',
    'food_oil.yes': 'Conține multă grăsime.',
    'food_oil.no': 'Prea multă grăsime pentru dumneavoastră.',
    'caffeine.yes': 'Conține cofeină.',
    'caffeine.no': 'Fără cofeină pentru dumneavoastră.',
    'no_alcohol.yes': 'Nu beți alcool cât timp luați acest medicament.',
    'warn_bleeding.yes': 'Acesta poate agrava sângerarea.',
    'state_pregnant.yes': 'Nu este sigur în timpul sarcinii.',
    'state_breastfeeding.yes': 'Nu este sigur în timpul alăptării.',

    'capsule_strip.yes': 'O capsulă.',
    'capsule_strip.no': 'Nu luați această capsulă.',
    'tablet_blister.yes': 'O tabletă.',
    'tablet_blister.no': 'Nu luați această tabletă.',
    'pill_bottle.yes': 'Acest medicament.',
    'pill_bottle.no': 'Nu luați acest medicament.',
    'liquid_bottle.yes': 'Medicamentul lichid.',
    'liquid_bottle.no': 'Nu luați acest medicament.',
    'dropper_bottle.yes': 'Picăturile.',
    'dropper_bottle.no': 'Nu folosiți aceste picături.',
    'cream_tube.yes': 'Crema.',
    'cream_tube.no': 'Nu folosiți această cremă.',
    'inhaler.yes': 'Inhalatorul.',
    'inhaler.no': 'Nu folosiți acest inhalator.',
    'syringe.yes': 'Injecția.',
    'syringe.no': 'Nu folosiți această injecție.',
    'sachet.yes': 'Pliculețul cu pulbere.',
    'sachet.no': 'Nu luați acest pliculeț.',
    'suppository.yes': 'Supozitorul.',
    'suppository.no': 'Nu folosiți acest supozitor.',

    'body_eye.yes': 'în ochi',
    'body_skin.yes': 'pe piele',
    'body_mouth.yes': 'în gură',
    'food_bowl.yes': 'cu mâncare',
    'food_empty_bowl.yes': 'pe stomacul gol',
    'time_morning.yes': 'dimineața',
    'time_morning.alone': 'Luați-l dimineața.',
    'time_noon.yes': 'la prânz',
    'time_noon.alone': 'Luați-l la prânz.',
    'time_evening.yes': 'seara',
    'time_evening.alone': 'Luați-l seara.',
    'time_night.yes': 'noaptea',
    'time_night.alone': 'Luați-l noaptea.',
    'storage_fridge.yes': 'țineți-l la frigider',
    'storage_dry.yes': 'țineți-l uscat, departe de căldură',
    'qty_one.yes': 'una de fiecare dată',
    'qty_two.yes': 'două de fiecare dată',
    'qty_three.yes': 'trei de fiecare dată',
    'qty_four.yes': 'patru de fiecare dată',
    'qty_five.yes': 'cinci de fiecare dată',
    'contact_lens.yes': 'lentile de contact',
    'contact_lens.no': 'Scoateți-vă mai întâi lentilele de contact.',
    'hand_wash.yes': 'Spălați-vă mai întâi pe mâini.',
    'shake_bottle.yes': 'Agitați bine flaconul înainte de utilizare.',
    'finish_course.yes': 'Terminați tot tratamentul, chiar dacă vă simțiți mai bine.',

    'cadence.twice_daily': 'de două ori pe zi',
    'cadence.three_times_daily': 'de trei ori pe zi',
    'cadence.four_times_daily': 'de patru ori pe zi',
    'missing': 'Nu avem o imagine pentru acesta.',
  },
};
