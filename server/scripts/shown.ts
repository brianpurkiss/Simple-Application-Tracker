import path from "node:path";

// A path relative to the current folder when it's inside it, otherwise in full.
export const shown = (p: string) => {
  const rel = path.relative(process.cwd(), p);
  return rel.startsWith("..") ? p : rel;
};
