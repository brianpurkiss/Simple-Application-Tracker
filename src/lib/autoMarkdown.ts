// Best-effort structure for plain-text job postings that paste in as one flat line per paragraph:
// short unpunctuated lines become headings, runs of sentences become bullets, "Label: text" bullets
// get a bold label. Lines that are already markdown pass through untouched.

const MARKDOWN_LINE = /^(?:#{1,6}\s|[-*+]\s|>|\d+\.\s|```|\|)/;
const BULLET_GLYPH = /^(?:[•·▪●◦‣■□➤►✓✔–—]|o(?=\s))\s*/;
const ORDERED_PAREN = /^(\d+)\)\s+/;
const SECTION_WORDS =
  /^(?:about|overview|summary|the role|role|position|responsibilities|duties|requirements|qualifications|skills|experience|benefits|perks|compensation|salary|pay|location|nice to have|bonus points|preferred|what you|what we|who you|who we|why|how to apply|job description|your|our)\b/i;

type Line = { text: string; kind: "md" | "item" | "plain"; breakBefore: boolean };

const isCandidate = (l: Line) =>
  l.kind === "plain" && l.text.length <= 60 && l.text.split(/\s+/).length <= 8 && !/[.,;!?]$/.test(l.text);

// A whole-line bold ("**Benefits**") is a heading already; drop the bold along with any trailing colon.
const toHeading = (text: string) => `## ${text.replace(/^\*\*(.+)\*\*$/, "$1").replace(/:$/, "")}`;

const toItem = (text: string) => {
  const m = /^([^:.*]{1,60}):\s+(\S.*)$/.exec(text);
  return m && m[1].split(/\s+/).length <= 6 ? `- **${m[1]}:** ${m[2]}` : `- ${text}`;
};

export function autoMarkdown(input: string): string {
  const lines: Line[] = [];
  let breakBefore = false;
  let inFence = false;
  for (const raw of input.replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n")) {
    const text = raw.trim();
    if (text.startsWith("```")) inFence = !inFence;
    if (!text && !inFence) { breakBefore = true; continue; }
    if (inFence || text.startsWith("```")) lines.push({ text: raw.trimEnd(), kind: "md", breakBefore });
    else if (MARKDOWN_LINE.test(text)) lines.push({ text: raw.trimEnd(), kind: "md", breakBefore });
    else if (BULLET_GLYPH.test(text)) lines.push({ text: text.replace(BULLET_GLYPH, ""), kind: "item", breakBefore });
    else if (ORDERED_PAREN.test(text)) lines.push({ text: text.replace(ORDERED_PAREN, "$1. "), kind: "md", breakBefore });
    else lines.push({ text, kind: "plain", breakBefore });
    breakBefore = false;
  }

  // Pick headings. Within a run of consecutive short lines, a leading section word ("Benefits:") is a
  // heading; of what's left, one line or the second of two ("Remote" / "About Acme") is a heading when
  // content follows. Three or more are a list of short items.
  const heading = new Set<number>();
  for (let i = 0; i < lines.length; ) {
    if (!isCandidate(lines[i])) { i++; continue; }
    let end = i;
    while (end + 1 < lines.length && isCandidate(lines[end + 1]) && !lines[end + 1].breakBefore) end++;
    let start = i;
    if (SECTION_WORDS.test(lines[start].text) || lines[start].text.endsWith(":")) heading.add(start++);
    const left = end - start + 1;
    const next = lines[end + 1];
    if ((left === 1 || left === 2) && next && !next.text.startsWith("#")) heading.add(end);
    i = end + 1;
  }

  // Group the rest into blocks: runs of three or more plain lines become a list.
  const blocks: string[][] = [];
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    if (heading.has(i)) { blocks.push([toHeading(l.text)]); i++; continue; }
    if (l.kind === "md") {
      const block = [l.text];
      while (++i < lines.length && lines[i].kind === "md" && !lines[i].breakBefore && !heading.has(i)) block.push(lines[i].text);
      blocks.push(block);
      continue;
    }
    let end = i;
    while (end + 1 < lines.length && lines[end + 1].kind !== "md" && !lines[end + 1].breakBefore && !heading.has(end + 1)) end++;
    const run = lines.slice(i, end + 1);
    if (run.length >= 3 || run.every((r) => r.kind === "item")) blocks.push(run.map((r) => toItem(r.text)));
    else for (const r of run) blocks.push([r.kind === "item" ? toItem(r.text) : r.text]);
    i = end + 1;
  }

  return blocks.map((b) => b.join("\n")).join("\n\n");
}
