import { describe, expect, it } from "vitest";
import { emptyCloudDirtyState } from "./cloud-types";
import { inferDirtyFromDatabaseChange } from "./cloud-dirty-tracker";
import { createEmptyDatabase } from "../database.factory";

describe("cloud dirty assets", () => {
  it("starts with empty dirtyAssets", () => {
    expect(emptyCloudDirtyState().dirtyAssets).toEqual([]);
  });
});

describe("inferDirtyFromDatabaseChange", () => {
  it("marks classroom dirty when bannerAssetKey changes without metadata.updatedAt", () => {
    const prev = createEmptyDatabase({
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: { id: "t1", name: "Teacher", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    });
    const next = {
      ...prev,
      classroomSettings: { ...prev.classroomSettings, bannerAssetKey: "assets/banner.webp" },
    };

    expect(inferDirtyFromDatabaseChange(prev, next).classroom).toBe(true);
  });

  it("does not mark students dirty when the array reference is unchanged", () => {
    const prev = createEmptyDatabase({
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: { id: "t1", name: "Teacher", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    });
    const next = { ...prev };
    expect(inferDirtyFromDatabaseChange(prev, next).students).toBeUndefined();
  });

  it("marks students dirty when length or ids change", () => {
    const prev = createEmptyDatabase({
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: { id: "t1", name: "Teacher", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    });
    const next = {
      ...prev,
      students: [
        {
          id: "s1",
          name: "A",
          classroomRoleIds: [],
          badgeIds: [],
          points: 0,
          totalRewards: 0,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-02",
        },
      ],
    };
    expect(inferDirtyFromDatabaseChange(prev, next).students).toBe(true);
  });

  it("marks attendance dirty when attendanceRecords change", () => {
    const prev = createEmptyDatabase({
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: { id: "t1", name: "Teacher", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    });
    const next = {
      ...prev,
      attendanceRecords: [
        {
          id: "att1",
          date: "2026-03-10",
          entries: [],
          rosterStudentIds: [],
          createdAt: "2026-03-10T08:00:00.000Z",
          updatedAt: "2026-03-10T08:00:00.000Z",
        },
      ],
    };
    expect(inferDirtyFromDatabaseChange(prev, next).attendance).toBe(true);
  });

  it("marks catalog dirty when wheelStudentBag membership changes at same length", () => {
    const prev = createEmptyDatabase({
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: { id: "t1", name: "Teacher", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    });
    const withBag = { ...prev, wheelStudentBag: ["a", "b", "c"] };
    const swapped = { ...prev, wheelStudentBag: ["a", "c", "d"] };
    expect(inferDirtyFromDatabaseChange(withBag, swapped).catalog).toBe(true);
  });

  it("marks students dirty when a middle id changes without updatedAt bump", () => {
    const student = (id: string) => ({
      id,
      name: id,
      classroomRoleIds: [] as string[],
      badgeIds: [] as string[],
      points: 0,
      totalRewards: 0,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });
    const prev = createEmptyDatabase({
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: { id: "t1", name: "Teacher", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    });
    const base = { ...prev, students: [student("s1"), student("s2"), student("s3")] };
    const midSwap = { ...prev, students: [student("s1"), student("sX"), student("s3")] };
    expect(inferDirtyFromDatabaseChange(base, midSwap).students).toBe(true);
  });

  it("marks classroom dirty when teacher name changes without updatedAt bump", () => {
    const prev = createEmptyDatabase({
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: { id: "t1", name: "Teacher", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    });
    const next = {
      ...prev,
      classroomSettings: {
        ...prev.classroomSettings,
        teacher: { ...prev.classroomSettings.teacher, name: "Cô Lan" },
      },
    };
    expect(inferDirtyFromDatabaseChange(prev, next).classroom).toBe(true);
  });

  it("marks catalog dirty when a point action is toggled without updatedAt", () => {
    const prev = createEmptyDatabase({
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: { id: "t1", name: "Teacher", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    });
    const action = prev.pointActions[0];
    const next = {
      ...prev,
      pointActions: prev.pointActions.map((item) =>
        item.id === action.id ? { ...item, isActive: !item.isActive } : item,
      ),
    };
    expect(inferDirtyFromDatabaseChange(prev, next).catalog).toBe(true);
  });

  it("marks roles dirty when a classroom role name changes", () => {
    const prev = createEmptyDatabase({
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: { id: "t1", name: "Teacher", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    });
    const role = prev.classroomRoles[0];
    const next = {
      ...prev,
      classroomRoles: prev.classroomRoles.map((item) =>
        item.id === role.id ? { ...item, name: "Lớp trưởng mới" } : item,
      ),
    };
    expect(inferDirtyFromDatabaseChange(prev, next).roles).toBe(true);
  });

  it("marks students dirty when name changes without updatedAt bump", () => {
    const prev = createEmptyDatabase({
      className: "2/7",
      schoolYear: "2026-2027",
      teacher: { id: "t1", name: "Teacher", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    });
    const student = {
      id: "s1",
      name: "A",
      classroomRoleIds: [] as string[],
      badgeIds: [] as string[],
      points: 0,
      totalRewards: 0,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };
    const base = { ...prev, students: [student] };
    const renamed = {
      ...prev,
      students: [{ ...student, name: "B" }],
    };
    expect(inferDirtyFromDatabaseChange(base, renamed).students).toBe(true);
  });
});