import { toDateStr, type DateStr } from './dates';
import type { Exercise, WorkSet } from './types';

// Reads free-form workout notes like:
//
//   26/10/2026
//   Lat pulldown 25x12 47.5x10 50x10
//   Bicep pull 6.8x10 14,75x10 (felt strong)
//
// A line that starts with a date begins a new day. Every other line is an
// exercise name followed by "weight x reps" sets. Text in parentheses is kept
// as a note. Anything else the reader can't understand is flagged for review.

export interface ParsedLine {
  raw: string;
  /** Exercise name as written, if the line has one. */
  name?: string;
  sets: WorkSet[];
  /** Text found in parentheses on this line. */
  notes: string[];
  /** Why the line couldn't be fully read. */
  problem?: string;
}

export interface ParsedDay {
  key: string;
  /** The day's text block, including its date line (edited text replaces it). */
  raw: string;
  date: DateStr | null;
  dateText: string;
  lines: ParsedLine[];
  /** Notes in parentheses on the date line or on their own line. */
  notes: string[];
  /** Reasons to ask the user before importing this day. */
  reasons: string[];
}

export interface ParsedNotes {
  days: ParsedDay[];
  /** Non-empty lines before the first date. */
  orphanLines: string[];
}

const DATE_RE = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b|^\s*(\d{4})-(\d{1,2})-(\d{1,2})\b/;

/** Day-first dates (26/10/2026, 26.10.26) and ISO (2026-10-26). */
export function parseDateText(text: string): { date: DateStr | null; rest: string } | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  let y: number, mo: number, d: number;
  if (m[4]) {
    y = +m[4];
    mo = +m[5];
    d = +m[6];
  } else {
    d = +m[1];
    mo = +m[2];
    y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  }
  const dt = new Date(y, mo - 1, d);
  const valid = dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  return { date: valid ? toDateStr(dt) : null, rest: text.slice(m[0].length).trim() };
}

function takeNotes(text: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  const cleaned = text.replace(/\(([^()]*)\)/g, (_, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return ' ';
  });
  return { text: cleaned, notes };
}

const SET_RE = /^(?:(\d+(?:[.,]\d+)?)\s*(?:kg)?|bw)x(\d+)$/i;

/** One exercise line → name + sets. */
export function parseExerciseLine(raw: string): ParsedLine {
  const { text, notes } = takeNotes(raw);
  // Tidy "25 x 12", "25kg×12", "25*12" into "25x12".
  const tidy = text
    .replace(/(\d|bw)\s*(?:kg)?\s*[x×*]\s*(?=\d)/gi, '$1x')
    // "9x5drop6.8x3" → "9x5 drop 6.8x3"
    .replace(/(\d)\s*drop\s*(?=\d|bw)/gi, '$1 drop ')
    .replace(/[–—]/g, ' ')
    .trim();
  const tokens = tidy.split(/[\s;]+|,\s+/).filter(Boolean);
  const nameParts: string[] = [];
  const sets: WorkSet[] = [];
  const leftovers: string[] = [];
  let dropNext = false;
  for (const t of tokens) {
    const m = SET_RE.exec(t.replace(/,$/, ''));
    if (m) {
      const set: WorkSet = { weight: m[1] ? Number(m[1].replace(',', '.')) : 0, reps: Number(m[2]) };
      if (dropNext) set.drop = true;
      dropNext = false;
      sets.push(set);
    } else if (sets.length > 0 && /^drop$/i.test(t)) {
      dropNext = true;
    } else if (sets.length === 0) {
      nameParts.push(t);
    } else {
      leftovers.push(t);
    }
  }
  const name = nameParts.join(' ').replace(/[:\-–]+$/, '').trim() || undefined;
  let problem: string | undefined;
  if (sets.length === 0 && name) problem = 'No sets found (expected something like 50x10)';
  else if (sets.length > 0 && !name) problem = 'Sets without an exercise name';
  else if (leftovers.length) problem = `Couldn't read “${leftovers.join(' ')}”`;
  else if (dropNext) problem = '“drop” at the end without a weight x reps after it';
  if (!name && sets.length === 0 && notes.length === 0) problem = 'Couldn’t read this line';
  return { raw, name, sets, notes, problem };
}

/** A day block: first line is the date line. */
export function parseDayBlock(raw: string, key: string): ParsedDay {
  const lines = raw.split(/\r?\n/);
  const first = lines[0] ?? '';
  const dt = parseDateText(first);
  const dateNotes = dt ? takeNotes(dt.rest) : { text: '', notes: [] };
  const notes = [...dateNotes.notes];
  const reasons: string[] = [];
  if (!dt || !dt.date) reasons.push(`“${first.trim()}” is not a valid date`);
  if (dateNotes.text.trim()) notes.push(dateNotes.text.trim());

  const parsed: ParsedLine[] = [];
  for (const l of lines.slice(1)) {
    if (!l.trim()) continue;
    const p = parseExerciseLine(l);
    if (!p.name && p.sets.length === 0 && p.notes.length > 0 && !p.problem) {
      notes.push(...p.notes); // a line that is only "(…)"
      continue;
    }
    parsed.push(p);
  }
  const hasNote = notes.length > 0 || parsed.some((p) => p.notes.length > 0);
  if (hasNote) reasons.push('Has a note');
  const problems = parsed.filter((p) => p.problem).length;
  if (problems) reasons.push(problems === 1 ? '1 line couldn’t be read' : `${problems} lines couldn’t be read`);
  if (parsed.every((p) => p.sets.length === 0)) reasons.push('No sets found');

  return { key, raw, date: dt?.date ?? null, dateText: first.trim(), lines: parsed, notes, reasons };
}

export function parseNotes(text: string): ParsedNotes {
  const lines = text.replace(/ /g, ' ').split(/\r?\n/);
  const blocks: string[][] = [];
  const orphanLines: string[] = [];
  for (const line of lines) {
    if (parseDateText(line)) blocks.push([line]);
    else if (blocks.length) blocks[blocks.length - 1].push(line);
    else if (line.trim()) orphanLines.push(line.trim());
  }
  const days = blocks.map((b, i) => parseDayBlock(b.join('\n').replace(/\s+$/, ''), `d${i}`));
  return { days, orphanLines };
}

// ---------- name matching ----------

/** Loose key so "Lat pull-down", "lat pulldown" and "Lat Pulldowns" match. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join('');
}

/** Map of name key → exercise id, over names and "also known as" names. */
export function nameIndex(exercises: Exercise[]): Map<string, string> {
  const map = new Map<string, string>();
  // Active exercises win over archived ones with the same name.
  const sorted = [...exercises].sort((a, b) => Number(b.archived) - Number(a.archived));
  for (const e of sorted) {
    for (const n of [...(e.aliases ?? []), e.name]) map.set(nameKey(n), e.id);
  }
  return map;
}

/** A best guess for a new exercise's muscle group, from words in its name. */
export function guessMuscle(name: string): string {
  const n = name.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/\b(bicep|biceps|curl|tricep|triceps|skull|hammer|forearm|wrist)/, 'Arms'],
    [/\b(delt|delts|shoulder|lateral raise|overhead|ohp|military|shrug|face pull|upright)/, 'Shoulders'],
    [/\b(lat|lats|row|pulldown|pull-up|pull up|pullup|chin|deadlift|hyperextension|back ext)/, 'Back'],
    [/\b(abs?\b|situp|sit-up|sit up|crunch|plank|core|oblique|leg raise)/, 'Core'],
    [/\b(squat|leg|legs|lunge|calf|calves|hamstring|quad|glute|hip thrust|rdl|romanian)/, 'Legs'],
    [/\b(bench|chest|pec|fly|flye|dip|dips|push-up|pushup|supine press)/, 'Chest'],
  ];
  for (const [re, m] of rules) if (re.test(n)) return m;
  return 'Other';
}

/** Search over name, muscle group and "also known as" names. */
export function exerciseMatches(e: Exercise, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [e.name, e.muscle, ...(e.aliases ?? [])].some((n) => n.toLowerCase().includes(q));
}
