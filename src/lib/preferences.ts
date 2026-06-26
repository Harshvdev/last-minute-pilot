// User preferences store. Persisted to localStorage via Zustand's persist
// middleware. No auth required (sandbox adaptation).
//
// These preferences are read by the UI (default category on new-goal form,
// default work hours when seeding availability, theme preference) and by the
// scheduler (default daily work windows for goals without explicit availability).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';
export type DefaultCategory =
  | 'work'
  | 'study'
  | 'personal'
  | 'health'
  | 'project'
  | 'other';

export interface DefaultWorkWindow {
  dayOfWeek: number; // 0-6
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  enabled: boolean;
}

interface PreferencesState {
  theme: ThemePreference;
  defaultCategory: DefaultCategory;
  // Default daily work windows — used when creating a goal without explicit
  // availability. One entry per weekday.
  workWindows: DefaultWorkWindow[];
  // Whether to auto-run AI breakdown on new goal creation.
  autoBreakdown: boolean;
  // Whether to show the pace projection card on the dashboard.
  showPaceProjection: boolean;
  // Whether to show the weekly timeline on the schedule page.
  showWeeklyTimeline: boolean;
  // First day of week for the timeline (0=Sun, 1=Mon).
  firstDayOfWeek: 0 | 1;
  // Compress schedule blocks to fit (vs. one-per-task).
  compactSchedule: boolean;

  setTheme: (t: ThemePreference) => void;
  setDefaultCategory: (c: DefaultCategory) => void;
  setWorkWindow: (idx: number, patch: Partial<DefaultWorkWindow>) => void;
  toggleWorkWindow: (idx: number) => void;
  setAutoBreakdown: (v: boolean) => void;
  setShowPaceProjection: (v: boolean) => void;
  setShowWeeklyTimeline: (v: boolean) => void;
  setFirstDayOfWeek: (d: 0 | 1) => void;
  setCompactSchedule: (v: boolean) => void;
  resetToDefaults: () => void;
}

const DEFAULT_WORK_WINDOWS: DefaultWorkWindow[] = [
  { dayOfWeek: 0, startTime: '10:00', endTime: '12:00', enabled: false }, // Sun
  { dayOfWeek: 1, startTime: '18:00', endTime: '21:00', enabled: true }, // Mon
  { dayOfWeek: 2, startTime: '18:00', endTime: '21:00', enabled: true }, // Tue
  { dayOfWeek: 3, startTime: '18:00', endTime: '21:00', enabled: true }, // Wed
  { dayOfWeek: 4, startTime: '18:00', endTime: '21:00', enabled: true }, // Thu
  { dayOfWeek: 5, startTime: '18:00', endTime: '21:00', enabled: true }, // Fri
  { dayOfWeek: 6, startTime: '09:00', endTime: '17:00', enabled: true }, // Sat
];

const DEFAULTS = {
  theme: 'system' as ThemePreference,
  defaultCategory: 'project' as DefaultCategory,
  workWindows: DEFAULT_WORK_WINDOWS,
  autoBreakdown: true,
  showPaceProjection: true,
  showWeeklyTimeline: true,
  firstDayOfWeek: 0 as const,
  compactSchedule: false,
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setTheme: (theme) => set({ theme }),
      setDefaultCategory: (defaultCategory) => set({ defaultCategory }),
      setWorkWindow: (idx, patch) =>
        set((s) => ({
          workWindows: s.workWindows.map((w, i) =>
            i === idx ? { ...w, ...patch } : w
          ),
        })),
      toggleWorkWindow: (idx) =>
        set((s) => ({
          workWindows: s.workWindows.map((w, i) =>
            i === idx ? { ...w, enabled: !w.enabled } : w
          ),
        })),
      setAutoBreakdown: (autoBreakdown) => set({ autoBreakdown }),
      setShowPaceProjection: (showPaceProjection) => set({ showPaceProjection }),
      setShowWeeklyTimeline: (showWeeklyTimeline) => set({ showWeeklyTimeline }),
      setFirstDayOfWeek: (firstDayOfWeek) => set({ firstDayOfWeek }),
      setCompactSchedule: (compactSchedule) => set({ compactSchedule }),
      resetToDefaults: () => set({ ...DEFAULTS, workWindows: DEFAULT_WORK_WINDOWS }),
    }),
    {
      name: 'lmp-preferences',
      version: 1,
    }
  )
);
