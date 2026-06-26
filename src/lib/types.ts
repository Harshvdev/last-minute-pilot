// Shared domain types for Last Minute Pilot

export type GoalType = 'one_time' | 'habit';
export type GoalStatus = 'active' | 'completed' | 'abandoned';
export type GoalCategory =
  | 'work'
  | 'study'
  | 'personal'
  | 'health'
  | 'project'
  | 'other';

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
export type ScheduleStatus =
  | 'planned'
  | 'active'
  | 'completed'
  | 'missed';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface GoalWithRelations {
  id: string;
  title: string;
  goalType: GoalType;
  deadline: string | null;
  status: GoalStatus;
  rawInput: string | null;
  category: GoalCategory | null;
  createdAt: string;
  updatedAt: string;
  tasks: TaskRow[];
  availability: AvailabilityRow[];
  riskAssessments: RiskAssessmentRow[];
}

export interface TaskRow {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  priorityScore: number;
  dependsOnId: string | null;
  status: TaskStatus;
  orderIndex: number;
  scheduleBlocks: ScheduleBlockRow[];
  progressLogs: ProgressLogRow[];
}

export interface AvailabilityRow {
  id: string;
  goalId: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  specificDate: string | null;
}

export interface ScheduleBlockRow {
  id: string;
  taskId: string;
  startAt: string;
  endAt: string;
  status: ScheduleStatus;
}

export interface ProgressLogRow {
  id: string;
  taskId: string;
  loggedAt: string;
  percentComplete: number;
  note: string | null;
}

export interface RiskAssessmentRow {
  id: string;
  goalId: string;
  assessedAt: string;
  riskLevel: RiskLevel;
  reason: string | null;
  suggestedAction: string | null;
  remainingWork: number;
  remainingTime: number;
}

// AI breakdown output — validated with Zod before DB write
export interface TaskDraft {
  title: string;
  description?: string;
  estimatedMinutes: number;
  dependsOn?: number; // index of another draft in the same batch
}

export interface GoalBreakdown {
  tasks: TaskDraft[];
  rationale?: string;
}

export interface GoalClarificationQuestion {
  id: string;
  text: string;
  options?: string[] | null;
}

export interface GoalClarificationResponse {
  questionId: string;
  answer?: string | null;
  skipped?: boolean;
}

export interface GoalAIResult {
  confidence: 'high' | 'low';
  question?: GoalClarificationQuestion | null;
  tasks?: TaskDraft[] | null;
  assumptions?: string[] | null;
  rationale?: string | null;
}
