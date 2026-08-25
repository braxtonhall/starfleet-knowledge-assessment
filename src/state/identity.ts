const STORAGE_KEY = "stf.clientId.v1";

/**
 * A stable per-device id. It is what makes reconnection (spec §5.8) work: a
 * player who closes the tab and reopens the join link is recognised as the same
 * participant and gets their score back, rather than arriving as a stranger to
 * a room that has already locked.
 */
export function clientId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created = newId();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Private browsing with storage denied: identity lasts the page load, which
    // is still enough for a game that does not outlive the tab.
    return newId();
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
