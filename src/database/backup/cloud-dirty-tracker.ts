import type { CloudDirtyState } from "./cloud-types";
import { toLocalDateKey } from "./local-date";
import { emptyCloudDirtyState } from "./cloud-types";

export class CloudDirtyTracker {
  private readonly byClassroom = new Map<string, CloudDirtyState>();

  get(classroomKey: string): CloudDirtyState {
    if (!this.byClassroom.has(classroomKey)) {
      this.byClassroom.set(classroomKey, emptyCloudDirtyState());
    }
    return this.byClassroom.get(classroomKey)!;
  }

  hasDirty(classroomKey: string): boolean {
    const dirty = this.get(classroomKey);
    return (
      dirty.classroom ||
      dirty.students ||
      dirty.teams ||
      dirty.roles ||
      dirty.recognitions ||
      dirty.rewards ||
      dirty.settings ||
      dirty.catalog ||
      (dirty.attendance ?? false) ||
      dirty.activityIndex ||
      dirty.activityDates.length > 0 ||
      dirty.registry ||
      dirty.dirtyAssets.length > 0
    );
  }

  mark(classroomKey: string, patch: Partial<Omit<CloudDirtyState, "activityDates" | "dirtyAssets"> & { dirtyAssets?: string[] }>): void {
    const current = this.get(classroomKey);
    this.byClassroom.set(classroomKey, {
      ...current,
      ...patch,
      activityDates: current.activityDates,
      dirtyAssets: patch.dirtyAssets ?? current.dirtyAssets,
    });
  }

  markActivityDates(classroomKey: string, dates: string[]): void {
    const current = this.get(classroomKey);
    const merged = new Set(current.activityDates);
    for (const date of dates) merged.add(date);
    this.byClassroom.set(classroomKey, {
      ...current,
      activityIndex: true,
      activityDates: [...merged],
    });
  }

  markAll(classroomKey: string, activityDates: string[] = []): void {
    this.byClassroom.set(classroomKey, {
      classroom: true,
      students: true,
      teams: true,
      roles: true,
      recognitions: true,
      rewards: true,
      settings: true,
      catalog: true,
      attendance: true,
      activityIndex: true,
      activityDates: [...activityDates],
      registry: true,
      dirtyAssets: [],
    });
  }

  clear(classroomKey: string): void {
    this.byClassroom.set(classroomKey, emptyCloudDirtyState());
  }

  clearClassroom(classroomKey: string): void {
    this.byClassroom.delete(classroomKey);
  }
}

export const cloudDirtyTracker = new CloudDirtyTracker();

function itemChangeToken(item: unknown): string {
  if (item === null || item === undefined) return "";
  if (typeof item !== "object") return String(item);
  const record = item as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  if (typeof record.updatedAt === "string") {
    const mutable: Record<string, unknown> = { ...record };
    delete mutable.id;
    delete mutable.updatedAt;
    delete mutable.createdAt;
    return `${id}\0${record.updatedAt}\0${nestedObjectFingerprint(mutable)}`;
  }
  return `${id}\0${nestedObjectFingerprint(record)}`;
}

function entityFingerprint(items: unknown[] | undefined): string {
  if (!items || items.length === 0) return "0";

  const allPrimitive = items.every(
    (item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean",
  );
  if (allPrimitive) {
    return `p:${items.length}|${[...items].map(String).sort().join("\0")}`;
  }

  const tokens = items.map(itemChangeToken).sort();
  return `e:${items.length}|${tokens.join("\0")}`;
}

function nestedObjectFingerprint(value: Record<string, unknown>): string {
  return Object.keys(value)
    .sort()
    .map((key) => {
      const entry = value[key];
      if (entry === null || entry === undefined) return `${key}=`;
      if (typeof entry !== "object") return `${key}=${String(entry)}`;
      return `${key}:[${nestedObjectFingerprint(entry as Record<string, unknown>)}]`;
    })
    .join(",");
}

function settingsFingerprint(value: unknown): string {
  if (!value || typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return keys
    .map((key) => {
      const entry = record[key];
      if (entry === null || entry === undefined) return `${key}=`;
      if (typeof entry === "object") {
        return `${key}:{${nestedObjectFingerprint(entry as Record<string, unknown>)}}`;
      }
      return `${key}=${String(entry)}`;
    })
    .join(";");
}

function arrayChanged(prev: unknown[] | undefined, next: unknown[]): boolean {
  if (prev === next) return false;
  return entityFingerprint(prev) !== entityFingerprint(next);
}

export function inferDirtyFromDatabaseChange(
  prev: { metadata?: { updatedAt?: string }; students?: unknown[] } | null,
  next: {
    metadata: { id: string; updatedAt: string };
    classroomSettings: unknown;
    students: unknown[];
    teams: unknown[];
    classroomRoles: unknown[];
    recognitions: unknown[];
    rewards: unknown[];
    appSettings: unknown;
    badges: unknown[];
    pointActions: unknown[];
    recognitionTitles: unknown[];
    wheelStudentBag: unknown[];
    duckRaceStudentBag: unknown[];
    pointsWheelConfig: unknown[];
    pointsWheelStudentBag: unknown[];
    seatingChartConfig: unknown;
    pointHistory: unknown[];
    rewardHistory: unknown[];
    teamScoreHistory: unknown[];
    luckyWheelHistory: unknown[];
    duckRaceHistory: unknown[];
    badgeAwardHistory: unknown[];
    attendanceRecords: unknown[];
  },
): Partial<CloudDirtyState> {
  const patch: Partial<CloudDirtyState> = {};

  const prevClassroom = prev as typeof next | null;
  if (
    !prevClassroom ||
    prevClassroom.metadata?.updatedAt !== next.metadata.updatedAt ||
    settingsFingerprint(prevClassroom.classroomSettings) !== settingsFingerprint(next.classroomSettings)
  ) {
    patch.classroom = true;
  }

  if (!prev || prev.metadata?.updatedAt !== next.metadata.updatedAt) {
    patch.registry = true;
  }

  if (!prev || arrayChanged(prev.students, next.students)) {
    patch.students = true;
  }

  if (!prev || arrayChanged((prev as typeof next).teams, next.teams)) {
    patch.teams = true;
  }

  if (!prev || arrayChanged((prev as typeof next).classroomRoles, next.classroomRoles)) {
    patch.roles = true;
  }

  if (!prev || arrayChanged((prev as typeof next).recognitions, next.recognitions)) {
    patch.recognitions = true;
  }

  if (!prev || arrayChanged((prev as typeof next).rewards, next.rewards)) {
    patch.rewards = true;
  }

  if (
    !prev ||
    settingsFingerprint((prev as typeof next).appSettings) !== settingsFingerprint(next.appSettings)
  ) {
    patch.settings = true;
  }

  const catalogChanged =
    !prev ||
    arrayChanged((prev as typeof next).badges, next.badges) ||
    arrayChanged((prev as typeof next).pointActions, next.pointActions) ||
    arrayChanged((prev as typeof next).recognitionTitles, next.recognitionTitles) ||
    arrayChanged((prev as typeof next).wheelStudentBag, next.wheelStudentBag) ||
    arrayChanged((prev as typeof next).duckRaceStudentBag, next.duckRaceStudentBag) ||
    arrayChanged((prev as typeof next).pointsWheelConfig, next.pointsWheelConfig) ||
    arrayChanged((prev as typeof next).pointsWheelStudentBag, next.pointsWheelStudentBag) ||
    settingsFingerprint((prev as typeof next).seatingChartConfig) !==
      settingsFingerprint(next.seatingChartConfig);

  if (catalogChanged) {
    patch.catalog = true;
  }

  const historyChanged =
    !prev ||
    arrayChanged((prev as typeof next).pointHistory, next.pointHistory) ||
    arrayChanged((prev as typeof next).rewardHistory, next.rewardHistory) ||
    arrayChanged((prev as typeof next).teamScoreHistory, next.teamScoreHistory) ||
    arrayChanged((prev as typeof next).luckyWheelHistory, next.luckyWheelHistory) ||
    arrayChanged((prev as typeof next).duckRaceHistory, next.duckRaceHistory) ||
    arrayChanged((prev as typeof next).badgeAwardHistory, next.badgeAwardHistory);

  if (historyChanged) {
    patch.activityIndex = true;
  }

  if (!prev || arrayChanged((prev as typeof next).attendanceRecords, next.attendanceRecords)) {
    patch.attendance = true;
  }

  return patch;
}

export function activityDatesFromHistoryChange(
  prev: {
    pointHistory?: Array<{ id: string; createdAt: string }>;
    rewardHistory?: Array<{ id: string; createdAt: string }>;
    teamScoreHistory?: Array<{ id: string; createdAt: string }>;
    luckyWheelHistory?: Array<{ id: string; createdAt: string }>;
    duckRaceHistory?: Array<{ id: string; createdAt: string }>;
    badgeAwardHistory?: Array<{ id: string; createdAt: string }>;
  } | null,
  next: {
    pointHistory: Array<{ id: string; createdAt: string }>;
    rewardHistory: Array<{ id: string; createdAt: string }>;
    teamScoreHistory: Array<{ id: string; createdAt: string }>;
    luckyWheelHistory: Array<{ id: string; createdAt: string }>;
    duckRaceHistory: Array<{ id: string; createdAt: string }>;
    badgeAwardHistory: Array<{ id: string; createdAt: string }>;
  },
): string[] {
  const dates = new Set<string>();
  const collect = (entries: Array<{ createdAt: string }>) => {
    for (const entry of entries) {
      dates.add(toLocalDateKey(entry.createdAt));
    }
  };

  if (!prev) {
    collect(next.pointHistory);
    collect(next.rewardHistory);
    collect(next.teamScoreHistory);
    collect(next.luckyWheelHistory);
    collect(next.duckRaceHistory);
    collect(next.badgeAwardHistory);
    return [...dates];
  }

  const prevIds = new Set<string>();
  const addNew = (entries: Array<{ id: string; createdAt: string }>, prevEntries: Array<{ id: string; createdAt: string }>) => {
    const prevMap = new Map(prevEntries.map((e) => [e.id, e.createdAt]));
    for (const entry of entries) {
      if (!prevMap.has(entry.id) || prevMap.get(entry.id) !== entry.createdAt) {
        dates.add(toLocalDateKey(entry.createdAt));
      }
      prevIds.add(entry.id);
    }
  };

  addNew(next.pointHistory, prev.pointHistory ?? []);
  addNew(next.rewardHistory, prev.rewardHistory ?? []);
  addNew(next.teamScoreHistory, prev.teamScoreHistory ?? []);
  addNew(next.luckyWheelHistory, prev.luckyWheelHistory ?? []);
  addNew(next.duckRaceHistory, prev.duckRaceHistory ?? []);
  addNew(next.badgeAwardHistory, prev.badgeAwardHistory ?? []);

  const collectRemovedDates = (
    prevEntries: Array<{ id: string; createdAt: string }>,
    nextEntries: Array<{ id: string; createdAt: string }>,
  ) => {
    const nextIds = new Set(nextEntries.map((entry) => entry.id));
    for (const entry of prevEntries) {
      if (!nextIds.has(entry.id)) {
        dates.add(toLocalDateKey(entry.createdAt));
      }
    }
  };

  collectRemovedDates(prev.pointHistory ?? [], next.pointHistory);
  collectRemovedDates(prev.rewardHistory ?? [], next.rewardHistory);
  collectRemovedDates(prev.teamScoreHistory ?? [], next.teamScoreHistory);
  collectRemovedDates(prev.luckyWheelHistory ?? [], next.luckyWheelHistory);
  collectRemovedDates(prev.duckRaceHistory ?? [], next.duckRaceHistory);
  collectRemovedDates(prev.badgeAwardHistory ?? [], next.badgeAwardHistory);

  return [...dates];
}
