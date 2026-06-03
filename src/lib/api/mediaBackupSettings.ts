import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface MediaBackupSettingsDto {
  mediaRootPath?: string | null;
  includeDatabaseBackup: boolean;
  syncDatabaseBackupToR2: boolean;
  serverDatabaseBackupKeepCount: number;
  r2DatabaseBackupKeepCount: number;
  includeVoucherData: boolean;
  includeAttachments: boolean;
  autoBackupEnabled: boolean;
  autoBackupCron?: string | null;
  autoBackupScheduleDescription?: string | null;
  nextAutoBackupAtUtc?: string | null;
  lastScheduledRunAtUtc?: string | null;
  retentionYears: number;
  lastRunStatus: string;
  lastRunError?: string | null;
  lastRunAtUtc?: string | null;
  lastRunYearFolder?: string | null;
  isRunning: boolean;
  updatedAtUtc?: string | null;
  updatedBy?: string | null;
}

export interface MediaBackupModuleResultDto {
  code: string;
  entryCount: number;
  attachmentCount: number;
  sizeBytes: number;
  dataFile?: string | null;
}

export interface MediaBackupRunResultDto {
  success: boolean;
  message?: string | null;
  yearFolder: string;
  rootPath: string;
  totalSizeBytes: number;
  databaseFile?: string | null;
  databaseSyncedToR2?: boolean;
  databaseR2Key?: string | null;
  localDatabaseBackupsPurged?: number;
  r2DatabaseBackupsPurged?: number;
  modules: MediaBackupModuleResultDto[];
  manifestFile?: string | null;
}

export interface DatabaseBackupFileDto {
  yearFolder: string;
  fileName: string;
  sizeBytes: number;
  createdAtUtc: string;
}

export interface R2DatabaseBackupFileDto {
  r2Key: string;
  yearFolder: string;
  fileName: string;
  sizeBytes: number;
  createdAtUtc: string;
}

export const mediaBackupSettingsApi = {
  get: async (): Promise<MediaBackupSettingsDto> => {
    const res = await api.get<ApiResponse<MediaBackupSettingsDto>>('/settings/media-backup');
    return res.data.data!;
  },

  update: async (payload: Partial<{
    mediaRootPath: string;
    includeDatabaseBackup: boolean;
    syncDatabaseBackupToR2: boolean;
    serverDatabaseBackupKeepCount: number;
    r2DatabaseBackupKeepCount: number;
    includeVoucherData: boolean;
    includeAttachments: boolean;
    autoBackupEnabled: boolean;
    autoBackupCron: string;
    retentionYears: number;
  }>): Promise<MediaBackupSettingsDto> => {
    const res = await api.put<ApiResponse<MediaBackupSettingsDto>>('/settings/media-backup', payload);
    return res.data.data!;
  },

  testPath: async (mediaRootPath?: string): Promise<{ success: boolean; message: string }> => {
    const res = await api.post<{ success: boolean; message: string }>(
      '/settings/media-backup/test-path',
      { mediaRootPath },
    );
    return res.data;
  },

  run: async (fiscalYearId: number): Promise<MediaBackupRunResultDto> => {
    const res = await api.post<ApiResponse<MediaBackupRunResultDto>>(
      '/settings/media-backup/run',
      { fiscalYearId },
      { timeout: 600_000, skipGlobalErrorHandler: true },
    );
    return res.data.data!;
  },

  listDatabaseFiles: async (): Promise<DatabaseBackupFileDto[]> => {
    const res = await api.get<ApiResponse<DatabaseBackupFileDto[]>>('/settings/media-backup/database-files');
    return res.data.data ?? [];
  },

  listR2DatabaseFiles: async (): Promise<R2DatabaseBackupFileDto[]> => {
    const res = await api.get<ApiResponse<R2DatabaseBackupFileDto[]>>('/settings/media-backup/r2-database-files');
    return res.data.data ?? [];
  },

  applyR2Retention: async (): Promise<{ purgedCount: number }> => {
    const res = await api.post<{ success: boolean; purgedCount: number }>(
      '/settings/media-backup/r2-database-files/apply-retention',
    );
    return { purgedCount: res.data.purgedCount ?? 0 };
  },

  downloadDatabaseFile: async (file: DatabaseBackupFileDto): Promise<void> => {
    const res = await api.get<Blob>(
      '/settings/media-backup/database-files/download',
      {
        params: { yearFolder: file.yearFolder, fileName: file.fileName },
        responseType: 'blob',
        timeout: 3_600_000,
        skipGlobalErrorHandler: true,
      },
    );

    const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
    if (contentType.includes('json')) {
      const text = await res.data.text();
      let message = 'تعذّر تنزيل الملف';
      try {
        const body = JSON.parse(text) as { message?: string };
        message = body.message ?? message;
      } catch { /* ignore */ }
      throw new Error(message);
    }

    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
