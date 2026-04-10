export type DraftData = {
  step: number;
  project: Record<string, unknown>;
  savedAt: string;
};

const KEY = "moviemaker_draft";

export function saveDraft(step: number, project: Record<string, unknown>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ step, project, savedAt: new Date().toISOString() }));
  } catch {}
}

export function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DraftData) : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
