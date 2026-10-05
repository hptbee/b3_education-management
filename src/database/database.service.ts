import type { ClassroomDatabase, DatabaseSummary } from "./types";
import type { ClassroomDatabaseStorage } from "./storage/storage.interface";
import { IndexedDbClassroomStorage } from "./storage/indexed-db.storage";
import { createEmptyDatabase, DATABASE_VERSION } from "./database.factory";
import { assertSafeClassroomId, generateExportFilename } from "./database.utils";
import { createId } from "../utils/id";
import { normalizeClassroomDatabase } from "../utils/classroomRoles";
import { migrateLegacyClassroomImages } from "../utils/classroom-images";
import { classroomAssetService } from "./assets/classroom-asset.service";
import type { ClassroomSettings } from "../types/models";
import { isTauri } from "./tauri-fs.service";
import { assertImportFileSize } from "./importLimits";
import { getLastClassroomId, setLastClassroomId, clearLastClassroomId } from "../utils/lastClassroom";
import { isCloudBackupConfigured } from "./backup/cloud-backup-auth";
import {
  lastAuthUserService,
  resolveCurrentUserId,
  shouldIncludeInAccountBackup,
} from "./backup/classroom-owner";
import type { CloudClassroomRegistryEntry } from "./backup/cloud-types";
import { restoreCloudAssetsLocally, applyAssetKeysFromRestoredPaths } from "./backup/cloud-asset-sync";
import { logCloudTrace } from "../logging/app-log";

function assertEntityArray(
  record: Record<string, unknown>,
  field: string,
  requireId = true,
): void {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(`Định dạng file không hợp lệ: thiếu hoặc sai kiểu mảng "${field}".`);
  }
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Định dạng file không hợp lệ: phần tử ${i + 1} trong "${field}" không phải object.`);
    }
    if (requireId) {
      const id = (item as Record<string, unknown>).id;
      if (typeof id !== "string" || !id.trim()) {
        throw new Error(`Định dạng file không hợp lệ: phần tử ${i + 1} trong "${field}" thiếu id.`);
      }
    }
  }
}

function assertImportShape(data: unknown): asserts data is ClassroomDatabase {
  if (!data || typeof data !== "object") {
    throw new Error("Định dạng file không hợp lệ: dữ liệu trống hoặc không phải JSON object.");
  }

  const record = data as Record<string, unknown>;
  const metadata = record.metadata as Record<string, unknown> | undefined;
  const settings = record.classroomSettings as Record<string, unknown> | undefined;

  if (!metadata?.id || typeof metadata.id !== "string") {
    throw new Error("Định dạng file không hợp lệ: thiếu metadata.id.");
  }
  assertSafeClassroomId(metadata.id);
  if (typeof metadata.version !== "number") {
    throw new Error("Định dạng file không hợp lệ: metadata.version phải là số.");
  }
  if (metadata.version > DATABASE_VERSION) {
    throw new Error(`Định dạng file không hợp lệ: phiên bản ${metadata.version} chưa được hỗ trợ.`);
  }
  if (!settings?.className || typeof settings.className !== "string") {
    throw new Error("Định dạng file không hợp lệ: thiếu thông tin lớp học.");
  }

  const idArrays = [
    "students",
    "teams",
    "pointActions",
    "rewards",
    "recognitions",
    "classroomRoles",
    "badges",
    "recognitionTitles",
  ] as const;

  for (const field of idArrays) {
    assertEntityArray(record, field, true);
  }

  const historyArrays = [
    "pointHistory",
    "rewardHistory",
    "teamScoreHistory",
    "badgeAwardHistory",
    "luckyWheelHistory",
  ] as const;

  for (const field of historyArrays) {
    assertEntityArray(record, field, true);
  }

  const duckRaceHistory = record.duckRaceHistory;
  if (duckRaceHistory !== undefined && duckRaceHistory !== null) {
    assertEntityArray(record, "duckRaceHistory", true);
  }

  const attendanceRecords = record.attendanceRecords;
  if (attendanceRecords !== undefined && attendanceRecords !== null) {
    assertEntityArray(record, "attendanceRecords", true);
  }

  const wheelBag = record.wheelStudentBag;
  if (!Array.isArray(wheelBag)) {
    throw new Error('Định dạng file không hợp lệ: thiếu hoặc sai kiểu mảng "wheelStudentBag".');
  }
  for (let i = 0; i < wheelBag.length; i++) {
    if (typeof wheelBag[i] !== "string") {
      throw new Error(`Định dạng file không hợp lệ: wheelStudentBag[${i}] phải là chuỗi.`);
    }
  }

  const duckRaceBag = record.duckRaceStudentBag;
  if (duckRaceBag !== undefined && duckRaceBag !== null) {
    if (!Array.isArray(duckRaceBag)) {
      throw new Error('Định dạng file không hợp lệ: thiếu hoặc sai kiểu mảng "duckRaceStudentBag".');
    }
    for (let i = 0; i < duckRaceBag.length; i++) {
      if (typeof duckRaceBag[i] !== "string") {
        throw new Error(`Định dạng file không hợp lệ: duckRaceStudentBag[${i}] phải là chuỗi.`);
      }
    }
  }

  const pointsWheelBag = record.pointsWheelStudentBag;
  if (pointsWheelBag !== undefined && pointsWheelBag !== null) {
    if (!Array.isArray(pointsWheelBag)) {
      throw new Error('Định dạng file không hợp lệ: thiếu hoặc sai kiểu mảng "pointsWheelStudentBag".');
    }
    for (let i = 0; i < pointsWheelBag.length; i++) {
      if (typeof pointsWheelBag[i] !== "string") {
        throw new Error(`Định dạng file không hợp lệ: pointsWheelStudentBag[${i}] phải là chuỗi.`);
      }
    }
  }
}

let tauriStorageSingleton: ClassroomDatabaseStorage | null = null;

async function resolveStorage(): Promise<ClassroomDatabaseStorage> {
  if (isTauri()) {
    if (!tauriStorageSingleton) {
      const { TauriFsClassroomStorage } = await import("./storage/tauri-fs.storage");
      tauriStorageSingleton = new TauriFsClassroomStorage();
    }
    return tauriStorageSingleton;
  }
  return new IndexedDbClassroomStorage();
}

async function assignCurrentOwner(db: ClassroomDatabase): Promise<ClassroomDatabase> {
  const userId = await resolveCurrentUserId();
  if (!userId) return db;
  if (db.metadata.ownerUserId === userId) return db;
  return {
    ...db,
    metadata: {
      ...db.metadata,
      ownerUserId: userId,
    },
  };
}

async function persistActiveClassroomId(id: string | null): Promise<void> {
  if (id) {
    setLastClassroomId(id);
  } else {
    clearLastClassroomId();
  }
  const storage = await resolveStorage();
  if (storage.setActiveClassroomId) {
    await storage.setActiveClassroomId(id);
  }
}

async function findClassroomByDisplayName(
  storage: ClassroomDatabaseStorage,
  className: string,
  schoolYear: string,
  excludeId?: string,
): Promise<DatabaseSummary | undefined> {
  const list = await storage.list();
  return list.find(
    (item) =>
      item.className === className &&
      item.schoolYear === schoolYear &&
      item.id !== excludeId,
  );
}

function assertNonEmptyDisplayName(className: string, schoolYear: string): void {
  if (!className || !schoolYear) {
    throw new Error("Tên lớp và năm học không được để trống.");
  }
}

async function assertUniqueDisplayName(
  storage: ClassroomDatabaseStorage,
  className: string,
  schoolYear: string,
  excludeId?: string,
): Promise<void> {
  const duplicate = await findClassroomByDisplayName(storage, className, schoolYear, excludeId);
  if (duplicate) {
    throw new Error(
      `Lớp "${className}" năm học "${schoolYear}" đã tồn tại. Hãy chọn tên hoặc năm học khác.`,
    );
  }
}

export class DatabaseService {
  private storage: ClassroomDatabaseStorage | null = null;
  private storagePromise: Promise<ClassroomDatabaseStorage> | null = null;

  constructor(storage?: ClassroomDatabaseStorage) {
    if (storage) {
      this.storage = storage;
    }
  }

  private async getStorage(): Promise<ClassroomDatabaseStorage> {
    if (this.storage) return this.storage;
    if (!this.storagePromise) {
      this.storagePromise = resolveStorage().then((resolved) => {
        this.storage = resolved;
        return resolved;
      });
    }
    return this.storagePromise;
  }

  /**
   * Called once at app startup.
   * If running inside Tauri: run the one-time migration from IndexedDB → JSON.
   * If running in browser: run the legacy localStorage migration.
   */
  async initializeAndMigrate(): Promise<void> {
    const storage = await this.getStorage();

    if (isTauri()) {
      const { migrateIndexedDbToJson } = await import("./storage/migration.service");
      const result = await migrateIndexedDbToJson(
        storage as InstanceType<typeof import("./storage/tauri-fs.storage").TauriFsClassroomStorage>,
      );

      if (result.status === "completed") {
        console.log(`[DatabaseService] Migration complete. ${result.migratedCount} classroom(s) migrated.`);
      } else if (result.status === "failed") {
        console.error("[DatabaseService] Migration failed:", result.error);
        throw new Error(`Data migration failed: ${result.error}`);
      }
      return;
    }

    const legacyKey = "chibi-classroom-data";
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (parsed.classroomSettings && parsed.classroomSettings.className) {
        const newDb = createEmptyDatabase(parsed.classroomSettings);

        newDb.students = parsed.students || [];
        newDb.teams = parsed.teams || [];
        newDb.pointActions = parsed.pointActions || newDb.pointActions;
        newDb.pointHistory = parsed.pointHistory || [];
        newDb.rewards = parsed.rewards || [];
        newDb.rewardHistory = parsed.rewardHistory || [];
        newDb.recognitions = parsed.recognitions || [];
        newDb.luckyWheelHistory = parsed.luckyWheelHistory || [];
        newDb.duckRaceHistory = parsed.duckRaceHistory || [];
        newDb.badgeAwardHistory = parsed.badgeAwardHistory || [];
        newDb.attendanceRecords = parsed.attendanceRecords || [];
        newDb.wheelStudentBag = parsed.wheelStudentBag || [];
        newDb.duckRaceStudentBag = parsed.duckRaceStudentBag || [];
        newDb.pointsWheelConfig = parsed.pointsWheelConfig;
        newDb.pointsWheelStudentBag = parsed.pointsWheelStudentBag || [];
        newDb.seatingChartConfig = parsed.seatingChartConfig;
        newDb.teamScoreHistory = parsed.teamScoreHistory || [];
        newDb.appSettings = parsed.appSettings || newDb.appSettings;

        await storage.save(normalizeClassroomDatabase(newDb));
        localStorage.removeItem(legacyKey);
      }
    } catch (e) {
      console.error("Failed to migrate legacy database", e);
    }
  }

  async listDatabases(): Promise<DatabaseSummary[]> {
    const storage = await this.getStorage();
    return storage.list();
  }

  /** Load classroom JSON without changing the active classroom id. */
  async loadClassroomSnapshot(id: string): Promise<ClassroomDatabase | null> {
    const storage = await this.getStorage();
    const loaded = await storage.load(id);
    if (!loaded) return null;
    return normalizeClassroomDatabase(loaded);
  }

  async mergeRegistryStubs(entries: CloudClassroomRegistryEntry[]): Promise<void> {
    const storage = await this.getStorage();
    if (!storage.mergeRegistryStubs) return;
    const ownerUserId = (await resolveCurrentUserId()) ?? undefined;
    await storage.mergeRegistryStubs(
      ownerUserId ? entries.map((entry) => ({ ...entry, ownerUserId })) : entries,
    );
  }

  async reconcileClassroomOwners(userId: string): Promise<void> {
    const lastAuthUserId = await lastAuthUserService.readLastAuthUserId();
    const { getLastMergedRegistry } = await import("./backup/cloud-registry.service");
    const registryKeys = new Set(
      (getLastMergedRegistry()?.classrooms ?? []).map((entry) => entry.key),
    );
    const storage = await this.getStorage();
    const summaries = await storage.list();
    for (const summary of summaries) {
      if (
        !shouldIncludeInAccountBackup(
          summary.ownerUserId,
          summary.id,
          userId,
          registryKeys,
          lastAuthUserId,
        )
      ) {
        continue;
      }
      if (summary.ownerUserId === userId) continue;
      const loaded = await storage.load(summary.id);
      if (!loaded) continue;
      if (loaded.metadata.ownerUserId === userId) continue;
      if (loaded.metadata.ownerUserId && loaded.metadata.ownerUserId !== userId) continue;
      await storage.save({
        ...loaded,
        metadata: { ...loaded.metadata, ownerUserId: userId },
      });
    }
  }

  async isClassroomHydrated(id: string): Promise<boolean> {
    const storage = await this.getStorage();
    if (storage.isClassroomHydrated) {
      return storage.isClassroomHydrated(id);
    }
    const summary = (await storage.list()).find((item) => item.id === id);
    return summary?.hydrated !== false;
  }

  async saveCloudRestoredDatabase(
    data: unknown,
    options?: {
      cloudAssets?: Array<{ path: string; content: string; encoding?: string }>;
      expectedClassroomId?: string;
    },
  ): Promise<ClassroomDatabase> {
    const record = data as Record<string, unknown>;
    const classroomData =
      record.payload && typeof record.payload === "object" ? record.payload : data;
    assertImportShape(classroomData);

    let db = normalizeClassroomDatabase(classroomData as ClassroomDatabase);
    if (
      options?.expectedClassroomId &&
      db.metadata.id !== options.expectedClassroomId
    ) {
      throw new Error(
        `ID lớp không khớp: mong đợi "${options.expectedClassroomId}", nhận "${db.metadata.id}".`,
      );
    }
    if (db.metadata.cloudStub) {
      delete db.metadata.cloudStub;
    }

    if (options?.cloudAssets?.length) {
      const written = await restoreCloudAssetsLocally(db.metadata.id, options.cloudAssets);
      const beforeBanner = db.classroomSettings.bannerAssetKey;
      const beforeTeacher = db.classroomSettings.teacher?.avatarAssetKey;
      db = applyAssetKeysFromRestoredPaths(db, options.cloudAssets);
      logCloudTrace("info", "cloud-restore", "saveCloudRestoredDatabase assets", {
        classroomId: db.metadata.id,
        incoming: options.cloudAssets.length,
        written,
        bannerBefore: beforeBanner ?? null,
        bannerAfter: db.classroomSettings.bannerAssetKey ?? null,
        teacherBefore: beforeTeacher ?? null,
        teacherAfter: db.classroomSettings.teacher?.avatarAssetKey ?? null,
        isTauri: isTauri(),
      });
    } else {
      logCloudTrace("warn", "cloud-restore", "saveCloudRestoredDatabase with no cloudAssets", {
        classroomId: db.metadata.id,
      });
    }

    const { database: migrated } = await migrateLegacyClassroomImages(db);
    db = await assignCurrentOwner(migrated);

    const storage = await this.getStorage();
    await storage.save(db);
    await persistActiveClassroomId(db.metadata.id);
    return db;
  }

  async createDatabase(
    settings: Omit<ClassroomSettings, "id" | "createdAt" | "updatedAt">,
    options?: { activate?: boolean },
  ): Promise<ClassroomDatabase> {
    const storage = await this.getStorage();
    const className = settings.className.trim();
    const schoolYear = settings.schoolYear.trim();
    assertNonEmptyDisplayName(className, schoolYear);
    await assertUniqueDisplayName(storage, className, schoolYear);
    const db = normalizeClassroomDatabase(
      createEmptyDatabase({
        ...settings,
        className,
        schoolYear,
      }),
    );
    if (await isCloudBackupConfigured()) {
      db.appSettings.cloudBackupEnabled = true;
    }
    const owned = await assignCurrentOwner(db);
    await storage.save(owned);
    if (options?.activate !== false) {
      await persistActiveClassroomId(owned.metadata.id);
    }
    return owned;
  }

  async openDatabase(id: string): Promise<ClassroomDatabase | null> {
    const storage = await this.getStorage();
    const loaded = await storage.load(id);
    if (!loaded) return null;

    let db = loaded;
    if (!db.classroomSettings.teacher) {
      const legacySettings = db.classroomSettings as ClassroomSettings & {
        teacherName?: string;
        teacherAvatar?: string;
      };
      db = {
        ...db,
        classroomSettings: {
          ...db.classroomSettings,
          teacher: {
            id: "teacher-migrated",
            name: legacySettings.teacherName || "Teacher",
            avatar: legacySettings.teacherAvatar,
            createdAt: db.metadata.createdAt,
            updatedAt: db.metadata.updatedAt,
          },
        },
      };
    }

    let normalized = normalizeClassroomDatabase(db);
    const { database: migrated, didMigrate } = await migrateLegacyClassroomImages(normalized);
    normalized = migrated;
    if (didMigrate) {
      await storage.save(normalized);
    }
    await persistActiveClassroomId(normalized.metadata.id);
    return normalized;
  }

  async saveDatabase(db: ClassroomDatabase): Promise<ClassroomDatabase> {
    const storage = await this.getStorage();
    const normalized = normalizeClassroomDatabase(db);
    const updatedDb: ClassroomDatabase = {
      ...normalized,
      metadata: {
        ...normalized.metadata,
        updatedAt: new Date().toISOString(),
      },
    };
    await storage.save(updatedDb);
    return updatedDb;
  }

  async getPreferredClassroomId(): Promise<string | null> {
    const storage = await this.getStorage();
    if (storage.getActiveClassroomId) {
      const fromIndex = await storage.getActiveClassroomId();
      if (fromIndex) return fromIndex;
    }
    return getLastClassroomId();
  }

  async updateClassroomInfo(
    id: string,
    info: { className: string; schoolYear: string },
  ): Promise<ClassroomDatabase> {
    const storage = await this.getStorage();
    const current = await storage.load(id);
    if (!current) throw new Error("Không tìm thấy lớp học.");

    const className = info.className.trim();
    const schoolYear = info.schoolYear.trim();
    assertNonEmptyDisplayName(className, schoolYear);
    if (
      className === current.classroomSettings.className &&
      schoolYear === current.classroomSettings.schoolYear
    ) {
      return normalizeClassroomDatabase(current);
    }
    await assertUniqueDisplayName(storage, className, schoolYear, id);

    const now = new Date().toISOString();
    const updated = normalizeClassroomDatabase({
      ...current,
      metadata: {
        ...current.metadata,
        updatedAt: now,
      },
      classroomSettings: {
        ...current.classroomSettings,
        className,
        schoolYear,
        updatedAt: now,
      },
    });
    await storage.save(updated);
    return updated;
  }

  async setClassroomArchived(id: string, archived: boolean): Promise<ClassroomDatabase> {
    const storage = await this.getStorage();
    const current = await storage.load(id);
    if (!current) {
      const summaries = await storage.list();
      const summary = summaries.find((item) => item.id === id);
      if (!summary) throw new Error("Không tìm thấy lớp học.");

      const now = new Date().toISOString();
      if (storage.mergeRegistryStubs) {
        await storage.mergeRegistryStubs([
          {
            key: id,
            name: summary.className,
            schoolYear: summary.schoolYear,
            createdAt: summary.createdAt,
            updatedAt: now,
            archived,
          },
        ]);
      }

      const stub = createEmptyDatabase({
        className: summary.className,
        schoolYear: summary.schoolYear,
        teacher: {
          id: "cloud-stub",
          name: summary.teacherName,
          createdAt: summary.createdAt,
          updatedAt: now,
        },
      });
      stub.metadata = {
        ...stub.metadata,
        id,
        createdAt: summary.createdAt,
        updatedAt: now,
        archived,
        cloudStub: true,
      };
      return normalizeClassroomDatabase(stub);
    }

    const now = new Date().toISOString();
    const updated = normalizeClassroomDatabase({
      ...current,
      metadata: {
        ...current.metadata,
        archived,
        updatedAt: now,
      },
    });
    await storage.save(updated);

    const activeId = await this.getPreferredClassroomId();
    if (archived && activeId === id) {
      const list = await storage.list();
      const nextActive = list.find((entry) => entry.id !== id && !entry.archived)?.id ?? null;
      await persistActiveClassroomId(nextActive);
    }

    return updated;
  }

  async renameClassroomDatabase(
    currentId: string,
    newClassName: string,
    newSchoolYear: string,
  ): Promise<ClassroomDatabase> {
    const storage = await this.getStorage();
    const currentDb = await this.openDatabase(currentId);
    if (!currentDb) throw new Error("Database not found");

    const className = newClassName.trim();
    const schoolYear = newSchoolYear.trim();
    assertNonEmptyDisplayName(className, schoolYear);
    if (
      className === currentDb.classroomSettings.className &&
      schoolYear === currentDb.classroomSettings.schoolYear
    ) {
      return currentDb;
    }
    await assertUniqueDisplayName(storage, className, schoolYear, currentId);

    const now = new Date().toISOString();
    const updatedDb = normalizeClassroomDatabase({
      ...currentDb,
      metadata: {
        ...currentDb.metadata,
        updatedAt: now,
      },
      classroomSettings: {
        ...currentDb.classroomSettings,
        className,
        schoolYear,
        updatedAt: now,
      },
    });

    await storage.save(updatedDb);
    return updatedDb;
  }

  async duplicateDatabase(
    sourceId: string,
    newClassName: string,
    newSchoolYear: string,
    mode: "settings-only" | "full-copy",
    options?: { activate?: boolean },
  ): Promise<ClassroomDatabase> {
    const storage = await this.getStorage();
    const rawSource = await storage.load(sourceId);
    if (!rawSource) throw new Error("Source database not found");
    const sourceDb = normalizeClassroomDatabase(rawSource);

    const className = newClassName.trim();
    const schoolYear = newSchoolYear.trim();
    assertNonEmptyDisplayName(className, schoolYear);
    await assertUniqueDisplayName(storage, className, schoolYear);

    const now = new Date().toISOString();
    let newDb: ClassroomDatabase;

    if (mode === "settings-only") {
      newDb = createEmptyDatabase({
        className,
        schoolYear,
        classAvatarAssetKey: sourceDb.classroomSettings.classAvatarAssetKey,
        bannerAssetKey: sourceDb.classroomSettings.bannerAssetKey,
        teacher: {
          ...sourceDb.classroomSettings.teacher,
          avatar: undefined,
        },
      });
      newDb.pointActions = sourceDb.pointActions;
      newDb.rewards = sourceDb.rewards;
      newDb.classroomRoles = sourceDb.classroomRoles ?? newDb.classroomRoles;
      newDb.badges = sourceDb.badges ?? newDb.badges;
      newDb.recognitionTitles = sourceDb.recognitionTitles ?? newDb.recognitionTitles;
      newDb.appSettings = sourceDb.appSettings;
    } else {
      const newId = createId("classroom");
      newDb = normalizeClassroomDatabase({
        ...sourceDb,
        metadata: {
          id: newId,
          version: sourceDb.metadata.version,
          createdAt: now,
          updatedAt: now,
          archived: false,
        },
        classroomSettings: {
          ...sourceDb.classroomSettings,
          id: newId,
          className,
          schoolYear,
          updatedAt: now,
        },
      });
    }

    newDb = await assignCurrentOwner(newDb);
    const newId = newDb.metadata.id;
    await classroomAssetService.copyClassroomAssets(sourceId, newId, newDb);
    try {
      await storage.save(newDb);
    } catch (error) {
      try {
        await classroomAssetService.deleteClassroomAssets(newId);
      } catch (cleanupError) {
        console.warn("[duplicateDatabase] failed to clean copied assets", cleanupError);
      }
      throw error;
    }

    if (options?.activate !== false) {
      await persistActiveClassroomId(newDb.metadata.id);
    }

    if (await isCloudBackupConfigured()) {
      newDb.appSettings.cloudBackupEnabled = true;
    }
    newDb = await assignCurrentOwner(newDb);
    await storage.save(newDb);

    return newDb;
  }

  async deleteDatabase(id: string): Promise<void> {
    const storage = await this.getStorage();
    const summaries = await storage.list();
    const summary = summaries.find((item) => item.id === id);
    const db = await storage.load(id);

    if (!db && !summary) return;

    const isArchived = db?.metadata.archived ?? summary?.archived ?? false;
    if (!isArchived) {
      throw new Error("Chỉ có thể xóa lớp đã lưu trữ. Hãy lưu trữ lớp trước.");
    }

    const activeId = await this.getPreferredClassroomId();
    if (activeId === id) {
      throw new Error("Không thể xóa lớp đang sử dụng. Hãy chuyển sang lớp khác trước.");
    }

    await storage.delete(id);
    if (db) {
      try {
        await classroomAssetService.deleteClassroomAssets(id);
      } catch (error) {
        console.warn("[deleteDatabase] failed to remove classroom assets", error);
      }
    }
  }

  private async importParsedDatabase(data: unknown): Promise<ClassroomDatabase> {
    const record = data as Record<string, unknown>;
    const classroomData =
      record.payload && typeof record.payload === "object" ? record.payload : data;

    assertImportShape(classroomData);

    let db = normalizeClassroomDatabase(classroomData);
    const storage = await this.getStorage();
    const existing = await storage.load(db.metadata.id);
    if (existing && !existing.metadata.cloudStub) {
      throw new Error(
        `Đã có lớp "${existing.classroomSettings.className}" (${existing.classroomSettings.schoolYear}) với cùng mã dữ liệu. Hãy xóa lớp cũ hoặc chỉnh tên lớp/năm học trong file trước khi nhập.`,
      );
    }
    if (db.metadata.cloudStub) {
      delete db.metadata.cloudStub;
    }
    db = await assignCurrentOwner(db);
    if (await isCloudBackupConfigured()) {
      db.appSettings.cloudBackupEnabled = true;
    }
    const saved = await this.saveDatabase(db);
    await persistActiveClassroomId(saved.metadata.id);
    return saved;
  }

  async importDatabaseFromJson(data: unknown): Promise<ClassroomDatabase> {
    return this.importParsedDatabase(data);
  }

  async importDatabase(file: File): Promise<ClassroomDatabase> {
    assertImportFileSize(file);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string;
          const data = JSON.parse(text);
          const saved = await this.importParsedDatabase(data);
          resolve(saved);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  async exportDatabase(db: ClassroomDatabase): Promise<void> {
    const json = JSON.stringify(db, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const filename = generateExportFilename(db.classroomSettings.className, db.classroomSettings.schoolYear);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async getDataDirectory(): Promise<string | null> {
    if (!isTauri()) return null;
    const storage = await this.getStorage();
    if (storage.getDataDirectory) {
      return storage.getDataDirectory();
    }
    return null;
  }

  async closeDatabase(): Promise<void> {
    await persistActiveClassroomId(null);
  }
}

export const databaseService = new DatabaseService();
