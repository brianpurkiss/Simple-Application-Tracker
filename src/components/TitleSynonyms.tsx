import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { type TitleSynonym, useCreateTitleSynonym, useDeleteTitleSynonym, useTitleSynonyms, useUpdateTitleSynonym } from "@/lib/api";
import { toastError } from "@/lib/demo";

const parse = (text: string) => text.split(",").map((t) => t.trim()).filter(Boolean);
const format = (terms: string[]) => terms.join(", ");
const onError = (e: Error) => toastError(e);

// One set, edited as comma-separated text and saved when the field loses focus.
function SynonymRow({ synonym }: { synonym: TitleSynonym }) {
  const [text, setText] = useState(format(synonym.terms));
  const update = useUpdateTitleSynonym();
  const remove = useDeleteTitleSynonym();
  const commit = () => {
    if (format(parse(text)) === format(synonym.terms)) return;
    update.mutate({ id: synonym.id, terms: parse(text) }, { onError: (e) => { onError(e); setText(format(synonym.terms)); } });
  };
  return (
    <li className="flex items-center gap-2">
      <Input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      <Button variant="ghost" size="icon" title="Delete synonyms" aria-label="Delete synonyms" onClick={() => remove.mutate(synonym.id, { onError })}>
        <X />
      </Button>
    </li>
  );
}

export function TitleSynonyms() {
  const { data: synonyms = [] } = useTitleSynonyms();
  const create = useCreateTitleSynonym();
  const [draft, setDraft] = useState("");
  const newRef = useRef<HTMLInputElement>(null);
  const add = () => create.mutate(parse(draft), { onSuccess: () => setDraft(""), onError });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-muted-foreground">
          Synonyms ({synonyms.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl" onOpenAutoFocus={(e) => { e.preventDefault(); newRef.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle>Synonyms</DialogTitle>
          <DialogDescription>
            Terms that mean the same thing in a title, separated by commas. The first term is the one shown. For example:
            Software Engineer, SWE.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {synonyms.length > 0 && (
            <ul className="space-y-2">
              {synonyms.map((s) => <SynonymRow key={`${s.id}:${format(s.terms)}`} synonym={s} />)}
            </ul>
          )}
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <Input ref={newRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Representative, Rep" />
            <Button type="submit" variant="outline" disabled={parse(draft).length < 2 || create.isPending}>Add</Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
