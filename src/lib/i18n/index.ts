export { default as i18n } from './config';
export type { AppLocale } from './config';
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  readStoredLocale,
  localeDirection,
} from './config';
export { useLocale } from './useLocale';
export {
  localizedName,
  localizedAccountName,
  localizedVoucherTypeName,
  localizedEntryDescription,
  accountSearchHaystack,
} from './localizedName';
