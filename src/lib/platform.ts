import { getRuntimeConfig } from '@/lib/runtime-config';

function currentHost(host?: string): string {
  if (typeof host === 'string') return host;
  return typeof window !== 'undefined' ? window.location.hostname : '';
}

/** هل الموقع الحالي هو واجهة شركة (وليس الشركة الأم)؟ */
export function isCompanyHost(host = currentHost()): boolean {
  if (!host) return false;
  const cfg = getRuntimeConfig();
  if (cfg.companyHost && host === cfg.companyHost) return true;
  const suffix = cfg.companyDomainSuffix;
  if (suffix && host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length);
    return sub.length > 0 && !sub.includes('.');
  }
  return false;
}

/** هل الموقع الحالي هو واجهة الشركة الأم؟ */
export function isParentHost(host = currentHost()): boolean {
  return getRuntimeConfig().parentHosts.includes(host);
}

/** يستخرج معرف الشركة من الـ subdomain (مثال: 8UX5PDPP) أو null. */
export function getCompanyCode(host = currentHost()): string | null {
  const cfg = getRuntimeConfig();
  const suffix = cfg.companyDomainSuffix;
  if (suffix && host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length);
    if (sub && !sub.includes('.')) {
      const slug = sub.toLowerCase();
      const alias = cfg.subdomainAliases?.[slug];
      return (alias ?? sub).toUpperCase();
    }
  }
  return null;
}
