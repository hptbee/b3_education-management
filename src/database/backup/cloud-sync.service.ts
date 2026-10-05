import type { ClassroomDatabase } from "../types";
import { backupMetadataService } from "./backup-metadata.service";
import {
  buildClassroomsRegistry,
  buildClassroomsRegistryFromSummaries,
  buildRegistryEntry,
  mergeClassroomRegistries,
  pathsForDomains,
  serializeCloudFilesForUpload,
  simpleHash,
  splitClassroomToCloudFiles,
  domainsFromDirty,
} from "./cloud-serializer";
import { collectAssetKeysForCloudSync, serializeDirtyAssetsForUpload } from "./cloud-asset-sync";
import type { CloudDirtyState, CloudSyncDomain, CloudClassroomsRegistryFile } from "./cloud-types";
import { CLOUD_SYNC_STATE_VERSION } from "./cloud-types";
import {
  getCloudBackupUrl,
  resolveEntitlementToken,
  isCloudBackupEnabledForDatabase,
} from "./cloud-backup-auth";

export interface CloudSyncUploadResult {
  uploadedPaths: string[];
  skippedPaths: string[];
}

export interface CloudSyncUploadOptions {
  allLocalClassrooms?: ClassroomDatabase[];
  registrySummaries?: Array<{
    id: string;
    className: string;
    schoolYear: string;
    createdAt: string;
    updatedAt: string;
    archived?: boolean;
    deletedAt?: string;
  }>;
  remoteRegistry?: CloudClassroomsRegistryFile | null;
  allowRegistryUpload?: boolean;
  fetchImpl?: typeof fetch;
  forceFull?: boolean;
}

export async function uploadCloudSyncBatch(
  db: ClassroomDatabase,
  dirty: CloudDirtyState,
  options?: CloudSyncUploadOptions,
): Promise<CloudSyncUploadResult> {
  const baseUrl = getCloudBackupUrl();
  if (!baseUrl || !isCloudBackupEnabledForDatabase(db)) {
    return { uploadedPaths: [], skippedPaths: [] };
  }

  const token = await resolveEntitlementToken();
  if (!token) {
    throw new Error("Cloud backup not authorized");
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const classroomKey = db.metadata.id;
  const syncState = await backupMetadataService.getCloudSyncState(classroomKey);
  const forceFull = options?.forceFull || !syncState.migratedToStructured;

  const split = splitClassroomToCloudFiles(db, { migrationComplete: true });

  let domains: CloudSyncDomain[] = domainsFromDirty(dirty);
  if (forceFull) {
    const activityDomains: CloudSyncDomain[] = split.paths
      .filter((p) => p.startsWith("activity/") && p !== "activity/index.json")
      .map((p) => `activity:${p.slice("activity/".length, -".json".length)}` as CloudSyncDomain);
    domains = [
      "classroom",
      "students",
      "teams",
      "roles",
      "recognitions",
      "rewards",
      "settings",
      "catalog",
      "activityIndex",
      ...activityDomains,
      "registry",
    ];
  }

  const paths = pathsForDomains(domains, split);
  const allActivityPaths = split.paths.filter((p) => p.startsWith("activity/") && p !== "activity/index.json");
  if (dirty.activityDates.length > 0) {
    for (const date of dirty.activityDates) {
      const path = `activity/${date}.json`;
      if (split.paths.includes(path) && !paths.includes(path)) {
        paths.push(path);
      }
    }
  }

  if (forceFull) {
    for (const path of allActivityPaths) {
      if (!paths.includes(path)) paths.push(path);
    }
  }

  const uploads = serializeCloudFilesForUpload(split.files, paths);
  const assetKeys = await collectAssetKeysForCloudSync(classroomKey, db, dirty, {
    forceFull,
    syncState,
  });
  const assetUploads = await serializeDirtyAssetsForUpload(classroomKey, assetKeys);

  const combinedUploads = [...uploads, ...assetUploads];
  const toUpload: typeof combinedUploads = [];
  const skippedPaths: string[] = [];

  for (const file of combinedUploads) {
    const hash = simpleHash(file.content);
    if (!forceFull && syncState.fileHashes[file.path] === hash) {
      skippedPaths.push(file.path);
      continue;
    }
    toUpload.push(file);
  }

  const hasRegistrySummaries =
    Boolean(options?.allLocalClassrooms?.length) || Boolean(options?.registrySummaries?.length);
  const shouldUploadRegistry =
    options?.allowRegistryUpload !== false &&
    (dirty.registry || forceFull || (toUpload.length > 0 && hasRegistrySummaries));

  if (toUpload.length === 0 && !shouldUploadRegistry) {
    return { uploadedPaths: [], skippedPaths };
  }

  let registry: string | undefined;
  if (shouldUploadRegistry) {
    let localRegistry: CloudClassroomsRegistryFile | null = null;
    if (options?.allLocalClassrooms?.length) {
      const entries = options.allLocalClassrooms.map(buildRegistryEntry);
      localRegistry = buildClassroomsRegistry(entries, db.metadata.updatedAt);
    } else if (options?.registrySummaries?.length) {
      localRegistry = buildClassroomsRegistryFromSummaries(
        options.registrySummaries,
        db.metadata.updatedAt,
      );
    } else {
      localRegistry = buildClassroomsRegistry([buildRegistryEntry(db)], db.metadata.updatedAt);
    }

    if (options?.remoteRegistry) {
      localRegistry = mergeClassroomRegistries(localRegistry, options.remoteRegistry);
    }

    registry = JSON.stringify(localRegistry, null, 2);
  }

  if (toUpload.length === 0 && !registry) {
    return { uploadedPaths: [], skippedPaths };
  }

  const body = {
    classroomKey,
    files: toUpload,
    registry,
  };

  const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/sync`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Cloud sync failed (${response.status})`);
  }

  const uploadedPaths = toUpload.map((f) => f.path);
  const nextHashes = { ...syncState.fileHashes };
  for (const file of toUpload) {
    nextHashes[file.path] = simpleHash(file.content);
  }

  await backupMetadataService.updateCloudSyncState(classroomKey, {
    formatVersion: CLOUD_SYNC_STATE_VERSION,
    fileHashes: nextHashes,
    migratedToStructured: true,
  });

  return { uploadedPaths, skippedPaths };
}

export async function uploadStructuredMigration(
  db: ClassroomDatabase,
  options?: { allLocalClassrooms?: ClassroomDatabase[]; fetchImpl?: typeof fetch },
): Promise<void> {
  const dirty: CloudDirtyState = {
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
    activityDates: [],
    registry: true,
    dirtyAssets: [],
  };
  await uploadCloudSyncBatch(db, dirty, { ...options, forceFull: true });
}

export async function uploadRegistryMerge(
  mergedRegistry: CloudClassroomsRegistryFile,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const baseUrl = getCloudBackupUrl();
  if (!baseUrl) return;

  const token = await resolveEntitlementToken();
  if (!token) {
    throw new Error("Cloud backup not authorized");
  }

  const fetchImplResolved = fetchImpl ?? fetch;
  const classroomKey = mergedRegistry.classrooms[0]?.key ?? "registry-only";
  const body = {
    classroomKey,
    files: [],
    registry: JSON.stringify(mergedRegistry, null, 2),
  };

  const response = await fetchImplResolved(`${baseUrl.replace(/\/$/, "")}/sync`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Cloud registry sync failed (${response.status})`);
  }
}
