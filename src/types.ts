export type Slot = 'morning' | 'evening';
export const SLOTS: Slot[] = ['morning', 'evening'];

/** Minutes a member reports for a session. */
export type Minutes = 60 | 45 | 30 | 15;
/** Session lengths a member can report, longest first. */
export const MINUTES: Minutes[] = [60, 45, 30, 15];

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
  /** First practice day tracked in this chat. */
  startDate: string;
  /** Last practice day whose results are final. */
  lastClosedDate: string;
  progressMessageId?: number;
  /** Group achievements: id → date. */
  awards?: Record<string, string>;
  /** Closed days in a row without a single missed day in the group. */
  noLossRun?: number;
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

  // Counters behind the achievements. Runs count consecutive qualifying days; a paused day
  // without practice freezes them, any other day that doesn't qualify resets them.
  /** Days with both sessions of 60 minutes. */
  fullHourRun: number;
  /** Days with at least one 60-minute session. */
  hourRun: number;
  /** Days with both sessions of any length. */
  bothRun: number;
  /** Days with a 30/60-minute morning session checked in before 07:00. */
  gongRun: number;
  /** Check-in times (minutes from the day start) of the current run of 30/60-minute mornings, last 14. */
  morningTimes: number[];
  /** Days whose first session was checked in before the reminder. */
  noReminderRun: number;
  /** Sessions done on paused days. */
  pausedSessions: number;
  /** Evening sessions checked in after midnight. */
  owlCount: number;
  /** Sessions that replaced a "didn't practice" vote. */
  rescuedCount: number;
  /** Longest streak that has already broken. */
  brokenBest: number;
}

/** A granted title or achievement. */
export interface AwardRecord {
  /** Day the condition was met. */
  date: string;
  /** Granted today and may still be taken back if the vote changes; final after day close. */
  pending?: boolean;
  /** Congratulation message, to edit or delete it on revocation. */
  messageId?: number;
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
  /** Highest title level (1-based); absent before the first title. */
  title?: number;
  /** Titles (`title:N`) and achievements; kept out of the recomputable aggregates. */
  awards?: Record<string, AwardRecord>;
  /** Last day the bot removed the member for missed days. */
  removedOn?: string;
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
  /** The slot was once voted "didn't practice". */
  wasSkipped?: boolean;
}

export type JobName = 'leaderboard' | 'summary' | 'morning' | 'evening' | 'reminder';

export interface PollRef {
  messageId: number;
  pollId: string;
}

export interface DayDoc {
  polls?: Partial<Record<Slot, PollRef>>;
  jobsDone?: Partial<Record<JobName, boolean>>;
  /** Snapshot taken at day close, used to recompute stats from scratch. */
  statuses?: Record<string, DayStatus>;
  /** Titles and achievements of the day, shown in the next morning's leaderboard. */
  awardLines?: string[];
}

export interface PollDoc {
  chatId: number;
  date: string;
  slot: Slot;
  /** Option index → minutes; null means "didn't practice". */
  optionMinutes: (Minutes | null)[];
}
