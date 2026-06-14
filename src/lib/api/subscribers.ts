import { api, getApiBaseUrl, getToken } from './client';
import { triggerNativeDownload } from '@/lib/downloadNative';

export interface Subscriber {
  id:              number;
  dscrp:           string | null;
  databaseName:    string | null;
  authKey:         string | null;
  startDate:       string | null;
  endDate:         string | null;
  active:          number;
  adress:          string | null;
  activity:        number;
  email:           string | null;
  watsup:          string | null;
  commissionRate:  number;
  apiBaseUrl:      string | null;
  createdAt:       string | null;
  notes:           string | null;
  companyCode:     string | null;
  domain:          string | null;
  storeDomain:     string | null;
  dbDataPath:      string | null;
  dbLogPath:       string | null;
  dbProvisioned:   boolean;
  dbProvisionedAt: string | null;
  feAppPool:       string | null;
  feSiteName:      string | null;
  fePath:          string | null;
  feServer:        string | null;
  beAppPool:       string | null;
  beSiteName:      string | null;
  bePath:          string | null;
  beServer:        string | null;
}

export interface SubscriberDto {
  dscrp?:           string;
  databaseName?:    string;
  authKey?:         string;
  startDate?:       string;
  endDate?:         string;
  active?:          number;
  adress?:          string;
  activity?:        number;
  email?:           string;
  watsup?:          string;
  commissionRate?:  number;
  apiBaseUrl?:      string;
  notes?:           string;
  companyCode?:     string;
  domain?:          string;
  storeDomain?:     string;
  dbDataPath?:      string;
  dbLogPath?:       string;
  feAppPool?:       string;
  feSiteName?:      string;
  fePath?:          string;
  feServer?:        string;
  beAppPool?:       string;
  beSiteName?:      string;
  bePath?:          string;
  beServer?:        string;
}

export interface FiscalYearOption { id: number; name: string; }

/** إعدادات النسخ الاحتياطي + أرشيف المرفقات — مخزّنة داخل قاعدة الشركة نفسها، تُدار من الأم */
export interface CompanyMediaSettings {
  provisioned:                   boolean;
  databaseName:                  string | null;
  backupEnabled:                 boolean;
  includeDatabaseBackup:         boolean;
  includeVoucherData:            boolean;
  includeAttachments:            boolean;
  syncDatabaseBackupToR2:        boolean;
  serverDatabaseBackupKeepCount: number;
  r2DatabaseBackupKeepCount:     number;
  backupPath:                    string | null;
  backupCron:                    string | null;
  scheduleDescription:           string | null;
  nextRunAtUtc:                  string | null;
  retentionYears:                number;
  lastRunStatus:                 string;
  lastRunAtUtc:                  string | null;
  lastRunYearFolder:             string | null;
  lastRunError:                  string | null;
  attachProvider:                string;   // 'Local' | 'R2'
  attachLocalPath:               string | null;
  r2AccountId:                   string | null;
  r2Bucket:                      string | null;
  r2HasAccessKey:                boolean;
  r2HasSecret:                   boolean;
  fiscalYears:                   FiscalYearOption[];
}

export interface CompanyMediaSettingsInput {
  backupEnabled?:                 boolean;
  includeDatabaseBackup?:         boolean;
  includeVoucherData?:            boolean;
  includeAttachments?:            boolean;
  syncDatabaseBackupToR2?:        boolean;
  serverDatabaseBackupKeepCount?: number;
  r2DatabaseBackupKeepCount?:     number;
  backupPath?:                    string;
  backupCron?:                    string;
  retentionYears?:                number;
  attachProvider?:                string;
  attachLocalPath?:               string;
  r2AccountId?:                   string;
  r2Bucket?:                      string;
  r2AccessKeyId?:                 string;
  r2SecretAccessKey?:             string;
}

export interface CompanyBackupFile {
  yearFolder:   string;
  fileName:     string;
  sizeBytes:    number;
  createdAtUtc: string;
}

export interface CompanyBackupRunResult {
  success:     boolean;
  yearFolder:  string;
  fileName:    string;
  sizeBytes:   number;
  localPurged: number;
  message:     string | null;
}

export interface CompanyR2BackupFile {
  r2Key:        string;
  yearFolder:   string;
  fileName:     string;
  sizeBytes:    number;
  createdAtUtc: string;
}

/** نتيجة الأرشفة الكاملة عبر جسر التكامل مع نظام الشركة (شكلها كما يُعيده runner الشركة) */
export interface CompanyFullBackupResult {
  success?:        boolean;
  message?:        string | null;
  yearFolder?:     string;
  totalSizeBytes?: number;
  databaseFile?:   string | null;
  modules?:        { code: string; entryCount: number; attachmentCount: number; sizeBytes: number }[];
}

/** تفعيل واحد ضمن سجل تفعيلات ترخيص الشركة */
export interface CompanyActivation {
  id:           number;
  code:         string;
  days:         number;
  startDateUtc: string;
  endDateUtc:   string;
  appliedAtUtc: string;
  appliedBy:    string | null;
  source:       string;
  note:         string | null;
}

/** حالة ترخيص الشركة + سجل التفعيلات (يُقرأ من قاعدة الشركة) */
export interface CompanyLicense {
  provisioned:   boolean;
  databaseName:  string | null;
  endDateUtc:    string | null;
  daysRemaining: number;
  isActive:      boolean;
  isExpired:     boolean;
  lastCode:      string | null;
  activations:   CompanyActivation[];
}

export interface ProvisioningConfig {
  databaseNamePrefix:     string;
  templateBackupPath:     string;
  templateSourceDatabase: string;
  dbDataPath:             string;
  dbLogPath:              string;
  domainSuffix:           string;
  apiDomainPrefix:        string;
  urlScheme:              string;
  sharedAppPool:          string;
  parentDatabaseName:     string;
  codeLength:             number;
  backupFileExists:       boolean;
  resolvedTemplateBackupPath?: string | null;
  companyApiBaseUrl?:     string;
  defaultFeAppPool?:      string;
  defaultFeServer?:       string;
  defaultBeAppPool?:      string;
  defaultBeServer?:       string;
}

/** الإعدادات الافتراضية القابلة للتعديل (تُحفظ في قاعدة البيانات). */
export interface PlatformSettings {
  DatabaseNamePrefix?:     string;
  TemplateBackupPath?:     string;
  TemplateSourceDatabase?: string;
  DbDataPath?:             string;
  DbLogPath?:              string;
  DomainSuffix?:           string;
  CompanyApiBaseUrl?:      string;
  SharedAppPool?:          string;
  ParentDatabaseName?:     string;
  DefaultFeAppPool?:       string;
  DefaultFeServer?:        string;
  DefaultBeAppPool?:       string;
  DefaultBeServer?:        string;
}

export interface GeneratedCompanyIdentity {
  companyCode:            string;
  databaseName:           string;
  domain:                 string;
  storeDomain:            string;
  apiBaseUrl:             string;
  dbDataPath:             string;
  dbLogPath:              string;
  mdfPath:                string;
  ldfPath:                string;
  sharedAppPool:          string;
  parentDatabaseName:     string;
  templateBackupPath:     string;
  connectionStringPreview: string;
}

export interface DatabaseStatus {
  subscriberId:     number;
  databaseName:     string | null;
  companyCode:      string | null;
  dbProvisioned:    boolean;
  dbProvisionedAt:  string | null;
  databaseExists:   boolean;
  backupFileExists: boolean;
  mdfPath:          string | null;
  ldfPath:          string | null;
  canLinkExisting:  boolean;
  templateBackupPath?: string | null;
  resolvedTemplateBackupPath?: string | null;
}

export const subscribersApi = {
  list: (params?: { search?: string; active?: number }) =>
    api.get<{ success: boolean; data: Subscriber[] }>('/subscribers', { params }),

  get: (id: number) =>
    api.get<{ success: boolean; data: Subscriber }>(`/subscribers/${id}`),

  create: (dto: SubscriberDto) =>
    api.post<{ success: boolean; data: Subscriber }>('/subscribers', dto),

  update: (id: number, dto: SubscriberDto) =>
    api.put<{ success: boolean; data: Subscriber }>(`/subscribers/${id}`, dto),

  toggleActive: (id: number) =>
    api.patch<{ success: boolean; data: Subscriber }>(`/subscribers/${id}/toggle-active`),

  delete: (id: number) =>
    api.delete<{ success: boolean }>(`/subscribers/${id}`),

  getProvisioningConfig: () =>
    api.get<{ success: boolean; data: ProvisioningConfig }>('/subscribers/provisioning-config'),

  getSettings: () =>
    api.get<{ success: boolean; data: PlatformSettings }>('/subscribers/settings'),

  updateSettings: (settings: PlatformSettings) =>
    api.put<{ success: boolean; data: PlatformSettings }>('/subscribers/settings', settings),

  getMediaSettings: (id: number) =>
    api.get<{ success: boolean; data: CompanyMediaSettings }>(`/subscribers/${id}/media-settings`),

  updateMediaSettings: (id: number, input: CompanyMediaSettingsInput) =>
    api.put<{ success: boolean; data: CompanyMediaSettings }>(`/subscribers/${id}/media-settings`, input),

  listBackupFiles: (id: number) =>
    api.get<{ success: boolean; data: CompanyBackupFile[] }>(`/subscribers/${id}/media-backup/database-files`),

  runDatabaseBackup: (id: number, fiscalYearId: number) =>
    api.post<{ success: boolean; data: CompanyBackupRunResult }>(
      `/subscribers/${id}/media-backup/run-database`, { fiscalYearId },
      { timeout: 600_000, skipGlobalErrorHandler: true }),

  runFullBackup: (id: number, fiscalYearId: number) =>
    api.post<{ success: boolean; data: CompanyFullBackupResult }>(
      `/subscribers/${id}/media-backup/run-full`, { fiscalYearId },
      { timeout: 1_800_000, skipGlobalErrorHandler: true }),

  listR2Files: (id: number) =>
    api.get<{ success: boolean; data: CompanyR2BackupFile[] }>(`/subscribers/${id}/media-backup/r2-files`),

  applyR2Retention: (id: number) =>
    api.post<{ success: boolean; purgedCount: number }>(`/subscribers/${id}/media-backup/r2-retention`),

  getLicense: (id: number) =>
    api.get<{ success: boolean; data: CompanyLicense }>(`/subscribers/${id}/license`),

  downloadBackupFile: async (
    id: number,
    file: CompanyBackupFile,
  ) => {
    const token = getToken();
    if (!token) throw new Error('يجب تسجيل الدخول أولاً');

    let prepResp: Response;
    try {
      prepResp = await fetch(`${getApiBaseUrl()}/subscribers/${id}/media-backup/database-files/prepare-download`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ yearFolder: file.yearFolder, fileName: file.fileName }),
        cache: 'no-store',
      });
    } catch {
      throw new Error('تعذّر الاتصال بالخادم أثناء التنزيل');
    }

    if (!prepResp.ok) {
      const ct = prepResp.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const j = await prepResp.json() as { message?: string; errors?: string[] };
        throw new Error(j.message ?? j.errors?.[0] ?? `فشل التنزيل (${prepResp.status})`);
      }
      throw new Error(`فشل التنزيل (${prepResp.status})`);
    }

    const prep = await prepResp.json() as { token?: string; data?: { token?: string } };
    const dlToken = prep.token ?? prep.data?.token;
    if (!dlToken) throw new Error('تعذّر تجهيز رابط التنزيل');

    // تنزيل مباشر عبر المتصفح — بدون blob وبدون «حفظ باسم»
    triggerNativeDownload(`${getApiBaseUrl()}/subscribers/media-backup/download/${dlToken}`);
  },

  generateCode: () =>
    api.post<{ success: boolean; data: GeneratedCompanyIdentity }>('/subscribers/generate-code'),

  getDatabaseStatus: (id: number) =>
    api.get<{ success: boolean; data: DatabaseStatus }>(`/subscribers/${id}/database-status`),

  provisionDatabase: (id: number) =>
    api.post<{ success: boolean; data: { success: boolean; databaseName: string; message: string | null } }>(
      `/subscribers/${id}/provision-database`,
    ),

  linkExistingDatabase: (id: number) =>
    api.post<{ success: boolean; data: { success: boolean; databaseName: string; message: string | null } }>(
      `/subscribers/${id}/link-existing-database`,
    ),
};
