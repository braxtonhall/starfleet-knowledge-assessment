export const QUESTIONS_PASSWORD_STORAGE_KEY = "QUESTIONS_PASSWORD";

export function checksum(value: string): string {
  let crc = 0 ^ -1;
  for (let i = 0; i < value.length; i += 1) {
    crc ^= value.charCodeAt(i);
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return String((crc ^ -1) >>> 0);
}

export function isQuestionsPassword(value: string | null): value is string {
  return Boolean(value && __QUESTIONS_PASSWORD_CHECKSUM__ && checksum(value) === __QUESTIONS_PASSWORD_CHECKSUM__);
}

export function storedQuestionsPassword(): string | null {
  const value = localStorage.getItem(QUESTIONS_PASSWORD_STORAGE_KEY);
  return isQuestionsPassword(value) ? value : null;
}

export function rememberQuestionsPassword(value: string): void {
  localStorage.setItem(QUESTIONS_PASSWORD_STORAGE_KEY, value);
}

export function clearQuestionsPassword(): void {
  localStorage.removeItem(QUESTIONS_PASSWORD_STORAGE_KEY);
}

export function removePasswordFromAddressBar(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("pw");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
