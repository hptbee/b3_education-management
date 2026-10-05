import type { ClassroomRole, Student, Team } from "../types/models";
import type { ClassroomDatabase } from "../database/types";
import { normalizeBadgesOnDatabase } from "./badges";
import { normalizeGiftsOnDatabase } from "./gifts";
import { normalizeRecognitionTitlesOnDatabase } from "./recognitionTitles";
import { normalizePointsWheelConfig } from "./pointsWheelConfig";
import { DEFAULT_SEATING_CHART_CONFIG, normalizeSeatingChartConfig } from "./seatingChart";
import { createId } from "./id";
import { isDataImageUrl } from "./images";

export const DEFAULT_CLASSROOM_ROLE_SEEDS: Array<Pick<ClassroomRole, "name" | "icon">> = [
  { name: "Lớp trưởng", icon: "👑" },
  { name: "Lớp phó học tập", icon: "📚" },
  { name: "Lớp phó lao động", icon: "🧹" },
];

export function createDefaultClassroomRoles(): ClassroomRole[] {
  const now = new Date().toISOString();
  return DEFAULT_CLASSROOM_ROLE_SEEDS.map((seed) => ({
    id: createId("classroom-role"),
    name: seed.name,
    icon: seed.icon,
    createdAt: now,
  }));
}

export function getStudentClassroomRoles(student: Student, roles: ClassroomRole[]): ClassroomRole[] {
  const ids = student.classroomRoleIds ?? [];
  return ids
    .map((id) => roles.find((role) => role.id === id))
    .filter((role): role is ClassroomRole => Boolean(role));
}

export function sanitizeTeamLeadership(team: Team, memberIds: Set<string>): Team {
  const leaderStudentId =
    team.leaderStudentId && memberIds.has(team.leaderStudentId) ? team.leaderStudentId : undefined;
  let viceLeaderStudentId =
    team.viceLeaderStudentId && memberIds.has(team.viceLeaderStudentId)
      ? team.viceLeaderStudentId
      : undefined;

  if (leaderStudentId && viceLeaderStudentId === leaderStudentId) {
    viceLeaderStudentId = undefined;
  }

  if (
    team.leaderStudentId === leaderStudentId &&
    team.viceLeaderStudentId === viceLeaderStudentId
  ) {
    return team;
  }

  return {
    ...team,
    leaderStudentId,
    viceLeaderStudentId,
    updatedAt: new Date().toISOString(),
  };
}

export function sanitizeAllTeamLeadership(teams: Team[], students: Student[]): Team[] {
  return teams.map((team) => {
    const memberIds = new Set(students.filter((s) => s.teamId === team.id).map((s) => s.id));
    return sanitizeTeamLeadership(team, memberIds);
  });
}

export function clearStudentLeadershipFromTeams(teams: Team[], studentId: string): Team[] {
  const now = new Date().toISOString();
  return teams.map((team) => {
    const clearsLeader = team.leaderStudentId === studentId;
    const clearsVice = team.viceLeaderStudentId === studentId;
    if (!clearsLeader && !clearsVice) return team;
    return {
      ...team,
      leaderStudentId: clearsLeader ? undefined : team.leaderStudentId,
      viceLeaderStudentId: clearsVice ? undefined : team.viceLeaderStudentId,
      updatedAt: now,
    };
  });
}

function migrateLegacyClassroomRole(student: Student, roles: ClassroomRole[]): string[] {
  const existing = student.classroomRoleIds ?? [];
  if (existing.length > 0 || !student.classroomRole?.trim()) {
    return existing;
  }

  const legacyName = student.classroomRole.trim();
  const matched = roles.find((role) => role.name === legacyName);
  return matched ? [matched.id] : existing;
}

export function normalizeClassroomDatabase(db: ClassroomDatabase): ClassroomDatabase {
  const classroomRoles =
    db.classroomRoles && db.classroomRoles.length > 0 ? db.classroomRoles : createDefaultClassroomRoles();

  const students = (db.students ?? []).map((student) => ({
    ...student,
    classroomRoleIds: migrateLegacyClassroomRole(student, classroomRoles),
    avatar: isDataImageUrl(student.avatar) ? undefined : student.avatar,
  }));

  const teams = sanitizeAllTeamLeadership(db.teams ?? [], students);

  const classroomSettings = {
    ...db.classroomSettings,
    classAvatar: isDataImageUrl(db.classroomSettings.classAvatar)
      ? undefined
      : db.classroomSettings.classAvatar,
    homeBannerImage: isDataImageUrl(db.classroomSettings.homeBannerImage)
      ? undefined
      : db.classroomSettings.homeBannerImage,
    teacher: db.classroomSettings.teacher
      ? {
          ...db.classroomSettings.teacher,
          avatar: isDataImageUrl(db.classroomSettings.teacher.avatar)
            ? undefined
            : db.classroomSettings.teacher.avatar,
        }
      : db.classroomSettings.teacher,
  };

  return normalizeRecognitionTitlesOnDatabase(
    normalizeBadgesOnDatabase(
      normalizeGiftsOnDatabase({
        ...db,
        metadata: {
          ...db.metadata,
          archived: db.metadata.archived ?? false,
        },
        classroomSettings,
        classroomRoles,
        students,
        teams,
        recognitions: db.recognitions ?? [],
        luckyWheelHistory: db.luckyWheelHistory ?? [],
        duckRaceHistory: db.duckRaceHistory ?? [],
        badgeAwardHistory: db.badgeAwardHistory ?? [],
        attendanceRecords: db.attendanceRecords ?? [],
        wheelStudentBag: db.wheelStudentBag ?? [],
        duckRaceStudentBag: db.duckRaceStudentBag ?? [],
        pointsWheelConfig: normalizePointsWheelConfig(db.pointsWheelConfig),
        pointsWheelStudentBag: db.pointsWheelStudentBag ?? [],
        seatingChartConfig: normalizeSeatingChartConfig(
          db.seatingChartConfig ?? DEFAULT_SEATING_CHART_CONFIG,
          new Set(students.map((student) => student.id)),
        ),
        appSettings: {
          soundEnabled: db.appSettings?.soundEnabled ?? true,
          animationsEnabled: db.appSettings?.animationsEnabled ?? true,
          cloudBackupEnabled: db.appSettings?.cloudBackupEnabled ?? false,
        },
      }),
    ),
  );
}
