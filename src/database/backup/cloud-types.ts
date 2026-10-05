import type { ClassroomDatabase } from "../types";

/** Structured R2 storage format version. */
export const CLOUD_STORAGE_FORMAT = "structured-classroom-storage";
export const CLOUD_STORAGE_VERSION = 2;
export const CLOUD_REGISTRY_VERSION = 1;
export const CLOUD_FILE_VERSION = 1;
export const CLOUD_ACTIVITY_FILE_VERSION = 1;
export const CLOUD_SYNC_STATE_VERSION = 1;

export type CloudSyncDomain =
  | "classroom"
  | "students"
  | "teams"
  | "roles"
  | "recognitions"
  | "rewards"
  | "settings"
  | "catalog"
  | "attendance"
  | "activityIndex"
  | "registry"
  | `activity:${string}`;

export interface ActivityLog {
  id: string;
  type: string;
  studentId?: string;
  teamId?: string;
  title: string;
  note?: string;
  pointDelta?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CloudActivityDayFile {
  version: number;
  date: string;
  updatedAt: string;
  activities: ActivityLog[];
}

export interface CloudActivityIndexFile {
  version: number;
  updatedAt: string;
  dates: Array<{ date: string; count: number; updatedAt: string }>;
}

export interface CloudManifestFile {
  version: number;
  format: typeof CLOUD_STORAGE_FORMAT;
  classroomKey: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
  migrationComplete?: boolean;
}

export interface CloudClassroomRegistryEntry {
  key: string;
  name: string;
  schoolYear: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  /** When set and newer than updatedAt, entry is permanently deleted from the registry. */
  deletedAt?: string;
}

export interface CloudClassroomsRegistryFile {
  version: number;
  updatedAt: string;
  classrooms: CloudClassroomRegistryEntry[];
}

export interface CloudFileUpload {
  path: string;
  content: string;
  contentType?: string;
  encoding?: "base64";
}

export interface CloudSyncBatchBody {
  classroomKey: string;
  files: CloudFileUpload[];
}

export interface CloudDirtyState {
  classroom: boolean;
  students: boolean;
  teams: boolean;
  roles: boolean;
  recognitions: boolean;
  rewards: boolean;
  settings: boolean;
  catalog: boolean;
  attendance: boolean;
  activityIndex: boolean;
  activityDates: string[];
  registry: boolean;
  dirtyAssets: string[];
}

export function emptyCloudDirtyState(): CloudDirtyState {
  return {
    classroom: false,
    students: false,
    teams: false,
    roles: false,
    recognitions: false,
    rewards: false,
    settings: false,
    catalog: false,
    attendance: false,
    activityIndex: false,
    activityDates: [],
    registry: false,
    dirtyAssets: [],
  };
}

export interface CloudSyncStateEntry {
  formatVersion: number;
  fileHashes: Record<string, string>;
  migratedToStructured: boolean;
}

export type CloudFileMap = Record<string, unknown>;

export interface SplitClassroomResult {
  files: CloudFileMap;
  paths: string[];
}

export type MergedClassroomResult = ClassroomDatabase;
