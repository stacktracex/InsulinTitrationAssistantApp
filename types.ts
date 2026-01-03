
export interface InitialDoseResult {
  weight: number;
  totalDose: number;
  basalDose: number;
  breakfastDose: number;
  lunchDose: number;
  dinnerDose: number;
}

export interface TitrationConfig {
  tddFactor: number;        // 初始剂量系数 (U/kg)
  basalRatio: number;      // 基础占比 (0.5 = 50%)
  
  // 基础胰岛素规则 (空腹)
  basalRules: {
    fbgHighPlus6: number;   // > 10
    fbgMedPlus4: number;    // 8-10
    fbgLowPlus2: number;    // 7-7.9
    fbgSafeMin: number;     // 4.4
    fbgSafeMax: number;     // 6.9
    basalDecr: number;      // -2u
  };
  
  // 餐时胰岛素规则 (下一餐前/睡前)
  prandialRules: {
    bgHighPlus4: number;    // > 10
    bgMedPlus2: number;     // 7.9-10
    bgSafeMin: number;      // 4.4
    bgSafeMax: number;      // 7.8
    prandialDecr: number;   // -2u
  };
}

export interface DailyRecord {
  id: string;
  date: string;
  fbg: number;          
  preLunchBG: number;   
  preDinnerBG: number;  
  bedtimeBG: number;    
  curBasal: number;     
  curBreakfast: number; 
  curLunch: number;     
  curDinner: number;    
  sugBasal: number;
  sugBreakfast: number;
  sugLunch: number;
  sugDinner: number;
}

export interface AppState {
  profile: InitialDoseResult | null;
  history: DailyRecord[];
  config: TitrationConfig;
}
