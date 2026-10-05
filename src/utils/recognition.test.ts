import { describe, expect, it, vi, afterEach } from "vitest";
import type { ClassroomDatabase } from "../database/types";
import type { Badge, Recognition, RecognitionTitle, Student } from "../types/models";
import { DEFAULT_POINTS_WHEEL_SEGMENTS } from "./pointsWheelConfig";
import { normalizeSeatingChartConfig } from "./seatingChart";
import {
  buildRecognizeStudentsUpdate,
  dedupeRecognitionsByStudent,
  ensureBadgeForTitle,
  filterRecognitionsByTime,
  formatRecognitionRelativeDate,
  getRecognitionTimeRange,
  resolveBadgeIdForTitle,
} from "./recognition";

vi.mock("./id", () => ({
  createId: (prefix: string) => `${prefix}-fixed`,
}));

function minimalDb(overrides?: Partial<ClassroomDatabase>): ClassroomDatabase {
  const title: RecognitionTitle = {
    id: "title-1",
    name: "Ngôi sao",
    icon: "🌟",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const student: Student = {
    id: "student-1",
    name: "An",
    classroomRoleIds: [],
    badgeIds: [],
    points: 5,
    totalRewards: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return {
    metadata: { id: "test-class", version: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    classroomSettings: {
      id: "cs-1",
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: {
        id: "t1",
        name: "Teacher",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    students: [student],
    teams: [],
    pointActions: [],
    pointHistory: [],
    rewards: [],
    rewardHistory: [],
    recognitions: [],
    teamScoreHistory: [],
    classroomRoles: [],
    badges: [],
    recognitionTitles: [title],
    luckyWheelHistory: [],
    duckRaceHistory: [],
    badgeAwardHistory: [],
    attendanceRecords: [],
    wheelStudentBag: [],
    duckRaceStudentBag: [],
    pointsWheelConfig: DEFAULT_POINTS_WHEEL_SEGMENTS.map((s) => ({ ...s })),
    pointsWheelStudentBag: [],
    seatingChartConfig: normalizeSeatingChartConfig(undefined),
    appSettings: { soundEnabled: true, animationsEnabled: true, cloudBackupEnabled: false },
    ...overrides,
  };
}

describe("getRecognitionTimeRange", () => {
  it("returns null start for all filter", () => {
    const { start } = getRecognitionTimeRange("all");
    expect(start).toBeNull();
  });
});

describe("filterRecognitionsByTime", () => {
  it("filters recognitions within today", () => {
    const now = new Date().toISOString();
    const recs: Recognition[] = [
      { id: "r1", studentId: "s1", type: "T", title: "T", createdAt: now },
      { id: "r2", studentId: "s1", type: "T", title: "T", createdAt: "2020-01-01T00:00:00.000Z" },
    ];
    const filtered = filterRecognitionsByTime(recs, "today");
    expect(filtered.length).toBe(1);
  });
});

describe("formatRecognitionRelativeDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Hôm nay for today", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(formatRecognitionRelativeDate("2026-06-15T08:00:00.000Z")).toBe("Hôm nay");
  });
});

describe("resolveBadgeIdForTitle", () => {
  it("returns badge id when linked badge exists", () => {
    expect(resolveBadgeIdForTitle({ badgeId: "b1" }, [{ id: "b1" }])).toBe("b1");
  });

  it("returns undefined when badge missing", () => {
    expect(resolveBadgeIdForTitle({ badgeId: "missing" }, [{ id: "b1" }])).toBeUndefined();
  });
});

describe("ensureBadgeForTitle", () => {
  it("creates new badge when none linked", () => {
    const title: RecognitionTitle = {
      id: "t1",
      name: "Mới",
      isActive: true,
      createdAt: "2026-01-01",
    };
    const result = ensureBadgeForTitle(title, []);
    expect(result.badges.length).toBe(1);
    expect(result.title.badgeId).toBe("badge-fixed");
  });

  it("links by name when linkByName is true", () => {
    const badge: Badge = { id: "b1", name: "Mới", createdAt: "2026-01-01" };
    const title: RecognitionTitle = {
      id: "t1",
      name: "Mới",
      isActive: true,
      createdAt: "2026-01-01",
    };
    const result = ensureBadgeForTitle(title, [badge], { linkByName: true });
    expect(result.title.badgeId).toBe("b1");
  });
});

describe("buildRecognizeStudentsUpdate", () => {
  it("returns null for unknown title", () => {
    expect(buildRecognizeStudentsUpdate(minimalDb(), { studentIds: ["student-1"], titleId: "x" })).toBeNull();
  });

  it("awards points and badge", () => {
    const badge: Badge = { id: "badge-1", name: "Ngôi sao", createdAt: "2026-01-01" };
    const db = minimalDb({
      badges: [badge],
      recognitionTitles: [
        {
          id: "title-1",
          name: "Ngôi sao",
          badgeId: "badge-1",
          isActive: true,
          createdAt: "2026-01-01",
        },
      ],
    });
    const result = buildRecognizeStudentsUpdate(db, {
      studentIds: ["student-1"],
      titleId: "title-1",
      awardedPoints: 3,
      message: "Hay",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.next.students[0].points).toBe(8);
    expect(result.next.students[0].badgeIds).toContain("badge-1");
    expect(result.created.length).toBe(1);
    expect(result.next.pointHistory[0].source).toBe("recognition");
  });
});

describe("dedupeRecognitionsByStudent", () => {
  it("keeps first recognition per student", () => {
    const recs: Recognition[] = [
      { id: "r1", studentId: "s1", type: "T", title: "A", createdAt: "2026-01-02" },
      { id: "r2", studentId: "s1", type: "T", title: "B", createdAt: "2026-01-03" },
    ];
    expect(dedupeRecognitionsByStudent(recs).length).toBe(1);
  });
});
