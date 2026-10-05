"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  Badge,
  ClassroomRole,
  ClassroomSettings,
  PointAction,
  PointHistory,
  PointHistorySource,
  PointsWheelSegment,
  Recognition,
  RecognitionTitle,
  Gift,
  SeatingChartConfig,
  Student,
  TeacherProfile,
  Team,
  TeamScoreHistory,
  AppSettings,
  AttendanceEntry,
} from "../types/models";
import { createId } from "../utils/id";
import {
  clearStudentLeadershipFromTeams,
  sanitizeAllTeamLeadership,
  sanitizeTeamLeadership,
} from "../utils/classroomRoles";
import type { ClassroomDatabase, DatabaseSummary } from "../database/types";
import { databaseService } from "../database/database.service";
import { buildRecognizeStudentsUpdate, ensureBadgeForTitle, type RecognizeStudentsInput } from "../utils/recognition";
import { removeStudentFromAllSeats } from "../utils/seatingChart";
import { classroomAssetService } from "../database/assets/classroom-asset.service";
import { normalizeGift, buildRedeemGiftUpdate } from "../utils/gifts";
import {
  clearLastClassroomId,
  setLastClassroomId,
} from "../utils/lastClassroom";
import {
  cloudBackupScheduler,
  isCloudBackupConfigured,
  isCloudBackupEnabledForDatabase,
  inspectCloudBackupAuth,
  type CloudBackupState,
} from "../database/backup/cloud-backup.service";
import {
  ensureRegistryPulled,
  hydrateClassroomFromCloud,
  isHydrateCancelledError,
  pullAndMergeAccountRegistry,
  pushClassroomRegistryMerge,
  refreshCloudRegistrySummaries,
  resetRegistryPullState,
} from "../database/backup/cloud-registry.service";
import { lastAuthUserService } from "../database/backup/classroom-owner";
import {
  activityDatesFromHistoryChange,
  cloudDirtyTracker,
  inferDirtyFromDatabaseChange,
} from "../database/backup/cloud-dirty-tracker";
import { isCloudRestoreInProgress } from "../database/backup/cloud-restore-gate";
import { deleteAttendanceByDate, upsertAttendanceRecord } from "../utils/attendance";
import { toastError, toastSuccess } from "../utils/toast";
import { logAppEvent, logCloudTrace } from "../logging/app-log";
import { useAuth } from "./AuthContext";
import { useAppDataAutosave, type LocalSaveStatus } from "./app-data-autosave";
import { restoreClassroomFromCloudPayload } from "./app-data-cloud-restore";

export type { RecognizeStudentsInput };
export type { LocalSaveStatus } from "./app-data-autosave";

interface AppDataContextValue {
  data: ClassroomDatabase | null;
  isLoading: boolean;
  initError: string | null;
  saveError: string | null;
  localSaveStatus: LocalSaveStatus;
  cloudBackupState: CloudBackupState;
  cloudBackupError: string | null;
  retryCloudBackup: () => Promise<void>;
  clearSaveError: () => void;
  retrySave: () => Promise<void>;
  retryInit: () => Promise<void>;
  switchDatabase: (id: string) => Promise<void>;
  closeDatabase: () => Promise<void>;
  listClassrooms: () => Promise<DatabaseSummary[]>;
  createDatabase: (
    settings: Omit<ClassroomSettings, "id" | "createdAt" | "updatedAt">,
    options?: { activate?: boolean },
  ) => Promise<ClassroomDatabase>;
  importDatabase: (file: File) => Promise<void>;
  importDatabaseFromJson: (payload: unknown) => Promise<ClassroomDatabase>;
  /** Overwrite local classroom JSON from cloud restore payload. */
  restoreFromCloudPayload: (
    payload: unknown,
    cloudAssets?: Array<{ path: string; content: string; encoding?: string }>,
  ) => Promise<ClassroomDatabase>;
  renameDatabase: (newClassName: string, newSchoolYear: string) => Promise<void>;
  duplicateDatabase: (
    sourceId: string,
    newClassName: string,
    newSchoolYear: string,
    mode: "settings-only" | "full-copy",
    options?: { activate?: boolean },
  ) => Promise<ClassroomDatabase>;
  updateClassroomInfo: (id: string, info: { className: string; schoolYear: string }) => Promise<void>;
  archiveClassroom: (id: string) => Promise<void>;
  restoreClassroom: (id: string) => Promise<void>;
  deleteDatabase: (id: string) => Promise<void>;
  updateClassroomSettings: (settings: ClassroomSettings) => void;
  updateAppSettings: (updates: Partial<AppSettings>) => void;
  updateTeacherProfile: (teacher: Partial<Omit<TeacherProfile, "id" | "createdAt" | "updatedAt">>) => void;
  saveClassroomRole: (role: ClassroomRole) => void;
  deleteClassroomRole: (roleId: string) => void;
  saveBadge: (badge: Badge) => void;
  deleteBadge: (badgeId: string) => void;
  toggleStudentBadge: (studentId: string, badgeId: string) => void;
  saveStudent: (student: Student) => void;
  saveStudents: (students: Student[]) => void;
  deleteStudent: (studentId: string) => Promise<void>;
  saveTeam: (team: Team) => void;
  deleteTeam: (teamId: string) => void;
  updateTeamScore: (teamId: string, delta: number, note?: string) => void;
  resetTeamScore: (teamId: string) => void;
  savePointAction: (action: PointAction) => void;
  deletePointAction: (actionId: string) => void;
  applyPoints: (
    studentId: string,
    action: PointAction,
    note?: string,
    source?: PointHistorySource,
  ) => void;
  saveGift: (gift: Gift, options?: { previousImagePath?: string }) => Promise<void>;
  deleteGift: (giftId: string) => Promise<void>;
  redeemGift: (studentId: string, giftId: string) => boolean;
  saveRecognitionTitle: (title: RecognitionTitle) => void;
  deleteRecognitionTitle: (titleId: string) => void;
  recognizeStudents: (input: RecognizeStudentsInput) => Recognition[];
  updateRecognitionMessage: (recognitionId: string, message: string) => void;
  deleteRecognition: (recognitionId: string) => void;
  addRecognition: (recognition: Omit<Recognition, "id" | "createdAt">) => Recognition;
  setWheelStudentBag: (bag: string[]) => void;
  setDuckRaceStudentBag: (bag: string[]) => void;
  setPointsWheelStudentBag: (bag: string[]) => void;
  setPointsWheelConfig: (config: PointsWheelSegment[]) => void;
  setSeatingChartConfig: (config: SeatingChartConfig) => void;
  recordLuckyWheelSelection: (studentIds: string[]) => void;
  recordDuckRaceResult: (input: {
    winnerId: string;
    winnerIds?: string[];
    participantIds: string[];
  }) => void;
  saveAttendance: (input: { date: string; entries: AttendanceEntry[]; note?: string }) => Promise<void>;
  deleteAttendance: (date: string) => Promise<void>;
  persistNow: () => Promise<boolean>;
  markDirtyAsset: (assetKey: string) => void;
  /** Bumps when account registry merge changes local classroom list. */
  classroomListEpoch: number;
  hydrateErrors: Record<string, string>;
  clearHydrateError: (id: string) => void;
  retryHydrateClassroom: (id: string) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

function pickClassroomIdToOpen(
  activeDatabases: DatabaseSummary[],
  preferredId: string | null,
  allowUnhydrated: boolean,
): string | undefined {
  const preferred = preferredId
    ? activeDatabases.find((item) => item.id === preferredId && !item.archived)
    : undefined;
  const hydratedActive = activeDatabases.filter((item) => item.hydrated !== false);

  if (preferred && (allowUnhydrated || preferred.hydrated !== false)) {
    return preferred.id;
  }
  if (hydratedActive[0]) return hydratedActive[0].id;
  if (allowUnhydrated) return activeDatabases[0]?.id;
  return undefined;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { permissions, entitlement, isBootstrapping, user } = useAuth();
  const [data, setDataState] = useState<ClassroomDatabase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localSaveStatus, setLocalSaveStatus] = useState<LocalSaveStatus>("saved");
  const [cloudBackupState, setCloudBackupState] = useState<CloudBackupState>("disabled");
  const [cloudBackupError, setCloudBackupError] = useState<string | null>(null);
  const [classroomListEpoch, setClassroomListEpoch] = useState(0);
  const [hydrateErrors, setHydrateErrors] = useState<Record<string, string>>({});
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const dataRef = useRef<ClassroomDatabase | null>(null);
  const switchGenerationRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);

  const {
    pendingSaveRef,
    persistNow,
    scheduleSave,
    retrySave,
    cancelPendingSaveForClassroom,
    setLastPersisted,
  } = useAppDataAutosave({
    dataRef,
    setLocalSaveStatus,
    setSaveError,
  });

  const clearSaveError = () => setSaveError(null);

  const prevCloudBackupRef = useRef<CloudBackupState>("disabled");

  useEffect(() => {
    const unsubscribe = cloudBackupScheduler.subscribe((state, error, classroomId) => {
      const activeId = dataRef.current?.metadata.id;
      if (classroomId && activeId && classroomId !== activeId) {
        return;
      }

      const prev = prevCloudBackupRef.current;
      if (state === "synced" && prev !== "synced") {
        toastSuccess("Đã sao lưu đám mây thành công");
      } else if (state === "failed" && prev !== "failed") {
        toastError(error ?? "Sao lưu đám mây thất bại");
      }
      prevCloudBackupRef.current = state;
      setCloudBackupState(state);
      setCloudBackupError(state === "failed" ? error : null);
    });
    cloudBackupScheduler.startPeriodicRetry();
    return () => {
      unsubscribe();
      cloudBackupScheduler.stop();
    };
  }, []);

  useEffect(() => {
    cloudBackupScheduler.setHasPendingLocalSave((classroomId) => {
      const pending = pendingSaveRef.current;
      return pending?.metadata.id === classroomId;
    });
    return () => cloudBackupScheduler.setHasPendingLocalSave(null);
  }, []);

  const applyLoadedDatabase = useCallback((db: ClassroomDatabase | null) => {
    setDataState(db);
    dataRef.current = db;
    setLastPersisted(db);
    if (db) {
      setLastClassroomId(db.metadata.id);
    } else {
      clearLastClassroomId();
    }
  }, [setLastPersisted]);

  const syncRegistryAfterChange = useCallback(async (options?: { markDeletedKey?: string }) => {
    try {
      const summaries = await databaseService.listDatabases();
      await pushClassroomRegistryMerge(
        summaries.map((s) => ({
          id: s.id,
          className: s.className,
          schoolYear: s.schoolYear,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          archived: s.archived,
          ownerUserId: s.ownerUserId,
        })),
        { markDeletedKey: options?.markDeletedKey },
      );
      await refreshCloudRegistrySummaries();
    } catch (error) {
      console.warn("[AppDataProvider] registry sync failed:", error);
    }
  }, []);

  const openClassroomById = useCallback(
    async (
      id: string,
      generation?: number,
      options?: { allowCloudHydrate?: boolean },
    ): Promise<ClassroomDatabase | null> => {
      const allowCloudHydrate = options?.allowCloudHydrate !== false;
      const isCancelled = () =>
        generation !== undefined && generation !== switchGenerationRef.current;

      const hydrate = async () => {
        if (!allowCloudHydrate) {
          logCloudTrace("info", "cloud-restore", "hydrate skipped: allowCloudHydrate=false", { id });
          return null;
        }
        if (!(await isCloudBackupConfigured())) {
          logCloudTrace("warn", "cloud-restore", "hydrate skipped: not configured", {
            id,
            ...(await inspectCloudBackupAuth()),
          });
          return null;
        }
        try {
          const db = await hydrateClassroomFromCloud(id, { isCancelled });
          if (isCancelled()) return null;
          return db;
        } catch (error) {
          if (isHydrateCancelledError(error)) return null;
          logCloudTrace("error", "cloud-restore", "hydrate failed", {
            id,
            name: error instanceof Error ? error.name : typeof error,
            message: error instanceof Error ? error.message || "(empty)" : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          throw error;
        }
      };

      const hydrated = await databaseService.isClassroomHydrated(id);
      if (!hydrated) {
        logCloudTrace("info", "cloud-restore", "openClassroomById: stub, will hydrate", { id, allowCloudHydrate });
        return await hydrate();
      }
      const db = await databaseService.openDatabase(id);
      if (!db) {
        logCloudTrace("warn", "cloud-restore", "openClassroomById: local JSON missing", { id, allowCloudHydrate });
        return await hydrate();
      }
      logCloudTrace("info", "cloud-restore", "openClassroomById: opened local JSON", { id });
      if (isCancelled()) return null;
      return db;
    },
    [],
  );

  const scheduleFirstCloudBackup = useCallback(async (db: ClassroomDatabase) => {
    if (!isCloudBackupEnabledForDatabase(db)) return;
    if (!(await isCloudBackupConfigured())) return;
    await ensureRegistryPulled();
    cloudDirtyTracker.markAll(db.metadata.id);
    try {
      await cloudBackupScheduler.triggerUploadNow(db);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logAppEvent("error", "cloud-backup", "first backup failed", {
        classroomId: db.metadata.id,
        message,
      });
    }
  }, []);

  const applyAccountRegistryDiscovery = useCallback(async () => {
    const result = await pullAndMergeAccountRegistry();
    logCloudTrace("info", "cloud-registry", "discovery result", {
      ok: result.ok,
      reason: result.ok ? result.source : result.reason,
    });
    if (!result.ok) return result;

    if (user?.id) {
      await databaseService.reconcileClassroomOwners(user.id);
      await lastAuthUserService.writeLastAuthUserId(user.id);
    }

    await refreshCloudRegistrySummaries();
    setClassroomListEpoch((epoch) => epoch + 1);

    const databases = await databaseService.listDatabases();
    const activeDatabases = databases.filter((item) => !item.archived);
    const currentId = dataRef.current?.metadata.id;
    const currentStillValid =
      Boolean(currentId) && activeDatabases.some((item) => item.id === currentId);

    logCloudTrace("info", "cloud-registry", "discovery classrooms", {
      currentId: currentId ?? null,
      currentStillValid,
      activeCount: activeDatabases.length,
      stubCount: activeDatabases.filter((item) => item.hydrated === false).length,
    });

    if (!currentStillValid && activeDatabases.length > 0) {
      const preferredId = await databaseService.getPreferredClassroomId();
      const targetId = pickClassroomIdToOpen(activeDatabases, preferredId, true);
      const currentBeforeOpen = dataRef.current?.metadata.id;
      const stillNeedsOpen =
        !currentBeforeOpen || !activeDatabases.some((item) => item.id === currentBeforeOpen);

      if (targetId && stillNeedsOpen) {
        const generation = ++switchGenerationRef.current;
        try {
          const db = await openClassroomById(targetId, generation);
          if (generation !== switchGenerationRef.current) return result;
          if (db) {
            setHydrateErrors((prev) => {
              if (!prev[targetId]) return prev;
              const next = { ...prev };
              delete next[targetId];
              return next;
            });
            applyLoadedDatabase(db);
            await cloudBackupScheduler.checkStartupBackup(db);
          } else {
            setHydrateErrors((prev) => ({
              ...prev,
              [targetId]: "Không thể tải lớp học từ đám mây.",
            }));
          }
        } catch (error) {
          if (generation !== switchGenerationRef.current) return result;
          if (isHydrateCancelledError(error)) return result;
          const message =
            error instanceof Error ? error.message : "Không thể tải lớp học từ đám mây.";
          setHydrateErrors((prev) => ({ ...prev, [targetId]: message }));
        }
      }
    }

    return result;
  }, [applyLoadedDatabase, openClassroomById, user]);

  const loadInitialDatabase = useCallback(async () => {
    const generation = switchGenerationRef.current;
    setIsLoading(true);
    setInitError(null);
    try {
      await databaseService.initializeAndMigrate();
      try {
        await pullAndMergeAccountRegistry();
      } catch (error) {
        console.warn("[AppDataProvider] account registry pull failed:", error);
      }

      const databases = await databaseService.listDatabases();
      const activeDatabases = databases.filter((item) => !item.archived);
      if (activeDatabases.length > 0) {
        const preferredId = await databaseService.getPreferredClassroomId();
        const targetId = pickClassroomIdToOpen(activeDatabases, preferredId, false);
        if (!targetId) {
          if (generation === switchGenerationRef.current) {
            applyLoadedDatabase(null);
          }
        } else {
          const db = await openClassroomById(targetId, generation, { allowCloudHydrate: false });
          if (generation !== switchGenerationRef.current) return;
          applyLoadedDatabase(db);
          if (db) {
            await cloudBackupScheduler.checkStartupBackup(db);
          }
        }
      } else if (generation === switchGenerationRef.current) {
        applyLoadedDatabase(null);
      }
    } catch (error) {
      if (generation !== switchGenerationRef.current) return;
      const message = error instanceof Error ? error.message : "Không thể khởi tạo dữ liệu lớp học.";
      console.error("[AppDataProvider] init failed:", error);
      logAppEvent("error", "app-data.init", message, error);
      setInitError(message);
      applyLoadedDatabase(null);
    } finally {
      initialLoadDoneRef.current = true;
      setInitialLoadDone(true);
      if (generation === switchGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }, [applyLoadedDatabase, openClassroomById]);

  useEffect(() => {
    if (isBootstrapping) return;
    const nextId = user?.id ?? null;
    if (prevUserIdRef.current && prevUserIdRef.current !== nextId) {
      resetRegistryPullState();
    }
    prevUserIdRef.current = nextId;
  }, [user?.id, isBootstrapping]);

  useEffect(() => {
    if (!initialLoadDone || isBootstrapping || !user?.id) return;
    if (permissions?.cloudBackup) return;
    void databaseService.reconcileClassroomOwners(user.id).then(() =>
      lastAuthUserService.writeLastAuthUserId(user.id),
    );
  }, [initialLoadDone, isBootstrapping, user?.id, permissions?.cloudBackup]);

  useEffect(() => {
    if (!initialLoadDone || isBootstrapping || !permissions?.cloudBackup || !entitlement) return;
    void applyAccountRegistryDiscovery().catch((error) => {
      console.warn("[AppDataProvider] account registry discovery failed:", error);
    });
  }, [initialLoadDone, isBootstrapping, permissions?.cloudBackup, entitlement, applyAccountRegistryDiscovery]);

  useEffect(() => {
    if (!initialLoadDone || isBootstrapping || !permissions?.cloudBackup || !entitlement) return;
    const retryRegistryPull = () => {
      void applyAccountRegistryDiscovery().catch((error) => {
        console.warn("[AppDataProvider] account registry retry failed:", error);
      });
    };
    window.addEventListener("online", retryRegistryPull);
    return () => window.removeEventListener("online", retryRegistryPull);
  }, [permissions?.cloudBackup, entitlement, applyAccountRegistryDiscovery, initialLoadDone, isBootstrapping]);

  useEffect(() => {
    void loadInitialDatabase();
  }, [loadInitialDatabase]);

  useEffect(() => {
    const current = dataRef.current;
    if (!current?.appSettings.cloudBackupEnabled) return;
    if (isCloudRestoreInProgress(current.metadata.id)) return;
    void cloudBackupScheduler.checkStartupBackup(current);
  }, [data?.metadata.id, data?.appSettings.cloudBackupEnabled]);

  useEffect(() => {
    const classroomId = data?.metadata.id;
    if (!classroomId) return;
    const snapshot = cloudBackupScheduler.getStateForClassroom(classroomId);
    prevCloudBackupRef.current = snapshot.state;
    setCloudBackupState(snapshot.state);
    setCloudBackupError(snapshot.state === "failed" ? snapshot.error : null);
  }, [data?.metadata.id]);

  const retryCloudBackup = useCallback(async () => {
    const current = dataRef.current;
    if (!current?.appSettings.cloudBackupEnabled) return;
    await cloudBackupScheduler.triggerUploadNow(current);
  }, []);

  const commitData = useCallback(
    (next: ClassroomDatabase) => {
      const prev = dataRef.current;
      if (prev && prev.metadata.id === next.metadata.id) {
        const patch = inferDirtyFromDatabaseChange(prev, next);
        if (Object.keys(patch).length > 0) {
          cloudDirtyTracker.mark(prev.metadata.id, patch);
        }
        const activityDates = activityDatesFromHistoryChange(prev, next);
        if (activityDates.length > 0) {
          cloudDirtyTracker.markActivityDates(prev.metadata.id, activityDates);
        }
      }
      setDataState(next);
      dataRef.current = next;
      scheduleSave();
    },
    [scheduleSave],
  );

  const markDirtyAsset = useCallback((assetKey: string) => {
    const classroomId = dataRef.current?.metadata.id;
    if (!classroomId || !assetKey) return;
    const current = cloudDirtyTracker.get(classroomId);
    if (current.dirtyAssets.includes(assetKey)) return;
    cloudDirtyTracker.mark(classroomId, {
      dirtyAssets: [...current.dirtyAssets, assetKey],
    });
  }, []);

  const setData = useCallback(
    (updater: (current: ClassroomDatabase) => ClassroomDatabase) => {
      const current = dataRef.current;
      if (!current) return;
      const next = updater(current);
      if (next === current) return;
      commitData(next);
    },
    [commitData],
  );

  const switchDatabase = useCallback(
    async (id: string) => {
      const generation = ++switchGenerationRef.current;
      setIsLoading(true);
      try {
        const persisted = await persistNow();
        if (!persisted) return;
        const current = dataRef.current;
        if (current?.metadata.id && current.metadata.id !== id) {
          try {
            await cloudBackupScheduler.flushCloudSyncForClassroom(current.metadata.id, current);
          } catch (error) {
            console.warn("[AppDataProvider] flush before switch failed:", error);
          }
        }
        const db = await openClassroomById(id, generation);
        if (generation !== switchGenerationRef.current) return;
        if (!db) {
          const message = "Không thể mở lớp học. Dữ liệu có thể bị hỏng, chưa sao lưu, hoặc đã bị xóa.";
          setHydrateErrors((prev) => ({ ...prev, [id]: message }));
          setSaveError(message);
          return;
        }
        setHydrateErrors((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        applyLoadedDatabase(db);
      } catch (error) {
        if (generation !== switchGenerationRef.current) return;
        if (isHydrateCancelledError(error)) return;
        const message = error instanceof Error ? error.message : "Không thể chuyển lớp học.";
        console.error("[AppDataProvider] switchDatabase failed:", error);
        setHydrateErrors((prev) => ({ ...prev, [id]: message }));
        setSaveError(message);
      } finally {
        if (generation === switchGenerationRef.current) {
          setIsLoading(false);
        }
      }
    },
    [applyLoadedDatabase, openClassroomById, persistNow],
  );

  const retryHydrateClassroom = useCallback(
    async (id: string) => {
      setHydrateErrors((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await switchDatabase(id);
    },
    [switchDatabase],
  );

  const syncClassroomIdentityToCloud = useCallback(
    async (db: ClassroomDatabase) => {
      if (isCloudBackupEnabledForDatabase(db) && (await isCloudBackupConfigured())) {
        cloudDirtyTracker.mark(db.metadata.id, {
          classroom: true,
          settings: true,
          registry: true,
        });
        try {
          await cloudBackupScheduler.triggerUploadNow(db);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logAppEvent("error", "cloud-backup", "identity sync failed", {
            classroomId: db.metadata.id,
            message,
          });
        }
      }
      await syncRegistryAfterChange();
    },
    [syncRegistryAfterChange],
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      data,
      isLoading,
      initError,
      saveError,
      localSaveStatus,
      cloudBackupState,
      cloudBackupError,
      retryCloudBackup,
      clearSaveError,
      retrySave,
      retryInit: loadInitialDatabase,
      listClassrooms: () => databaseService.listDatabases(),
      switchDatabase,
      closeDatabase: async () => {
        const persisted = await persistNow();
        if (!persisted) return;
        try {
          await databaseService.closeDatabase();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Không thể đóng lớp học.";
          console.error("[AppDataProvider] closeDatabase failed:", error);
          setSaveError(message);
          return;
        }
        applyLoadedDatabase(null);
      },
      createDatabase: async (settings, options) => {
        setIsLoading(true);
        try {
          const db = await databaseService.createDatabase(settings, options);
          if (options?.activate !== false) {
            applyLoadedDatabase(db);
          }
          if (isCloudBackupEnabledForDatabase(db) && (await isCloudBackupConfigured())) {
            await scheduleFirstCloudBackup(db);
          } else {
            await syncRegistryAfterChange();
          }
          setClassroomListEpoch((epoch) => epoch + 1);
          return db;
        } finally {
          setIsLoading(false);
        }
      },
      importDatabase: async (file) => {
        setIsLoading(true);
        try {
          const db = await databaseService.importDatabase(file);
          applyLoadedDatabase(db);
        } finally {
          setIsLoading(false);
        }
      },
      importDatabaseFromJson: async (payload) => {
        setIsLoading(true);
        try {
          const db = await databaseService.importDatabaseFromJson(payload);
          applyLoadedDatabase(db);
          return db;
        } finally {
          setIsLoading(false);
        }
      },
      restoreFromCloudPayload: async (payload, cloudAssets) => {
        setIsLoading(true);
        try {
          return await restoreClassroomFromCloudPayload({
            payload,
            cloudAssets,
            cancelPendingSaveForClassroom: cancelPendingSaveForClassroom,
            applyLoadedDatabase,
          });
        } finally {
          setIsLoading(false);
        }
      },
      renameDatabase: async (newClassName, newSchoolYear) => {
        if (!data) return;
        setIsLoading(true);
        try {
          const persisted = await persistNow();
          if (!persisted) {
            throw new Error("Không thể lưu dữ liệu. Vui lòng thử lại.");
          }
          const db = await databaseService.renameClassroomDatabase(
            data.metadata.id,
            newClassName,
            newSchoolYear,
          );
          applyLoadedDatabase(db);
          await syncClassroomIdentityToCloud(db);
        } finally {
          setIsLoading(false);
        }
      },
      duplicateDatabase: async (sourceId, newClassName, newSchoolYear, mode, options) => {
        setIsLoading(true);
        try {
          if (dataRef.current) {
            const persisted = await persistNow();
            if (!persisted) {
              throw new Error("Không thể lưu dữ liệu. Vui lòng thử lại.");
            }
          }
          const db = await databaseService.duplicateDatabase(
            sourceId,
            newClassName,
            newSchoolYear,
            mode,
            options,
          );
          if (options?.activate !== false) {
            applyLoadedDatabase(db);
          }
          if (isCloudBackupEnabledForDatabase(db) && (await isCloudBackupConfigured())) {
            await scheduleFirstCloudBackup(db);
          } else {
            await syncRegistryAfterChange();
          }
          setClassroomListEpoch((epoch) => epoch + 1);
          return db;
        } finally {
          setIsLoading(false);
        }
      },
      updateClassroomInfo: async (id, info) => {
        const updated = await databaseService.updateClassroomInfo(id, info);
        if (dataRef.current?.metadata.id === id) {
          applyLoadedDatabase(updated);
        }
        await syncClassroomIdentityToCloud(updated);
      },
      archiveClassroom: async (id) => {
        if (dataRef.current?.metadata.id === id) {
          const persisted = await persistNow();
          if (!persisted) {
            throw new Error("Không thể lưu dữ liệu. Vui lòng thử lại.");
          }
        }
        await databaseService.setClassroomArchived(id, true);
        await syncRegistryAfterChange();
        if (dataRef.current?.metadata.id === id) {
          const list = await databaseService.listDatabases();
          const next = list.find((entry) => !entry.archived);
          if (next) {
            const generation = ++switchGenerationRef.current;
            const db = await openClassroomById(next.id, generation);
            if (generation !== switchGenerationRef.current) return;
            applyLoadedDatabase(db);
            if (db) {
              await cloudBackupScheduler.checkStartupBackup(db);
            } else {
              setHydrateErrors((prev) => ({
                ...prev,
                [next.id]: "Không thể tải lớp học từ đám mây.",
              }));
            }
          } else {
            applyLoadedDatabase(null);
          }
        }
      },
      restoreClassroom: async (id) => {
        await databaseService.setClassroomArchived(id, false);
        await syncRegistryAfterChange();
      },
      deleteDatabase: async (id) => {
        setIsLoading(true);
        try {
          if (data?.metadata.id === id) {
            const persisted = await persistNow();
            if (!persisted) return;
          }
          await databaseService.deleteDatabase(id);
          await syncRegistryAfterChange({ markDeletedKey: id });
          if (data?.metadata.id === id) {
            applyLoadedDatabase(null);
          }
        } finally {
          setIsLoading(false);
        }
      },
      updateClassroomSettings: (settings) =>
        setData((current) => ({
          ...current,
          classroomSettings: { ...settings, updatedAt: new Date().toISOString() },
        })),
      updateAppSettings: (updates) =>
        setData((current) => ({
          ...current,
          appSettings: { ...current.appSettings, ...updates },
        })),
      updateTeacherProfile: (teacherUpdates) =>
        setData((current) => ({
          ...current,
          classroomSettings: {
            ...current.classroomSettings,
            teacher: {
              ...current.classroomSettings.teacher,
              ...teacherUpdates,
              updatedAt: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          },
        })),
      saveClassroomRole: (role) =>
        setData((current) => {
          const existing = current.classroomRoles.find((item) => item.id === role.id);
          const saved: ClassroomRole = {
            ...role,
            name: role.name.trim(),
            createdAt: existing?.createdAt ?? role.createdAt ?? new Date().toISOString(),
          };
          return {
            ...current,
            classroomRoles: existing
              ? current.classroomRoles.map((item) => (item.id === role.id ? saved : item))
              : [...current.classroomRoles, saved],
          };
        }),
      deleteClassroomRole: (roleId) =>
        setData((current) => ({
          ...current,
          classroomRoles: current.classroomRoles.filter((role) => role.id !== roleId),
          students: current.students.map((student) => ({
            ...student,
            classroomRoleIds: (student.classroomRoleIds ?? []).filter((id) => id !== roleId),
          })),
        })),
      saveBadge: (badge) =>
        setData((current) => {
          const existing = current.badges.find((item) => item.id === badge.id);
          const saved: Badge = {
            ...badge,
            name: badge.name.trim(),
            createdAt: existing?.createdAt ?? badge.createdAt ?? new Date().toISOString(),
          };
          return {
            ...current,
            badges: existing
              ? current.badges.map((item) => (item.id === badge.id ? saved : item))
              : [...current.badges, saved],
          };
        }),
      deleteBadge: (badgeId) =>
        setData((current) => ({
          ...current,
          badges: current.badges.filter((badge) => badge.id !== badgeId),
          students: current.students.map((student) => ({
            ...student,
            badgeIds: (student.badgeIds ?? []).filter((id) => id !== badgeId),
          })),
        })),
      toggleStudentBadge: (studentId, badgeId) =>
        setData((current) => {
          const student = current.students.find((item) => item.id === studentId);
          if (!student) return current;

          const currentIds = student.badgeIds ?? [];
          const hasBadge = currentIds.includes(badgeId);
          const now = new Date().toISOString();

          if (hasBadge) {
            return {
              ...current,
              students: current.students.map((item) =>
                item.id === studentId
                  ? {
                      ...item,
                      badgeIds: currentIds.filter((id) => id !== badgeId),
                      updatedAt: now,
                    }
                  : item,
              ),
            };
          }

          const badge = current.badges.find((item) => item.id === badgeId);
          const historyEntry = {
            id: createId("badge-award"),
            badgeId,
            badgeName: badge?.name ?? "Huy hiệu",
            badgeIcon: badge?.icon,
            studentIds: [studentId],
            createdAt: now,
          };

          return {
            ...current,
            students: current.students.map((item) =>
              item.id === studentId
                ? { ...item, badgeIds: [...currentIds, badgeId], updatedAt: now }
                : item,
            ),
            badgeAwardHistory: [historyEntry, ...(current.badgeAwardHistory ?? [])],
          };
        }),
      saveStudent: (student) => {
        const current = dataRef.current;
        const existing = current?.students.find((item) => item.id === student.id);
        const previousAvatarKey =
          existing?.avatarAssetKey && existing.avatarAssetKey !== student.avatarAssetKey
            ? existing.avatarAssetKey
            : undefined;

        setData((prev) => {
          const now = new Date().toISOString();
          const saved: Student = {
            ...student,
            name: student.name.trim(),
            avatar: undefined,
            classroomRole: undefined,
            classroomRoleIds: student.classroomRoleIds ?? existing?.classroomRoleIds ?? [],
            badgeIds: student.badgeIds ?? existing?.badgeIds ?? [],
            points: existing?.points ?? student.points,
            totalRewards: existing?.totalRewards ?? student.totalRewards,
            createdAt: existing?.createdAt ?? student.createdAt ?? now,
            updatedAt: now,
          };

          let students = existing
            ? prev.students.map((item) => (item.id === student.id ? saved : item))
            : [...prev.students, saved];

          let teams = prev.teams;
          if (existing?.teamId !== saved.teamId) {
            teams = clearStudentLeadershipFromTeams(teams, saved.id);
          }
          teams = sanitizeAllTeamLeadership(teams, students);

          return { ...prev, students, teams };
        });

        if (student.avatarAssetKey) {
          markDirtyAsset(student.avatarAssetKey);
        }

        void (async () => {
          if (!current || !previousAvatarKey) return;
          const persisted = await persistNow();
          if (!persisted) return;
          try {
            await classroomAssetService.deleteAsset(current.metadata.id, previousAvatarKey);
            markDirtyAsset(previousAvatarKey);
          } catch (error) {
            console.warn("[saveStudent] failed to remove replaced avatar", error);
          }
        })();
      },
      saveStudents: (studentsToSave) =>
        setData((current) => {
          if (studentsToSave.length === 0) return current;

          const now = new Date().toISOString();
          const byId = new Map(studentsToSave.map((student) => [student.id, student]));
          let leadershipChanged = false;

          let students = current.students.map((item) => {
            const incoming = byId.get(item.id);
            if (!incoming) return item;

            const saved: Student = {
              ...incoming,
              name: incoming.name.trim(),
              classroomRoleIds: incoming.classroomRoleIds ?? item.classroomRoleIds ?? [],
              badgeIds: incoming.badgeIds ?? item.badgeIds ?? [],
              points: item.points,
              totalRewards: item.totalRewards,
              createdAt: item.createdAt,
              updatedAt: now,
            };

            if (item.teamId !== saved.teamId) {
              leadershipChanged = true;
            }
            return saved;
          });

          for (const student of studentsToSave) {
            if (!current.students.some((item) => item.id === student.id)) {
              const saved: Student = {
                ...student,
                name: student.name.trim(),
                classroomRoleIds: student.classroomRoleIds ?? [],
                badgeIds: student.badgeIds ?? [],
                points: student.points ?? 0,
                totalRewards: student.totalRewards ?? 0,
                createdAt: student.createdAt ?? now,
                updatedAt: now,
              };
              students = [...students, saved];
            }
          }

          let teams = current.teams;
          if (leadershipChanged) {
            for (const student of studentsToSave) {
              teams = clearStudentLeadershipFromTeams(teams, student.id);
            }
          }
          teams = sanitizeAllTeamLeadership(teams, students);

          return { ...current, students, teams };
        }),
      deleteStudent: async (studentId) => {
        const current = dataRef.current;
        if (!current) return;
        const student = current.students.find((item) => item.id === studentId);
        const avatarKey = student?.avatarAssetKey;
        const classroomId = current.metadata.id;

        setData((prev) => {
          const luckyWheelHistory = (prev.luckyWheelHistory ?? [])
            .map((entry) => {
              const ids = entry.studentIds?.length ? entry.studentIds : [entry.studentId];
              const remainingIds = ids.filter((id) => id !== studentId);
              if (remainingIds.length === 0) return null;
              return {
                ...entry,
                studentId: remainingIds[0],
                studentIds: remainingIds,
              };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

          const duckRaceHistory = (prev.duckRaceHistory ?? [])
            .map((entry) => {
              const remainingParticipants = entry.participantIds.filter((id) => id !== studentId);
              if (remainingParticipants.length === 0) return null;
              const winnerIds = (entry.winnerIds?.length ? entry.winnerIds : [entry.winnerId]).filter(
                (id) => id !== studentId,
              );
              if (winnerIds.length === 0) return null;
              return {
                ...entry,
                winnerId: winnerIds[0],
                winnerIds,
                participantIds: remainingParticipants,
              };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

          const badgeAwardHistory = (prev.badgeAwardHistory ?? [])
            .map((entry) => {
              const remainingIds = entry.studentIds.filter((id) => id !== studentId);
              if (remainingIds.length === 0) return null;
              return { ...entry, studentIds: remainingIds };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

          const attendanceRecords = (prev.attendanceRecords ?? []).map((record) => ({
            ...record,
            rosterStudentIds: record.rosterStudentIds.filter((id) => id !== studentId),
            entries: record.entries.filter((entry) => entry.studentId !== studentId),
          }));

          return {
            ...prev,
            students: prev.students.filter((item) => item.id !== studentId),
            teams: clearStudentLeadershipFromTeams(prev.teams, studentId),
            pointHistory: prev.pointHistory.filter((item) => item.studentId !== studentId),
            rewardHistory: prev.rewardHistory.filter((item) => item.studentId !== studentId),
            recognitions: prev.recognitions.filter((item) => item.studentId !== studentId),
            luckyWheelHistory,
            duckRaceHistory,
            badgeAwardHistory,
            attendanceRecords,
            wheelStudentBag: prev.wheelStudentBag.filter((id) => id !== studentId),
            duckRaceStudentBag: (prev.duckRaceStudentBag ?? []).filter((id) => id !== studentId),
            pointsWheelStudentBag: (prev.pointsWheelStudentBag ?? []).filter((id) => id !== studentId),
            seatingChartConfig: prev.seatingChartConfig
              ? removeStudentFromAllSeats(prev.seatingChartConfig, studentId)
              : prev.seatingChartConfig,
          };
        });

        const persisted = await persistNow();
        if (!persisted) return;

        if (avatarKey) {
          try {
            await classroomAssetService.deleteAsset(classroomId, avatarKey);
            markDirtyAsset(avatarKey);
          } catch (error) {
            console.warn("[deleteStudent] failed to remove avatar asset", error);
          }
        }
      },
      saveTeam: (team) =>
        setData((current) => {
          const existing = current.teams.find((item) => item.id === team.id);
          const now = new Date().toISOString();
          const memberIds = new Set(
            current.students.filter((student) => student.teamId === team.id).map((student) => student.id),
          );
          const saved = sanitizeTeamLeadership(
            {
              ...team,
              name: team.name.trim(),
              createdAt: existing?.createdAt ?? team.createdAt ?? now,
              updatedAt: now,
            },
            memberIds,
          );
          return {
            ...current,
            teams: existing ? current.teams.map((item) => (item.id === team.id ? saved : item)) : [...current.teams, saved],
          };
        }),
      deleteTeam: (teamId) =>
        setData((current) => ({
          ...current,
          teams: current.teams.filter((team) => team.id !== teamId),
          students: current.students.map((student) =>
            student.teamId === teamId ? { ...student, teamId: undefined } : student,
          ),
          teamScoreHistory: current.teamScoreHistory.filter((item) => item.teamId !== teamId),
        })),
      updateTeamScore: (teamId, delta, note) =>
        setData((current) => {
          const history: TeamScoreHistory = {
            id: createId("team-score"),
            teamId,
            points: delta,
            actionName: delta > 0 ? "Cộng điểm tổ" : "Trừ điểm tổ",
            createdAt: new Date().toISOString(),
            note,
          };
          return {
            ...current,
            teams: current.teams.map((team) =>
              team.id === teamId ? { ...team, score: team.score + delta, updatedAt: history.createdAt } : team,
            ),
            teamScoreHistory: [history, ...current.teamScoreHistory],
          };
        }),
      resetTeamScore: (teamId) =>
        setData((current) => {
          const team = current.teams.find((item) => item.id === teamId);
          const now = new Date().toISOString();
          const history: TeamScoreHistory = {
            id: createId("team-score"),
            teamId,
            points: -(team?.score ?? 0),
            actionName: "Đặt lại điểm tổ",
            createdAt: now,
          };
          return {
            ...current,
            teams: current.teams.map((item) => (item.id === teamId ? { ...item, score: 0, updatedAt: now } : item)),
            teamScoreHistory: [history, ...current.teamScoreHistory],
          };
        }),
      savePointAction: (action) =>
        setData((current) => ({
          ...current,
          pointActions: current.pointActions.some((item) => item.id === action.id)
            ? current.pointActions.map((item) => (item.id === action.id ? { ...action, name: action.name.trim() } : item))
            : [...current.pointActions, { ...action, name: action.name.trim(), isActive: action.isActive ?? true }],
        })),
      deletePointAction: (actionId) =>
        setData((current) => ({
          ...current,
          pointActions: current.pointActions.filter((action) => action.id !== actionId),
        })),
      applyPoints: (studentId, action, note, source = "action") =>
        setData((current) => {
          const now = new Date().toISOString();
          const history: PointHistory = {
            id: createId("points"),
            studentId,
            actionId: action.id,
            actionName: action.name,
            points: action.points,
            source,
            createdAt: now,
            note,
          };
          return {
            ...current,
            students: current.students.map((student) =>
              student.id === studentId
                ? { ...student, points: student.points + action.points, updatedAt: now }
                : student,
            ),
            pointHistory: [history, ...current.pointHistory],
          };
        }),
      saveGift: async (gift, options) => {
        const current = dataRef.current;
        if (!current) return;
        const existing = current.rewards.find((item) => item.id === gift.id);
        const previousImagePath =
          options?.previousImagePath ??
          (existing?.imagePath && existing.imagePath !== gift.imagePath ? existing.imagePath : undefined);
        const classroomId = current.metadata.id;
        const now = new Date().toISOString();
        const saved = normalizeGift({
          ...gift,
          createdAt: existing?.createdAt ?? gift.createdAt ?? now,
          updatedAt: now,
        });
        const next: ClassroomDatabase = {
          ...current,
          rewards: existing
            ? current.rewards.map((item) => (item.id === gift.id ? saved : item))
            : [...current.rewards, saved],
          metadata: { ...current.metadata, updatedAt: now },
        };

        commitData(next);
        const persisted = await persistNow();
        if (!persisted) {
          throw new Error("Không thể lưu dữ liệu. Vui lòng thử lại.");
        }
        if (previousImagePath && previousImagePath !== gift.imagePath) {
          try {
            await classroomAssetService.deleteAsset(classroomId, previousImagePath);
            markDirtyAsset(previousImagePath);
          } catch (error) {
            console.warn("[saveGift] failed to remove replaced image file", error);
          }
        }
        if (gift.imagePath) {
          markDirtyAsset(gift.imagePath);
        }
      },
      deleteGift: async (giftId) => {
        const current = dataRef.current;
        if (!current) return;
        const gift = current.rewards.find((item) => item.id === giftId);
        const classroomId = current.metadata.id;
        const now = new Date().toISOString();
        const next: ClassroomDatabase = {
          ...current,
          rewards: current.rewards.filter((item) => item.id !== giftId),
          metadata: { ...current.metadata, updatedAt: now },
        };

        commitData(next);
        const persisted = await persistNow();
        if (!persisted) {
          throw new Error("Không thể lưu dữ liệu. Vui lòng thử lại.");
        }
        if (!gift?.imagePath) return;

        try {
          await classroomAssetService.deleteAsset(classroomId, gift.imagePath);
          markDirtyAsset(gift.imagePath);
        } catch (error) {
          console.warn("[deleteGift] failed to remove image file", error);
        }
      },
      redeemGift: (studentId, giftId) => {
        const current = dataRef.current;
        if (!current) return false;
        const result = buildRedeemGiftUpdate(current, studentId, giftId);
        if ("error" in result) return false;
        setData(() => result.next);
        return true;
      },
      saveRecognitionTitle: (title) =>
        setData((current) => {
          const existing = current.recognitionTitles.find((item) => item.id === title.id);
          const now = new Date().toISOString();
          const draft: RecognitionTitle = {
            ...title,
            name: title.name.trim(),
            isActive: title.isActive ?? true,
            createdAt: existing?.createdAt ?? title.createdAt ?? now,
          };
          const { title: linkedTitle, badges } = ensureBadgeForTitle(draft, current.badges);
          return {
            ...current,
            badges,
            recognitionTitles: existing
              ? current.recognitionTitles.map((item) => (item.id === title.id ? linkedTitle : item))
              : [...current.recognitionTitles, linkedTitle],
          };
        }),
      deleteRecognitionTitle: (titleId) =>
        setData((current) => {
          const hasHistory = current.recognitions.some((item) => item.titleId === titleId);
          if (hasHistory) {
            return {
              ...current,
              recognitionTitles: current.recognitionTitles.map((title) =>
                title.id === titleId ? { ...title, isActive: false } : title,
              ),
            };
          }
          return {
            ...current,
            recognitionTitles: current.recognitionTitles.filter((title) => title.id !== titleId),
          };
        }),
      recognizeStudents: (input) => {
        let created: Recognition[] = [];
        setData((current) => {
          const result = buildRecognizeStudentsUpdate(current, input);
          if (!result) return current;
          created = result.created;
          return {
            ...result.next,
            pointHistory: result.next.pointHistory,
            recognitions: result.next.recognitions,
            badgeAwardHistory: result.next.badgeAwardHistory ?? [],
          };
        });
        return created;
      },
      updateRecognitionMessage: (recognitionId, message) =>
        setData((current) => {
          const recognition = current.recognitions.find((item) => item.id === recognitionId);
          const trimmed = message.trim() || undefined;
          return {
            ...current,
            recognitions: current.recognitions.map((item) =>
              item.id === recognitionId ? { ...item, message: trimmed } : item,
            ),
            pointHistory: recognition?.pointHistoryId
              ? current.pointHistory.map((item) =>
                  item.id === recognition.pointHistoryId ? { ...item, note: trimmed } : item,
                )
              : current.pointHistory,
          };
        }),
      deleteRecognition: (recognitionId) =>
        setData((current) => {
          const recognition = current.recognitions.find((item) => item.id === recognitionId);
          if (!recognition) return current;

          let students = current.students;
          let pointHistory = current.pointHistory;

          if (recognition.pointHistoryId && recognition.awardedPoints && recognition.awardedPoints > 0) {
            const original = current.pointHistory.find((h) => h.id === recognition.pointHistoryId);
            if (original) {
              const now = new Date().toISOString();
              const reversal: PointHistory = {
                id: createId("points"),
                studentId: recognition.studentId,
                actionName: `Hoàn tác tuyên dương - ${recognition.title}`,
                points: -recognition.awardedPoints,
                source: "recognition",
                createdAt: now,
                note: "Xóa bản ghi tuyên dương",
              };
              students = students.map((s) =>
                s.id === recognition.studentId
                  ? { ...s, points: s.points - recognition.awardedPoints!, updatedAt: now }
                  : s,
              );
              pointHistory = [reversal, ...pointHistory];
            }
          }

          if (recognition.awardedBadgeId) {
            const now = new Date().toISOString();
            students = students.map((s) =>
              s.id === recognition.studentId
                ? {
                    ...s,
                    badgeIds: (s.badgeIds ?? []).filter((id) => id !== recognition.awardedBadgeId),
                    updatedAt: now,
                  }
                : s,
            );
          }

          return {
            ...current,
            students,
            pointHistory,
            recognitions: current.recognitions.filter((item) => item.id !== recognitionId),
          };
        }),
      addRecognition: (recognition) => {
        const saved: Recognition = { ...recognition, id: createId("recognition"), createdAt: new Date().toISOString() };
        setData((current) => ({
          ...current,
          recognitions: [saved, ...current.recognitions],
        }));
        return saved;
      },
      setWheelStudentBag: (bag) => setData((current) => ({ ...current, wheelStudentBag: bag })),
      setDuckRaceStudentBag: (bag) => setData((current) => ({ ...current, duckRaceStudentBag: bag })),
      setPointsWheelStudentBag: (bag) => setData((current) => ({ ...current, pointsWheelStudentBag: bag })),
      setPointsWheelConfig: (config) => setData((current) => ({ ...current, pointsWheelConfig: config })),
      setSeatingChartConfig: (config) => setData((current) => ({ ...current, seatingChartConfig: config })),
      recordLuckyWheelSelection: (studentIds) => {
        const uniqueIds = [...new Set(studentIds)].filter(Boolean);
        if (uniqueIds.length === 0) return;
        setData((current) => {
          const now = new Date().toISOString();
          const entry = {
            id: createId("wheel"),
            studentId: uniqueIds[0],
            studentIds: uniqueIds,
            createdAt: now,
          };
          return {
            ...current,
            luckyWheelHistory: [entry, ...(current.luckyWheelHistory ?? [])],
          };
        });
      },
      recordDuckRaceResult: ({ winnerId, winnerIds, participantIds }) => {
        const uniqueParticipants = [...new Set(participantIds)].filter(Boolean);
        const winners = [...new Set(winnerIds?.length ? winnerIds : [winnerId])].filter(Boolean);
        if (uniqueParticipants.length === 0 || winners.length === 0) return;
        setData((current) => {
          const now = new Date().toISOString();
          const entry = {
            id: createId("duck-race"),
            winnerId: winners[0],
            winnerIds: winners,
            participantIds: uniqueParticipants,
            createdAt: now,
          };
          return {
            ...current,
            duckRaceHistory: [entry, ...(current.duckRaceHistory ?? [])],
          };
        });
      },
      saveAttendance: async ({ date, entries, note }) => {
        if (!date) return;
        const current = dataRef.current;
        if (!current) return;
        const now = new Date().toISOString();
        const rosterStudentIds = current.students.map((student) => student.id);
        commitData({
          ...current,
          metadata: { ...current.metadata, updatedAt: now },
          attendanceRecords: upsertAttendanceRecord(current.attendanceRecords ?? [], {
            date,
            entries,
            rosterStudentIds,
            note,
          }),
        });
        const persisted = await persistNow();
        if (!persisted) {
          throw new Error("Không thể lưu điểm danh. Vui lòng thử lại.");
        }
        toastSuccess("Đã lưu điểm danh");
      },
      deleteAttendance: async (date) => {
        if (!date) return;
        const current = dataRef.current;
        if (!current) return;
        commitData({
          ...current,
          metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
          attendanceRecords: deleteAttendanceByDate(current.attendanceRecords ?? [], date),
        });
        const persisted = await persistNow();
        if (!persisted) {
          throw new Error("Không thể xóa điểm danh. Vui lòng thử lại.");
        }
      },
      persistNow,
      markDirtyAsset,
      classroomListEpoch,
      hydrateErrors,
      clearHydrateError: (id: string) => {
        setHydrateErrors((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      },
      retryHydrateClassroom,
    }),
    [data, isLoading, initError, saveError, localSaveStatus, cloudBackupState, cloudBackupError, classroomListEpoch, hydrateErrors, loadInitialDatabase, applyLoadedDatabase, openClassroomById, syncRegistryAfterChange, syncClassroomIdentityToCloud, scheduleFirstCloudBackup, setData, commitData, retrySave, retryCloudBackup, persistNow, markDirtyAsset, switchDatabase, retryHydrateClassroom],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData must be used inside AppDataProvider");
  }
  return context;
}
