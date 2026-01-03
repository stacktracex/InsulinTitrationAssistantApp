
export interface UserProfile {
  name: string;
  phone: string; // 唯一标识
  weight: number;
  createdAt: string;
}

export interface InitialDoseResult {
  weight: number;
  totalDose: number;
  basalDose: number;
  breakfastDose: number;
  lunchDose: number;
  dinnerDose: number;
}

export interface TitrationConfig {
  tddFactor: number;
  basalRatio: number;
  basalRules: {
    fbgHighPlus6: number;
    fbgMedPlus4: number;
    fbgLowPlus2: number;
    fbgSafeMin: number;
    fbgSafeMax: number;
    basalDecr: number;
  };
  prandialRules: {
    bgHighPlus4: number;
    bgMedPlus2: number;
    bgSafeMin: number;
    bgSafeMax: number;
    prandialDecr: number;
  };
}

export interface DailyRecord {
  id: string;
  userPhone: string; // 关联用户
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
  users: UserProfile[];
  history: DailyRecord[];
  config: TitrationConfig;
  activeUserPhone: string | null;
}
