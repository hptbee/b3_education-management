import { createId } from "../utils/id";
import { defaultData } from "../store/defaultData";
import { createDefaultBadges } from "../utils/badges";
import { createDefaultClassroomRoles } from "../utils/classroomRoles";
import { createDefaultRecognitionTitles } from "../utils/recognitionTitles";
import { DEFAULT_POINTS_WHEEL_SEGMENTS } from "../utils/pointsWheelConfig";
import { normalizeSeatingChartConfig } from "../utils/seatingChart";
import type { ClassroomDatabase } from "./types";
import type { ClassroomSettings } from "../types/models";

export const DATABASE_VERSION = 1;

export function createEmptyDatabase(
  settings: Omit<ClassroomSettings, "id" | "createdAt" | "updatedAt">
): ClassroomDatabase {
  const now = new Date().toISOString();
  const id = createId("classroom");

  const classroom: ClassroomSettings = {
    ...settings,
    id,
    createdAt: now,
    updatedAt: now,
  };

  return {
    metadata: {
      id,
      version: DATABASE_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    classroomSettings: classroom,
    classroomRoles: createDefaultClassroomRoles(),
    badges: createDefaultBadges(),
    students: [],
    teams: [],
    pointActions: defaultData.pointActions,
    pointHistory: [],
    rewards: [],
    rewardHistory: [],
    recognitionTitles: createDefaultRecognitionTitles(),
    recognitions: [],
    luckyWheelHistory: [],
    duckRaceHistory: [],
    badgeAwardHistory: [],
    attendanceRecords: [],
    wheelStudentBag: [],
    duckRaceStudentBag: [],
    pointsWheelConfig: DEFAULT_POINTS_WHEEL_SEGMENTS.map((segment) => ({ ...segment })),
    pointsWheelStudentBag: [],
    seatingChartConfig: normalizeSeatingChartConfig(undefined),
    teamScoreHistory: [],
    appSettings: {
      soundEnabled: true,
      animationsEnabled: true,
      cloudBackupEnabled: false,
    },
  };
}
