import { useState } from "react";
import { toast } from "sonner";
import { isEditable, useHotkey } from "@/hooks/hotkeys";

type Mutation = {
  mutate(patch: never, options: { onSuccess: () => void; onError: (err: Error) => void }): void;
  isPending: boolean;
};

// Draft/saved state for an edit page: tracks which fields changed, saves only those, and wires Escape
// (leave a focused field first, then confirm discarding) and Cmd+S, which never opens the browser's save dialog.
export function useDraftForm<K extends string>(
  keys: readonly K[],
  initial: Record<K, string>,
  { update, valid = () => true, toPatch = (_key, value) => value, onSaved, onLeave }: {
    update: Mutation;
    valid?: (draft: Record<K, string>) => boolean;
    toPatch?: (key: K, value: string) => unknown;
    onSaved?: () => void;
    onLeave: () => void;
  },
) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);

  const set = (key: K) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const changed = keys.filter((k) => draft[k] !== saved[k]);
  const canSave = changed.length > 0 && !update.isPending && valid(draft);

  const save = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    const patch = Object.fromEntries(changed.map((k) => [k, toPatch(k, draft[k])]));
    update.mutate(patch as never, {
      onSuccess: () => {
        setSaved(draft);
        onSaved?.();
        toast.success("Saved");
      },
      onError: (err) => toast.error(err.message),
    });
  };

  useHotkey("Escape", (e) => {
    if (isEditable(e.target)) return (e.target as HTMLElement).blur();
    if (changed.length > 0 && !window.confirm("Discard unsaved changes?")) return;
    onLeave();
  });

  useHotkey("s", (e) => {
    e.preventDefault();
    if (canSave) save();
  }, { mod: true });

  return { draft, setDraft, saved, setSaved, set, changed, canSave, save };
}
