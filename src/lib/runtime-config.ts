/* ════════════════════════════════════════════════════════════════════
   قارئ إعدادات وقت التشغيل
   يقرأ window.__ITC_CONFIG__ (المُعرَّف في /runtime-config.js) ويدمجه
   فوق قيم افتراضية آمنة. هكذا يمكن تغيير السيرفر/الدومين على السيرفر
   مباشرةً دون إعادة بناء الواجهة.
   ════════════════════════════════════════════════════════════════════ */

export interface RuntimeConfig {
  parentApiBaseUrl: string;
  companyApiBaseUrl: string;
  parentHosts: string[];
  companyHost: string;
  companyDomainSuffix: string;
  /** subdomain مخصص → CompanyCode، مثل ali → Y46N8C23 */
  subdomainAliases?: Record<string, string>;
}

const DEFAULTS: RuntimeConfig = {
  parentApiBaseUrl: 'https://api-iraqitradecenter.gcc.iq/api',
  companyApiBaseUrl: 'https://api_iraqitradecenter_company.gcc.iq/api',
  parentHosts: ['iraqitradecenter.gcc.iq', 'parent.iraqitradecenter.gcc.iq'],
  companyHost: 'iraqitradecenter_company.gcc.iq',
  companyDomainSuffix: '.iraqi-trade-center.iq',
};

declare global {
  interface Window {
    __ITC_CONFIG__?: Partial<RuntimeConfig>;
  }
}

let cached: RuntimeConfig | null = null;

export function getRuntimeConfig(): RuntimeConfig {
  if (cached) return cached;
  const injected = (typeof window !== 'undefined' && window.__ITC_CONFIG__) || {};
  cached = {
    parentApiBaseUrl: injected.parentApiBaseUrl || DEFAULTS.parentApiBaseUrl,
    companyApiBaseUrl: injected.companyApiBaseUrl || DEFAULTS.companyApiBaseUrl,
    parentHosts: (injected.parentHosts && injected.parentHosts.length ? injected.parentHosts : DEFAULTS.parentHosts),
    companyHost: injected.companyHost || DEFAULTS.companyHost,
    companyDomainSuffix: injected.companyDomainSuffix || DEFAULTS.companyDomainSuffix,
    subdomainAliases: injected.subdomainAliases,
  };
  return cached;
}
