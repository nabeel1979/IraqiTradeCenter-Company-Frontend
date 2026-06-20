/* ════════════════════════════════════════════════════════════════════
   إعدادات وقت التشغيل (Runtime Config)
   ────────────────────────────────────────────────────────────────────
   هذا الملف يُحمَّل قبل التطبيق ويُقرأ منه روابط الـ API والنطاقات.
   يمكن تعديله مباشرة على السيرفر دون إعادة بناء الواجهة عند تغيير
   السيرفر أو الدومين. لا تُعِد تسمية المتغيّر window.__ITC_CONFIG__.
   ════════════════════════════════════════════════════════════════════ */
window.__ITC_CONFIG__ = {
  /* رابط API للشركة الأم */
  parentApiBaseUrl: "https://api-iraqitradecenter.gcc.iq/api",

  /* رابط API المشترك لكل الشركات (نطاق واحد، قواعد متعددة بتحليل المستأجر) */
  companyApiBaseUrl: "https://api-iraqitradecenter.gcc.iq/api",

  /* نطاقات الشركة الأم */
  parentHosts: ["iraqitradecenter.gcc.iq", "parent.iraqitradecenter.gcc.iq"],

  /* نطاق الشركة الثابت (إن وُجد) */
  companyHost: "iraqitradecenter_company.gcc.iq",

  /* لاحقة نطاقات الشركات: {code}.iraqi-trade-center.iq */
  companyDomainSuffix: ".iraqi-trade-center.iq",

  /* نطاقات مخصصة → كود الشركة (عندما لا يطابق الـ subdomain الكود) */
  subdomainAliases: {
    ali: "Y46N8C23",
  },
};
