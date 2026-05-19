/**
 * Shared form-validation helpers used across the app.
 * Keep these tiny and dependency-free — they are imported in many places.
 */

// PRD §AZ — accept domestic + international formats. Minimum 7 digits after stripping.
export function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  return /^[+]?[\d\s().-]+$/.test(raw.trim());
}

// PRD §9.1 — email format validation (RFC 5322 simplified)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}

// PRD §REQ-FIN — round AZN amounts to 2 decimals; preserve sign + NaN
export function roundAzn(n: number | string | null | undefined): number | null {
  if (n == null || n === '') return null;
  const v = typeof n === 'number' ? n : Number(String(n).replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100;
}

// File-size pre-upload warning helper
export function fileSizeError(file: File, maxMb: number): string | null {
  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    const actualMb = (file.size / (1024 * 1024)).toFixed(1);
    return `Fayl ${actualMb} MB — maksimum ${maxMb} MB icazə verilir`;
  }
  return null;
}
