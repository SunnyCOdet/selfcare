export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  body_goal: string | null;
  inspiration: string | null;
  gym_days_per_week: number | null;
  activities: Activity[];
  skin_type: string | null;
  skin_concerns: string | null;
  wake_time: string | null;
  sleep_time: string | null;
  diet_preference: string | null;
  occupation_schedule: string | null;
  extra: Record<string, unknown>;
};

export type Activity = {
  name: string;
  proficiency: string;
  frequency?: string;
};

export type IntakeAnswer = {
  id?: string;
  category: string;
  question: string;
  answer: string;
};

export type Exercise = {
  name: string;
  sets: string;
  reps: string;
  notes?: string;
};

export type WorkoutDay = {
  day: string;
  focus: string;
  exercises: Exercise[];
};

export type Meal = {
  time: string;
  name: string;
  items: string[];
  notes?: string;
};

export type SkincareStep = {
  step: string;
  product_type: string;
  notes?: string;
};

export type ScheduleBlock = {
  time: string;
  activity: string;
  details?: string;
};

export type TransformationPlan = {
  summary: string;
  goal_analysis: string;
  timeline_weeks: number;
  steps_target: number;
  weekly_schedule: {
    day: string;
    blocks: ScheduleBlock[];
  }[];
  workout_plan: {
    gym_days_per_week: number;
    split_name: string;
    days: WorkoutDay[];
    cardio_guidance: string;
  };
  nutrition: {
    daily_calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    water_liters: number;
    meals: Meal[];
    guidelines: string[];
  };
  skincare: {
    morning: SkincareStep[];
    evening: SkincareStep[];
    weekly: string[];
    guidance: string[];
  };
  grooming: string[];
  sleep: {
    target_hours: number;
    wind_down: string[];
  };
  activities: {
    name: string;
    frequency: string;
    progression: string;
  }[];
  daily_non_negotiables: string[];
  weekly_milestones: string[];
  model_prep: string[];
};

export type DailyCheckin = {
  id?: string;
  user_id?: string;
  checkin_date: string;
  steps: number;
  workout_done: boolean;
  skincare_am: boolean;
  skincare_pm: boolean;
  water_liters: number;
  sleep_hours: number | null;
  mood: string | null;
  weight_kg: number | null;
  tasks: Record<string, boolean>;
  completion_pct: number;
  notes: string | null;
};

export type Streak = {
  current_streak: number;
  longest_streak: number;
  total_checkins: number;
  last_checkin_date: string | null;
};

export type AiQuestion = {
  id: string;
  question: string;
  category: string;
  input_type: "text" | "choice" | "number";
  options?: string[];
  done?: boolean;
};
