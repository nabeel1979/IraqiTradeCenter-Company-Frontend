import { api } from './client';
import type { ApiResponse } from '@/types/api';

export type DatabaseUpdatePhase =
  | 'Idle'
  | 'AwaitingConfirmation'
  | 'BackingUp'
  | 'BackupComplete'
  | 'Migrating'
  | 'Success'
  | 'Failed';

export interface DatabaseUpdateStatusDto {
  pendingUpdate: boolean;
  isLocked: boolean;
  phase: DatabaseUpdatePhase;
  message: string;
  error?: string | null;
  backupFiles?: string[];
}

export const databaseUpdateApi = {
  status: async () => {
    const res = await api.get<ApiResponse<DatabaseUpdateStatusDto>>('/system/database-update/status', {
      skipGlobalErrorHandler: true,
    });
    return res.data.data ?? {
      pendingUpdate: false,
      isLocked: false,
      phase: 'Idle' as const,
      message: '',
    };
  },

  apply: async () => {
    const res = await api.post<ApiResponse<DatabaseUpdateStatusDto>>(
      '/system/database-update/apply',
      {},
      { timeout: 15 * 60_000, skipGlobalErrorHandler: true },
    );
    return res.data;
  },
};
