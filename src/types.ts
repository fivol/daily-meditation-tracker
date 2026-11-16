export type Slot = 'morning' | 'evening';
export const SLOTS: Slot[] = ['morning', 'evening'];

/** Minutes a member reports for a session. */
export type Minutes = 60 | 30 | 15;

export interface Schedule {
  /** Local "HH:mm" times within the practice day. */
  morning: string;
  evening: string;
  reminder: string;
}

export interface ChatSettings {
  timezone: string;
  /** Local hour at which a practice day ends (and the next one starts). */
  dayBoundaryHour: number;
  schedule: Schedule;
  /** Consecutive missed days after which a member is removed. */
  missLimit: number;
  maxPauseDays: number;
  /** Members with fewer active days are listed as newcomers, unranked. */
  newcomerDays: number;
  /** First practice day tracked in this chat. */
  startDate: string;
  /** Last practice day whose results are final. */
  lastClosedDate: string;
  progressMessageId?: number;
}

export type MemberStatus = 'active' | 'paused' | 'removed';

/** How a member took part in one closed day. */
export type DayStatus = 'active' | 'paused' | 'absent';

/** One closed day in a member's recent history (compact, kept for the last 30 days). */
export interface DayEntry {
  date: string;
  status: DayStatus;
  /** Sessions done that day: 0, 1 or 2. */
  sessions: number;
  minutes: number;
}

/** Aggregates over all closed days; always recomputable from check-ins and day snapshots. */
export interface MemberStats {
  activeDays: number;
  sessions: number;
  morningSessions: number;
  eveningSessions: number;
  minutes: number;
  practicedDays: number;
  fullDays: number;
  currentStreak: number;
  bestStreak: number;
  missedInRow: number;
  lastPracticeDate: string | null;
  /** Last 30 closed calendar days, oldest first. */
  recent: DayEntry[];
}

export interface Member extends MemberStats {
  userId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  joinedDate: string;
  status: MemberStatus;
  pauseUntil?: string;
  pauseReason?: string;
}

export type CheckinStatus = 'done' | 'skipped' | 'revoked';

export interface Checkin {
  userId: number;
  date: string;
  slot: Slot;
  status: CheckinStatus;
  minutes: Minutes | null;
  firstAt: string;
  updatedAt: string;
  source: 'poll' | 'admin';
}

export type JobName = 'morning' | 'evening' | 'reminder' | 'close';

export interface PollRef {
  messageId: number;
  pollId: string;
}

export interface DayDoc {
  polls?: Partial<Record<Slot, PollRef>>;
  jobsDone?: Partial<Record<JobName, boolean>>;
  /** Snapshot taken at day close, used to recompute stats from scratch. */
  statuses?: Record<string, DayStatus>;
  milestones?: string[];
}

export interface PollDoc {
  chatId: number;
  date: string;
  slot: Slot;
  /** Option index → minutes; null means "didn't practice". */
  optionMinutes: (Minutes | null)[];
}
