import type { Member } from '@/lib/snapcare/types';
import type { DailyReference } from './types';

/**
 * 개인별 하루 기준치 산출.
 *
 * 고정 표를 들고 있는 게 아니라 **WHO 권고를 계산으로 구현**한다.
 * WHO는 당·지방·포화지방을 "총 에너지의 몇 %"로 규정하므로,
 * 그 사람의 에너지 요구량만 정하면 나머지 상한이 전부 유도된다.
 * 새 연령대·조건이 추가돼도 계산식은 그대로다.
 *
 * 근거
 *  - 에너지: FAO/WHO/UNU (2004) Human energy requirements — 연령·성별 대표값
 *  - 유리당: WHO (2015) Guideline: sugars intake — 총 에너지의 10% 미만 (강력 권고)
 *  - 포화지방: WHO (2023) Saturated fatty acid intake — 총 에너지의 10% 미만
 *  - 총지방: WHO/FAO (2003) TRS 916 — 총 에너지의 15~30%
 *  - 소금: WHO (2012) Sodium intake — 성인 5g/일 미만, 소아는 에너지 요구량 비례 하향
 *  - 단백질: WHO/FAO/UNU (2007) Protein and amino acid requirements — safe intake 0.83 g/kg/일
 *  - 식이섬유: WHO/FAO (2003) TRS 916 — 성인 25g/일 이상
 */

/** 1g당 kcal (Atwater 계수) */
const KCAL_PER_G = { carb: 4, protein: 4, fat: 9 } as const;

const ADULT_SALT_LIMIT_G = 5;
const ADULT_FIBER_TARGET_G = 25;
const ADULT_ENERGY_KCAL = 2000;
const PROTEIN_G_PER_KG = 0.83;

interface Band {
  energyKcal: number;
  /** 단백질 기준 계산용 대표 체중(kg) */
  weightKg: number;
}

/**
 * 연령대별 대표 에너지·체중.
 * 성별·활동량까지 받으면 더 정밀해지지만, 이 앱은 타이핑 없는 UI가 전제라
 * 프로필에서 얻을 수 있는 최소 정보(나이)만으로 산출한다.
 */
function bandFor(ageYears: number | null): Band {
  if (ageYears === null) return { energyKcal: ADULT_ENERGY_KCAL, weightKg: 62 };
  if (ageYears <= 3) return { energyKcal: 1200, weightKg: 13 };
  if (ageYears <= 6) return { energyKcal: 1500, weightKg: 20 };
  if (ageYears <= 9) return { energyKcal: 1800, weightKg: 28 };
  if (ageYears <= 13) return { energyKcal: 2100, weightKg: 45 };
  if (ageYears <= 18) return { energyKcal: 2400, weightKg: 58 };
  if (ageYears <= 64) return { energyKcal: ADULT_ENERGY_KCAL, weightKg: 62 };
  return { energyKcal: 1800, weightKg: 60 };
}

/** 'Child · age 7', 'Teen · age 15' 같은 role 문자열에서 나이를 뽑는다. 없으면 null(성인). */
export function ageFromRole(role: string): number | null {
  const m = role.match(/(\d{1,3})/);
  if (!m) return null;
  const age = Number(m[1]);
  return Number.isFinite(age) && age > 0 && age < 120 ? age : null;
}

/** 나이대 → 대표 나이. 프로필에서 그림으로 고른 값이 있으면 문자열 파싱보다 우선한다. */
const BAND_AGE: Record<NonNullable<Member['ageBand']>, number> = {
  child: 7, teen: 15, adult: 35, senior: 70,
};

/** 구성원 → 하루 기준치. */
export function referenceFor(member: Member): DailyReference {
  const age = member.ageBand ? BAND_AGE[member.ageBand] : ageFromRole(member.role);
  const { energyKcal, weightKg } = bandFor(age);

  // WHO 백분율 권고를 g 으로 환산 — 이 유도가 엔진의 핵심이다.
  const sugarsLimit = (energyKcal * 0.10) / KCAL_PER_G.carb;
  const satFatLimit = (energyKcal * 0.10) / KCAL_PER_G.fat;
  const fatLimit = (energyKcal * 0.30) / KCAL_PER_G.fat;
  const fatTarget = (energyKcal * 0.15) / KCAL_PER_G.fat;
  const carbTarget = (energyKcal * 0.55) / KCAL_PER_G.carb;

  // 소금·식이섬유는 절대량 권고 → 에너지 요구량 비율로 소아 하향
  const energyRatio = energyKcal / ADULT_ENERGY_KCAL;
  const saltLimit = ADULT_SALT_LIMIT_G * Math.min(1, energyRatio);
  const fiberTarget = ADULT_FIBER_TARGET_G * Math.min(1, energyRatio);

  return {
    energyKcal,
    limits: {
      energy: energyKcal,
      sugars: round1(sugarsLimit),
      saturatedFat: round1(satFatLimit),
      fat: round1(fatLimit),
      salt: round1(saltLimit),
    },
    targets: {
      protein: round1(weightKg * PROTEIN_G_PER_KG),
      fiber: round1(fiberTarget),
      fat: round1(fatTarget),
      carbohydrates: round1(carbTarget),
    },
    basis:
      age === null
        ? 'WHO/FAO adult reference (2,000 kcal): free sugars <10% and saturated fat <10% of energy, salt <5 g, protein 0.83 g/kg.'
        : `WHO/FAO reference for age ${age} (${energyKcal} kcal): free sugars <10% and saturated fat <10% of energy, salt scaled to energy need.`,
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
