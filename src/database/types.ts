import type {
  AppSettings,
  AttendanceRecord,
  Badge,
  BadgeAwardHistory,
  ClassroomRole,
  ClassroomSettings,
  DuckRaceResult,
  LuckyWheelSelection,
  PointAction,
  PointHistory,
  PointsWheelSegment,
  Recognition,
  RecognitionTitle,
  Reward,
  RewardHistory,
  SeatingChartConfig,
  Student,
  Team,
  TeamScoreHistory,
} from "../types/models";

export interface DatabaseMetadata {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** When true, hidden from active lists and sidebar switcher until restored. */
  archived?: boolean;
  /** Local placeholder from cloud registry — full data not downloaded yet. */
  cloudStub?: boolean;
  /** Google account `userId` that owns this classroom for cloud backup. */
  ownerUserId?: string;
}

export interface ClassroomDatabase {
  metadata: DatabaseMetadata;
  classroomSettings: ClassroomSettings;
  classroomRoles: ClassroomRole[];
  badges: Badge[];
  students: Student[];
  teams: Team[];
  pointActions: PointAction[];
  pointHistory: PointHistory[];
  rewards: Reward[];
  rewardHistory: RewardHistory[];
  recognitionTitles: RecognitionTitle[];
  recognitions: Recognition[];
  luckyWheelHistory: LuckyWheelSelection[];
  duckRaceHistory: DuckRaceResult[];
  badgeAwardHistory: BadgeAwardHistory[];
  attendanceRecords: AttendanceRecord[];
  wheelStudentBag: string[];
  duckRaceStudentBag: string[];
  pointsWheelConfig: PointsWheelSegment[];
  pointsWheelStudentBag: string[];
  seatingChartConfig: SeatingChartConfig;
  teamScoreHistory: TeamScoreHistory[];
  appSettings: AppSettings;
}

export interface DatabaseSummary {
  id: string;
  className: string;
  schoolYear: string;
  teacherName: string;
  studentCount: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  /** False when only registry metadata exists locally (cloud stub). */
  hydrated?: boolean;
  ownerUserId?: string;
}
