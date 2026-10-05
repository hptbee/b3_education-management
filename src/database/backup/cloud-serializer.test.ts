import { describe, expect, it } from "vitest";
import { createEmptyDatabase } from "../database.factory";
import { toLocalDateKey } from "./local-date";
import {
  buildActivityLogsFromDatabase,
  mergeClassroomRegistries,
  mergeCloudFilesToClassroom,
  pathsForDomains,
  serializeCloudFilesForUpload,
  splitClassroomToCloudFiles,
} from "./cloud-serializer";

function makeDb(className = "2/7", schoolYear = "2026-2027") {
  const db = createEmptyDatabase({
    className,
    schoolYear,
    teacher: {
      id: "teacher-1",
      name: "Cô Thu",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
  return db;
}

describe("toLocalDateKey", () => {
  it("uses local calendar date not UTC slice", () => {
    const iso = "2026-03-15T23:30:00.000Z";
    const local = toLocalDateKey(iso);
    const utcSlice = iso.slice(0, 10);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (utcSlice !== local) {
      expect(local).not.toBe(utcSlice);
    }
  });
});

describe("cloud-serializer", () => {
  it("split maps ClassroomDatabase fields to domain files", () => {
    const db = makeDb("2-7", "2026-2027");
    db.students = [
      {
        id: "s1",
        name: "Alice",
        points: 10,
        classroomRoleIds: [],
        badgeIds: [],
        totalRewards: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    db.pointHistory = [
      {
        id: "ph1",
        studentId: "s1",
        actionId: "a1",
        actionName: "Good work",
        points: 5,
        source: "manual",
        createdAt: "2026-03-15T10:00:00.000Z",
      },
    ];

    const split = splitClassroomToCloudFiles(db);
    expect(split.paths).toContain("students.json");
    expect(split.paths).toContain("classroom.json");
    expect(split.paths).toContain("attendance.json");
    expect(split.paths).toContain("activity/index.json");

    const students = split.files["students.json"] as { students: typeof db.students };
    expect(students.students).toHaveLength(1);
    expect(students.students[0].points).toBe(10);

    const activities = buildActivityLogsFromDatabase(db);
    expect(activities).toHaveLength(1);
    expect(activities[0].metadata?.payload).toEqual(db.pointHistory[0]);
  });

  it("merge round-trips duck-race history from activity payloads", () => {
    const db = makeDb("2/7", "2026-2027");
    db.duckRaceHistory = [
      {
        id: "duck-1",
        winnerId: "s2",
        winnerIds: ["s2"],
        participantIds: ["s1", "s2"],
        createdAt: "2026-03-16T09:00:00.000Z",
      },
    ];

    const split = splitClassroomToCloudFiles(db);
    const uploads = serializeCloudFilesForUpload(split.files, split.paths);
    const fileMap: Record<string, string> = {};
    for (const u of uploads) fileMap[u.path] = u.content;

    const merged = mergeCloudFilesToClassroom(fileMap);
    expect(merged.duckRaceHistory).toHaveLength(1);
    expect(merged.duckRaceHistory[0].id).toBe("duck-1");
    expect(merged.duckRaceHistory[0].winnerId).toBe("s2");
  });

  it("merge round-trips split files to ClassroomDatabase", () => {
    const db = makeDb("3-1", "2026-2027");
    db.classroomSettings.className = "Class 3-1";
    db.rewards = [
      {
        id: "r1",
        name: "Sticker",
        requiredPoints: 5,
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    db.rewardHistory = [
      {
        id: "rh1",
        studentId: "s1",
        rewardId: "r1",
        rewardName: "Sticker",
        pointsSpent: 5,
        createdAt: "2026-03-16T08:00:00.000Z",
      },
    ];
    db.students = [
      {
        id: "s1",
        name: "Bob",
        points: 0,
        classroomRoleIds: [],
        badgeIds: [],
        totalRewards: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const split = splitClassroomToCloudFiles(db);
    const uploads = serializeCloudFilesForUpload(split.files, split.paths);
    const fileMap: Record<string, string> = {};
    for (const u of uploads) fileMap[u.path] = u.content;

    const merged = mergeCloudFilesToClassroom(fileMap);
    expect(merged.metadata.id).toBe(db.metadata.id);
    expect(merged.classroomSettings.className).toBe("Class 3-1");
    expect(merged.rewards).toHaveLength(1);
    expect(merged.rewardHistory).toHaveLength(1);
    expect(merged.rewardHistory[0].rewardName).toBe("Sticker");
  });

  it("pathsForDomains selects only dirty domains plus manifest", () => {
    const db = makeDb("1-1", "2026-2027");
    const split = splitClassroomToCloudFiles(db);
    const paths = pathsForDomains(["students", "settings"], split);
    expect(paths).toContain("students.json");
    expect(paths).toContain("settings.json");
    expect(paths).toContain("manifest.json");
    expect(paths).not.toContain("teams.json");
  });

  it("keeps wheelStudentBag and duckRaceStudentBag distinct in catalog split/merge", () => {
    const db = makeDb("2/7", "2026-2027");
    db.wheelStudentBag = ["wheel-a", "wheel-b"];
    db.duckRaceStudentBag = ["duck-x", "duck-y"];

    const split = splitClassroomToCloudFiles(db);
    const catalog = split.files["catalog.json"] as {
      wheelStudentBag: string[];
      duckRaceStudentBag: string[];
    };
    expect(catalog.wheelStudentBag).toEqual(["wheel-a", "wheel-b"]);
    expect(catalog.duckRaceStudentBag).toEqual(["duck-x", "duck-y"]);

    const uploads = serializeCloudFilesForUpload(split.files, split.paths);
    const fileMap: Record<string, string> = {};
    for (const u of uploads) fileMap[u.path] = u.content;

    const merged = mergeCloudFilesToClassroom(fileMap);
    expect(merged.wheelStudentBag).toEqual(["wheel-a", "wheel-b"]);
    expect(merged.duckRaceStudentBag).toEqual(["duck-x", "duck-y"]);
  });

  it("defaults duckRaceStudentBag to [] when catalog omits the field", () => {
    const db = makeDb("2/7", "2026-2027");
    db.wheelStudentBag = ["wheel-only"];
    const split = splitClassroomToCloudFiles(db);
    const uploads = serializeCloudFilesForUpload(split.files, split.paths);
    const fileMap: Record<string, string> = {};
    for (const u of uploads) fileMap[u.path] = u.content;

    const catalog = JSON.parse(fileMap["catalog.json"]) as Record<string, unknown>;
    delete catalog.duckRaceStudentBag;
    fileMap["catalog.json"] = JSON.stringify(catalog);

    const merged = mergeCloudFilesToClassroom(fileMap);
    expect(merged.wheelStudentBag).toEqual(["wheel-only"]);
    expect(merged.duckRaceStudentBag).toEqual([]);
  });
});

describe("mergeClassroomRegistries", () => {
  const entryA = {
    key: "a",
    name: "Lớp A",
    schoolYear: "2026-2027",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const entryB = {
    key: "b",
    name: "Lớp B",
    schoolYear: "2026-2027",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    archived: false,
  };

  it("unions keys from local and remote", () => {
    const merged = mergeClassroomRegistries(
      { version: 1, updatedAt: "2026-01-01", classrooms: [entryA] },
      { version: 1, updatedAt: "2026-01-01", classrooms: [entryB] },
    );
    expect(merged.classrooms.map((c) => c.key).sort()).toEqual(["a", "b"]);
  });

  it("uses higher updatedAt for same key", () => {
    const local = {
      version: 1,
      updatedAt: "2026-01-01",
      classrooms: [{ ...entryA, name: "Local A", updatedAt: "2026-01-05T00:00:00.000Z" }],
    };
    const remote = {
      version: 1,
      updatedAt: "2026-01-01",
      classrooms: [{ ...entryA, name: "Remote A", updatedAt: "2026-01-04T00:00:00.000Z" }],
    };
    const merged = mergeClassroomRegistries(local, remote);
    expect(merged.classrooms[0].name).toBe("Local A");
  });

  it("drops permanently deleted entries", () => {
    const merged = mergeClassroomRegistries(
      {
        version: 1,
        updatedAt: "2026-01-01",
        classrooms: [
          {
            ...entryA,
            deletedAt: "2026-01-10T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      },
      { version: 1, updatedAt: "2026-01-01", classrooms: [entryB] },
    );
    expect(merged.classrooms.map((c) => c.key)).toEqual(["b"]);
  });

  it("allows empty visible list when all entries are permanently deleted", () => {
    const merged = mergeClassroomRegistries(
      {
        version: 1,
        updatedAt: "2026-01-01",
        classrooms: [
          {
            ...entryA,
            deletedAt: "2026-01-10T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      },
      { version: 1, updatedAt: "2026-01-01", classrooms: [] },
    );
    expect(merged.classrooms).toEqual([]);
  });

  it("keeps remote A/B/C when local registry is empty", () => {
    const remote = {
      version: 1 as const,
      updatedAt: "2026-01-01",
      classrooms: [entryA, entryB, { ...entryA, key: "c", name: "Lớp C" }],
    };
    const merged = mergeClassroomRegistries(
      { version: 1, updatedAt: "2026-01-01", classrooms: [] },
      remote,
    );
    expect(merged.classrooms.map((c) => c.key).sort()).toEqual(["a", "b", "c"]);
  });

  it("merges local A with remote A/B/C into A/B/C", () => {
    const local = {
      version: 1 as const,
      updatedAt: "2026-01-01",
      classrooms: [entryA],
    };
    const remote = {
      version: 1 as const,
      updatedAt: "2026-01-01",
      classrooms: [entryA, entryB, { ...entryA, key: "c", name: "Lớp C" }],
    };
    const merged = mergeClassroomRegistries(local, remote);
    expect(merged.classrooms.map((c) => c.key).sort()).toEqual(["a", "b", "c"]);
  });

  it("merges local-only D with remote A/B/C into A/B/C/D", () => {
    const entryD = {
      key: "d",
      name: "Lớp D",
      schoolYear: "2026-2027",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-04T00:00:00.000Z",
      archived: false,
    };
    const merged = mergeClassroomRegistries(
      { version: 1, updatedAt: "2026-01-01", classrooms: [entryD] },
      {
        version: 1,
        updatedAt: "2026-01-01",
        classrooms: [entryA, entryB, { ...entryA, key: "c", name: "Lớp C" }],
      },
    );
    expect(merged.classrooms.map((c) => c.key).sort()).toEqual(["a", "b", "c", "d"]);
  });
});
