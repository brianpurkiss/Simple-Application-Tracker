// The jobs list remembers which row is selected and the order its rows are in (per tab), so a job
// page can step to the next or previous job and the list comes back on the right row.
const SELECTED_KEY = "jobs-list-selected";
const ORDER_KEY = "jobs-list-order";

export function loadSelected() {
  try {
    const v = sessionStorage.getItem(SELECTED_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function saveSelected(id: number | null) {
  try {
    if (id === null) sessionStorage.removeItem(SELECTED_KEY);
    else sessionStorage.setItem(SELECTED_KEY, String(id));
  } catch { /* storage unavailable: selection just won't persist */ }
}

export function saveOrder(ids: number[]) {
  try {
    sessionStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  } catch { /* storage unavailable: next/previous just won't be offered */ }
}

export function loadOrder(): number[] {
  try {
    return JSON.parse(sessionStorage.getItem(ORDER_KEY) ?? "[]");
  } catch {
    return [];
  }
}
