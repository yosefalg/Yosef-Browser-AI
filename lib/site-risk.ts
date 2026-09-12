export type SiteRiskLevel = 'safe' | 'caution' | 'danger';

export type SiteRiskAssessment = {
  level: SiteRiskLevel;
  score: number;
  reasons: string[];
  host: string;
};

const SENSITIVE_PATH_RE = /\b(?:login|signin|sign-in|account|verify|verification|wallet|bank|payment|checkout|password|passcode|otp|2fa)\b/i;
const SUSPICIOUS_TOKEN_RE = /(?:secure|verify|verification|support|update|account|wallet|bank|payment|bonus|gift|free|login)/gi;
const BRAND_LOOKALIKE_RE = /(?:paypa[l1]|faceb[o0]{2}k|g[o0]{2}gle|micr[o0]soft|ap[p1]le|amaz[o0]n|instagr[a4]m|whats[a4]pp)/i;

function isIpHost(host: string) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith('[');
}

function hasPunycode(host: string) {
  return host.split('.').some((label) => label.startsWith('xn--'));
}

function tokenDensity(host: string) {
  const matches = host.match(SUSPICIOUS_TOKEN_RE);
  return matches ? matches.length : 0;
}

export function assessSiteRisk(value: string): SiteRiskAssessment {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const reasons: string[] = [];
    let score = 0;

    if (url.protocol === 'http:') {
      score += 2;
      reasons.push('الاتصال غير مشفّر (HTTP)');
    }

    if (hasPunycode(host)) {
      score += 3;
      reasons.push('اسم النطاق يستخدم Punycode وقد يكون مشابهًا بصريًا لنطاق معروف');
    }

    if (isIpHost(host)) {
      score += SENSITIVE_PATH_RE.test(url.pathname + url.search) ? 4 : 1;
      reasons.push('الموقع يستخدم عنوان IP بدل اسم نطاق عادي');
    }

    if (BRAND_LOOKALIKE_RE.test(host) && !/^(?:google\.com|microsoft\.com|apple\.com|amazon\.com|facebook\.com|instagram\.com|whatsapp\.com|paypal\.com)$/.test(host)) {
      score += 4;
      reasons.push('اسم النطاق يشبه اسم خدمة معروفة بطريقة غير معتادة');
    }

    if ((host.match(/-/g) || []).length >= 4) {
      score += 1;
      reasons.push('اسم النطاق يحتوي شرطات كثيرة بصورة غير معتادة');
    }

    if (tokenDensity(host) >= 3) {
      score += 2;
      reasons.push('اسم النطاق يجمع كلمات حساسة كثيرة');
    }

    if (host.length > 55) {
      score += 1;
      reasons.push('اسم النطاق طويل بصورة غير معتادة');
    }

    if (SENSITIVE_PATH_RE.test(url.pathname + url.search) && url.protocol !== 'https:') {
      score += 3;
      reasons.push('صفحة حساسة تعمل بدون HTTPS');
    }

    const level: SiteRiskLevel = score >= 5 ? 'danger' : score >= 2 ? 'caution' : 'safe';
    return { level, score, reasons, host };
  } catch {
    return { level: 'danger', score: 6, reasons: ['تعذر التحقق من عنوان الموقع بصورة سليمة'], host: value };
  }
}

export function shouldWarnBeforeNavigation(value: string) {
  return assessSiteRisk(value).level === 'danger';
}
