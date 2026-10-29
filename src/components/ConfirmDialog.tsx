import { useEffect, useState } from "react";
import { useProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Options = { message: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean };
type Pending = Options & { resolve: (ok: boolean) => void };

let show: ((pending: Pending) => void) | null = null;

// Styled replacement for window.confirm: `if (!(await confirmDialog({ ... }))) return;`. Needs <ConfirmHost /> mounted.
export function confirmDialog(options: Options): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show({ ...options, resolve });
    else resolve(window.confirm(options.message));
  });
}

// Renders whatever confirmDialog asks for, addressing the user by the name set on the User page.
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const name = useProfile().data?.your_name?.trim();

  useEffect(() => {
    show = (next) => setPending((prev) => { prev?.resolve(false); return next; });
    return () => { show = null; };
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <Dialog open={!!pending} onOpenChange={(open) => { if (!open) close(false); }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{name ? `Are you sure, ${name}?` : "Are you sure?"}</DialogTitle>
          <DialogDescription>{pending?.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>{pending?.cancelLabel ?? "Cancel"}</Button>
          <Button variant={pending?.destructive ? "destructive" : "default"} onClick={() => close(true)} autoFocus>
            {pending?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const DISCARD: Options = { message: "You have unsaved changes. Leaving now will discard them.", confirmLabel: "Discard changes", cancelLabel: "Keep editing", destructive: true };
