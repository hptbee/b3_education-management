import { describe, expect, it, vi } from "vitest";
import {
  buildRedeemGiftUpdate,
  normalizeGift,
  normalizeGiftsOnDatabase,
  migrateLegacyGiftImages,
} from "./gifts";
import { DEFAULT_POINTS_WHEEL_SEGMENTS } from "./pointsWheelConfig";
import { normalizeSeatingChartConfig } from "./seatingChart";
import type { Gift, Student } from "../types/models";
import type { ClassroomDatabase } from "../database/types";

vi.mock("../database/assets/classroom-asset.service", () => ({
  classroomAssetService: {
    saveGiftImageFromDataUrl: vi.fn(),
  },
}));

import { classroomAssetService } from "../database/assets/classroom-asset.service";

function minimalDb(rewards: ClassroomDatabase["rewards"], students: Student[] = []): ClassroomDatabase {
  return {
    metadata: {
      id: "test-class",
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    classroomSettings: {
      id: "test-class",
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: {
        id: "teacher-1",
        name: "Teacher",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    students,
    teams: [],
    pointActions: [],
    pointHistory: [],
    rewards,
    rewardHistory: [],
    recognitions: [],
    teamScoreHistory: [],
    classroomRoles: [],
    badges: [],
    recognitionTitles: [],
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
  };
}

const baseGift: Gift = {
  id: "gift-1",
  name: "Sticker",
  requiredPoints: 10,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const baseStudent: Student = {
  id: "student-1",
  name: "An",
  gender: "female",
  classroomRoleIds: [],
  badgeIds: [],
  points: 20,
  totalRewards: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("gifts normalization", () => {
  it("preserves requiredPoints and strips legacy image field", () => {
    const gift = normalizeGift({
      id: "gift-1",
      name: "  Sticker  ",
      description: "  Cute  ",
      requiredPoints: 15,
      image: "data:image/png;base64,abc",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(gift.name).toBe("Sticker");
    expect(gift.description).toBe("Cute");
    expect(gift.requiredPoints).toBe(15);
    expect("image" in gift).toBe(false);
  });

  it("defaults requiredPoints to 1 when missing", () => {
    const gift = normalizeGift({
      id: "gift-1",
      name: "Quà",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    expect(gift.requiredPoints).toBe(1);
  });

  it("normalizes rewards array on database load", () => {
    const db = normalizeGiftsOnDatabase(
      minimalDb([
        {
          id: "gift-1",
          name: "Quà",
          requiredPoints: 10,
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    );

    expect(db.rewards[0].name).toBe("Quà");
    expect(db.rewards[0].requiredPoints).toBe(10);
  });

  it("keeps legacy data-URL image when migration save fails", async () => {
    vi.mocked(classroomAssetService.saveGiftImageFromDataUrl).mockRejectedValueOnce(
      new Error("disk full"),
    );

    const db = minimalDb([
      {
        id: "gift-1",
        name: "Quà",
        image: "data:image/png;base64,abc",
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      } as never,
    ]);

    const { database, didMigrate } = await migrateLegacyGiftImages(db);

    expect(didMigrate).toBe(false);
    expect(database.rewards[0].imagePath).toBeUndefined();
    expect(database.rewards[0].name).toBe("Quà");
  });
});

describe("buildRedeemGiftUpdate", () => {
  it("redeems successfully and writes dual history", () => {
    const db = minimalDb([baseGift], [baseStudent]);
    const result = buildRedeemGiftUpdate(db, "student-1", "gift-1");
    expect("next" in result).toBe(true);
    if (!("next" in result)) return;

    expect(result.next.students[0].points).toBe(10);
    expect(result.next.students[0].totalRewards).toBe(1);
    expect(result.next.rewardHistory.length).toBe(1);
    expect(result.next.rewardHistory[0].pointsSpent).toBe(10);
    expect(result.next.pointHistory[0].points).toBe(-10);
    expect(result.next.pointHistory[0].source).toBe("reward-redemption");
  });

  it("blocks insufficient points", () => {
    const db = minimalDb([baseGift], [{ ...baseStudent, points: 5 }]);
    const result = buildRedeemGiftUpdate(db, "student-1", "gift-1");
    expect(result).toEqual({ error: "insufficient-points" });
  });

  it("blocks inactive gift", () => {
    const db = minimalDb([{ ...baseGift, isActive: false }], [baseStudent]);
    const result = buildRedeemGiftUpdate(db, "student-1", "gift-1");
    expect(result).toEqual({ error: "inactive" });
  });

  it("returns not-found for missing student or gift", () => {
    const db = minimalDb([baseGift], [baseStudent]);
    expect(buildRedeemGiftUpdate(db, "missing-student", "gift-1")).toEqual({ error: "not-found" });
    expect(buildRedeemGiftUpdate(db, "student-1", "missing-gift")).toEqual({ error: "not-found" });
  });

  it("redeems when points exactly equal requiredPoints (ends at zero)", () => {
    const exactGift: Gift = { ...baseGift, requiredPoints: 20 };
    const exactStudent: Student = { ...baseStudent, points: 20 };
    const db = minimalDb([exactGift], [exactStudent]);
    const result = buildRedeemGiftUpdate(db, "student-1", "gift-1");
    expect("next" in result).toBe(true);
    if (!("next" in result)) return;

    expect(result.next.students[0].points).toBe(0);
    expect(result.next.students[0].totalRewards).toBe(1);
    expect(result.next.rewardHistory[0].pointsSpent).toBe(20);
    expect(result.next.pointHistory[0].points).toBe(-20);
  });
});
