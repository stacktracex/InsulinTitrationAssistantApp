
import { InitialDoseResult, DailyRecord, TitrationConfig } from '../types';

export const DEFAULT_CONFIG: TitrationConfig = {
  tddFactor: 0.5,
  basalRatio: 0.5,
  basalRules: {
    fbgHighPlus6: 10,
    fbgMedPlus4: 8,
    fbgLowPlus2: 7,
    fbgSafeMin: 4.4,
    fbgSafeMax: 6.9,
    basalDecr: 2,
  },
  prandialRules: {
    bgHighPlus4: 10,
    bgMedPlus2: 7.9,
    bgSafeMin: 4.4,
    bgSafeMax: 7.8,
    prandialDecr: 2,
  }
};

export const calculateInitialDose = (weight: number, config: TitrationConfig = DEFAULT_CONFIG): InitialDoseResult => {
  const tdd = weight * config.tddFactor;
  const basal = tdd * config.basalRatio;
  const eachPrandial = (tdd - basal) / 3;

  return {
    weight,
    totalDose: Math.round(tdd),
    basalDose: Math.round(basal),
    breakfastDose: Math.round(eachPrandial),
    lunchDose: Math.round(eachPrandial),
    dinnerDose: Math.round(eachPrandial),
  };
};

export const getSuggestedDose = (record: Partial<DailyRecord>, config: TitrationConfig = DEFAULT_CONFIG): { basal: number, breakfast: number, lunch: number, dinner: number } => {
  const { fbg, preLunchBG, preDinnerBG, bedtimeBG, curBasal, curBreakfast, curLunch, curDinner } = record;

  const titrateBasal = (bg: number = 0, current: number = 0) => {
    if (bg <= 0) return current;
    const r = config.basalRules;
    if (bg > r.fbgHighPlus6) return current + 6;
    if (bg >= r.fbgMedPlus4) return current + 4;
    if (bg >= r.fbgLowPlus2) return current + 2;
    if (bg < r.fbgSafeMin) return Math.max(0, current - r.basalDecr);
    return current;
  };

  const titratePrandial = (bg: number = 0, current: number = 0) => {
    if (bg <= 0) return current;
    const r = config.prandialRules;
    if (bg > r.bgHighPlus4) return current + 4;
    if (bg >= r.bgMedPlus2) return current + 2;
    if (bg < r.bgSafeMin) return Math.max(0, current - r.prandialDecr);
    return current;
  };

  return {
    basal: titrateBasal(fbg, curBasal),              // 空腹 -> 基础
    breakfast: titratePrandial(preLunchBG, curBreakfast), // 午餐前 -> 早餐前
    lunch: titratePrandial(preDinnerBG, curLunch),    // 晚餐前 -> 午餐前
    dinner: titratePrandial(bedtimeBG, curDinner),     // 睡前 -> 晚餐前
  };
};
