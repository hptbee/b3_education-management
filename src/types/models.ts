export interface ClassroomRole {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  createdAt: string;
}

export interface Badge {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  createdAt: string;
}

export interface TeacherProfile {
  id: string;
  name: string;
  /** @deprecated Inline data URL — use avatarAssetKey */
  avatar?: string;
  avatarAssetKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomSettings {
  id: string;
  className: string;
  /** @deprecated Inline data URL — use classAvatarAssetKey */
  classAvatar?: string;
  classAvatarAssetKey?: string;
  /** @deprecated Inline data URL — use bannerAssetKey */
  homeBannerImage?: string;
  bannerAssetKey?: string;
  teacher: TeacherProfile;
  schoolYear: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParentInfo {
  fullName?: string;
  phoneNumber?: string;
}

export interface Student {
  id: string;
  name: string;
  /** @deprecated Inline data URL — use avatarAssetKey */
  avatar?: string;
  avatarAssetKey?: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other" | "unknown";
  hometown?: string;
  address?: string;
  previousClass?: string;
  previousAchievements?: string;
  /** @deprecated Use classroomRoleIds instead */
  classroomRole?: string;
  classroomRoleIds: string[];
  badgeIds: string[];
  potentialNote?: string;
  teamId?: string;
  parent?: ParentInfo;
  points: number;
  totalRewards: number;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  name: string;
  avatar?: string;
  score: number;
  leaderStudentId?: string;
  viceLeaderStudentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PointAction {
  id: string;
  name: string;
  points: number;
  type: "reward" | "penalty";
  icon?: string;
  isActive: boolean;
}

export type PointHistorySource = "action" | "game" | "reward-redemption" | "manual" | "recognition";

export interface PointHistory {
  id: string;
  studentId: string;
  actionId?: string;
  actionName: string;
  points: number;
  source: PointHistorySource;
  createdAt: string;
  note?: string;
}

/** Gift in the classroom gift cabinet (persisted as `rewards` in JSON). */
export interface Gift {
  id: string;
  name: string;
  imagePath?: string;
  description?: string;
  /** Points required to redeem (integer &gt; 0). */
  requiredPoints: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Alias kept for the persisted `rewards` collection name and legacy imports. */
export type Reward = Gift;

export interface RewardHistory {
  id: string;
  studentId: string;
  rewardId?: string;
  rewardName: string;
  pointsSpent: number;
  createdAt: string;
}

export interface TeamScoreHistory {
  id: string;
  teamId: string;
  points: number;
  actionName: string;
  createdAt: string;
  note?: string;
}

export interface RecognitionTitle {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  /** Optional linked badge from Kho huy hiệu — awarded when students are recognized with this title */
  badgeId?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Recognition {
  id: string;
  studentId: string;
  type: string;
  title: string;
  titleId?: string;
  titleIcon?: string;
  studentName?: string;
  teamId?: string;
  message?: string;
  awardedPoints?: number;
  pointHistoryId?: string;
  awardedBadgeId?: string;
  createdAt: string;
}

export interface LuckyWheelSelection {
  id: string;
  studentId: string;
  /** All students picked in this spin (multi-select). Legacy rows may omit this. */
  studentIds?: string[];
  createdAt: string;
}

export interface DuckRaceResult {
  id: string;
  winnerId: string;
  /** Future multi-winner support; v1 is always `[winnerId]`. */
  winnerIds?: string[];
  participantIds: string[];
  createdAt: string;
}

export interface BadgeAwardHistory {
  id: string;
  badgeId: string;
  badgeName: string;
  badgeIcon?: string;
  studentIds: string[];
  note?: string;
  createdAt: string;
}

export type AttendanceAbsenceStatus = "excused" | "unexcused" | "late";

export interface AttendanceEntry {
  studentId: string;
  status: AttendanceAbsenceStatus;
  /** Lý do nghỉ / ghi chú ngắn */
  note?: string;
}

/** Một bản ghi cho mỗi ngày đã điểm danh. */
export interface AttendanceRecord {
  id: string;
  /** Khóa ngày local `YYYY-MM-DD` — duy nhất trong một lớp */
  date: string;
  /** Chỉ chứa học sinh KHÔNG có mặt; phần còn lại của roster là có mặt */
  entries: AttendanceEntry[];
  /** Danh sách HS tại thời điểm điểm danh — để HS vào lớp sau không bị tính vào ngày cũ */
  rosterStudentIds: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  soundEnabled: boolean;
  animationsEnabled: boolean;
  /** Opt-in automatic upload to Cloudflare Worker when URL + token are configured. */
  cloudBackupEnabled: boolean;
}

export type LuckyWheelMode = "student" | "team" | "reward" | "activity";

export interface PointsWheelSegment {
  id: string;
  value: number;
  enabled: boolean;
  /** Reserved for future weighted spins. */
  weight?: number;
}

export type DeskType = "individual" | "pair" | "group";
export type BoardPosition = "front" | "back" | "left" | "right";

export interface SeatAssignment {
  seatId: string;
  studentIds: string[];
}

export interface SeatingChartConfig {
  version: 1;
  groups: number;
  rows: number;
  columnsPerGroup: number;
  groupGap: number;
  deskType: DeskType;
  boardPosition: BoardPosition;
  seats: SeatAssignment[];
}

export interface AppData {
  classroomSettings: ClassroomSettings;
  classroomRoles: ClassroomRole[];
  badges: Badge[];
  students: Student[];
  teams: Team[];
  teamScoreHistory: TeamScoreHistory[];
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
  /** Prevent-repeat pool for Đua vịt — separate from Lucky Wheel. */
  duckRaceStudentBag: string[];
  /** Configurable point values for Vòng quay điểm. */
  pointsWheelConfig: PointsWheelSegment[];
  /** Prevent-repeat pool for Vòng quay điểm — separate from Lucky Wheel. */
  pointsWheelStudentBag: string[];
  /** Classroom seating chart layout and assignments. */
  seatingChartConfig: SeatingChartConfig;
  appSettings: AppSettings;
}
