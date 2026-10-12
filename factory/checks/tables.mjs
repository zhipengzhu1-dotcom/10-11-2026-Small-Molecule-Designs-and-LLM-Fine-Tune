#!/usr/bin/env node
// Tables check. Extracts every `tabular` from the LaTeX source and compares its numeric cells
// with the table notes, cell by cell, then writes one `check` event through the event writer.
//
//   node factory/checks/tables.mjs --tex <main.tex> --notes <dir> [--notes <dir> ...]
//                                  [--root <repo>] [--run <run-id>] [--agent <agent-id>]
//
// Run and agent default to FACTORY_RUN and FACTORY_AGENT, else run "manual" and agent
// "orchestrator".
//
// A note claims a float with a line like  Label: `tab:perf`  and holds the values as a Markdown
// table. Rows are matched in order, counting only rows with at least one numeric cell; columns
// are matched by position after \multicolumn is expanded. Text cells are ignored, so row labels
// can be written in plain words.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UsageError } from '../cli.mjs';
import { checkCli } from './check.mjs';

// ---------- numbers ----------

// A number token: 12, -3.5, 1,800, 59K, 4.7M. Digits glued to letters (s1, Qwen2.5) are not numbers.
const NUM = /(?<![A-Za-z0-9.])-?\d+(?:,\d{3})*(?:\.\d+)?[KMB]?(?![A-Za-z0-9])/g;

// A numeric cell has at least one number and no words: "56.7", "30.0% / 6984", "[-1.5%, 2.0%]".
function numbers(text) {
  const tokens = text.match(NUM) || [];
  if (tokens.length === 0 || /[A-Za-z]/.test(text.replace(NUM, ''))) return [];
  return tokens;
}

// ---------- LaTeX ----------

export class ParseError extends Error {}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

// Drops % comments, keeping \% and line breaks.
function stripComments(tex) {
  return tex
    .split(/\r?\n/)
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== '%') continue;
        let slashes = 0;
        for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) slashes++;
        if (slashes % 2 === 0) return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

// Reads a {group} starting at s[i] (after optional spaces). Returns [content, nextIndex].
function readGroup(s, i) {
  while (s[i] === ' ' || s[i] === '\n') i++;
  if (s[i] !== '{') throw new ParseError(`expected { at "${s.slice(i, i + 20)}"`);
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  throw new ParseError('unbalanced braces');
}

function skipOptional(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] !== '[') return i;
  const end = s.indexOf(']', i);
  if (end < 0) throw new ParseError('unclosed [ ]');
  return end + 1;
}

// Splits at top-level separators (brace depth 0). `sep` returns the separator length at i, or 0.
function splitTop(s, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const n = depth === 0 ? sep(s, i) : 0;
    if (n) { parts.push(s.slice(start, i)); start = i + n; i += n - 1; continue; }
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth < 0) throw new ParseError('unbalanced braces');
  }
  if (depth !== 0) throw new ParseError('unbalanced braces');
  parts.push(s.slice(start));
  return parts;
}

const rowSep = (s, i) => (s.startsWith('\\\\', i) ? 2 : s.startsWith('\\tabularnewline', i) ? 15 : 0);
const cellSep = (s, i) => (s[i] === '&' ? 1 : 0);

// Counts the columns a tabular spec declares, e.g. "l|ccc" -> 4, ">{\raggedright}p{3cm} l" -> 2.
function countColumns(spec) {
  let n = 0;
  for (let i = 0; i < spec.length; ) {
    const c = spec[i];
    if (/\s|\|/.test(c)) { i++; continue; }
    if ('@!<>'.includes(c)) { i = readGroup(spec, i + 1)[1]; continue; }
    if ('lcr'.includes(c)) { n++; i++; continue; }
    if ('pmb'.includes(c)) { n++; i = readGroup(spec, i + 1)[1]; continue; }
    if (c === '*') {
      const [count, a] = readGroup(spec, i + 1);
      const [sub, b] = readGroup(spec, a);
      n += Number(count) * countColumns(sub);
      i = b;
      continue;
    }
    throw new ParseError(`unknown column type "${c}" in {${spec}}`);
  }
  return n;
}

const RULES = /\\(?:toprule|midrule|bottomrule|hline|addlinespace|morecmidrules)\b(?:\[[^\]]*\])?|\\cline\s*\{[^}]*\}|\\cmidrule\s*(?:\[[^\]]*\])?(?:\([^)]*\))?\s*\{[^}]*\}|\\label\s*\{[^}]*\}/g;

// Leading {groups} each command throws away; the rest of its groups are kept as text.
const DROP = {
  cite: 1, citep: 1, citet: 1, citealp: 1, ref: 1, autoref: 1, cref: 1, eqref: 1, label: 1,
  hspace: 1, vspace: 1, footnote: 1, color: 1, cellcolor: 1, rowcolor: 1, textcolor: 1,
  multirow: 2, multicolumn: 2, rule: 2, includegraphics: 1,
};
const ESCAPED = { '%': '%', '&': '&', '#': '#', _: '_', $: '$', '{': '', '}': '', '\\': ' ', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ' };

// LaTeX cell -> plain text. Formatting commands vanish and their arguments stay.
function latexText(s) {
  let out = '';
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+\*?|[\s\S])/.exec(s.slice(i));
      if (!m) throw new ParseError('stray \\ at the end of a cell');
      const name = m[1];
      i += m[0].length;
      if (name in ESCAPED) { out += ESCAPED[name]; continue; }
      i = skipOptional(s, i);
      for (let k = 0; k < (DROP[name] || 0); k++) i = readGroup(s, i)[1];
      out += ' ';
      continue;
    }
    if (c === '{' || c === '}' || c === '$') { i++; continue; }
    out += c === '~' ? ' ' : c;
    i++;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Splits one cell into the cells it spans: \multicolumn{3}{c}{x} -> [x, '', ''].
function expandCell(raw) {
  const t = raw.trim();
  const m = /^\\multicolumn\s*/.exec(t);
  if (!m) return [latexText(t)];
  const [count, a] = readGroup(t, m[0].length);
  const [, b] = readGroup(t, a);
  const [content] = readGroup(t, b);
  return [latexText(content), ...Array(Math.max(0, Number(count) - 1)).fill('')];
}

function parseTabular(spec, body) {
  const ncols = countColumns(spec);
  const rows = [];
  for (let raw of splitTop(body, rowSep)) {
    raw = raw.replace(/^\s*\*?\s*\[[^\]]*\]/, '').replace(RULES, '');
    if (raw.trim() === '') continue;
    const cells = splitTop(raw, cellSep).flatMap(expandCell);
    if (cells.length > ncols) throw new ParseError(`a row has ${cells.length} cells but the spec {${spec}} has ${ncols} columns`);
    if (cells.every((x) => x === '')) continue;
    rows.push(cells);
  }
  return rows;
}

// Every float (table, figure, longtable) with its labels, plus every tabular with its rows.
function extract(texRaw) {
  const tex = stripComments(texRaw);
  const floats = [];
  const open = /\\begin\{(table\*?|figure\*?|longtable)\}/g;
  for (let m; (m = open.exec(tex)); ) {
    const endTag = `\\end{${m[1]}}`;
    const end = tex.indexOf(endTag, m.index);
    if (end < 0) continue;
    const body = tex.slice(m.index, end);
    const found = [...body.matchAll(/\\label\s*\{([^}]+)\}/g)];
    const labels = found.map((x) => x[1].trim());
    // The float's own label is the first one after \caption; subfigure labels come before it.
    const caption = body.search(/\\caption\b/);
    const own = found.find((x) => caption >= 0 && x.index > caption)?.[1].trim() || labels.at(-1);
    floats.push({ env: m[1], start: m.index, end, line: lineOf(tex, m.index), labels, id: own || `line ${lineOf(tex, m.index)}`, tabulars: [] });
  }
  const orphans = [];
  const tab = /\\begin\{(tabular)\}/g;
  for (let m; (m = tab.exec(tex)); ) {
    const line = lineOf(tex, m.index);
    const t = { line };
    const after = m.index + m[0].length;
    const close = tex.indexOf('\\end{tabular}', after);
    try {
      if (close < 0) throw new ParseError('no \\end{tabular}');
      const [spec, bodyStart] = readGroup(tex, after);
      t.rows = parseTabular(spec, tex.slice(bodyStart, close));
    } catch (err) {
      if (!(err instanceof ParseError)) throw err;
      t.error = err.message;
    }
    const owner = floats.find((f) => f.start < m.index && m.index < f.end);
    if (owner) owner.tabulars.push(t);
    else orphans.push({ env: 'tabular', line, labels: [], id: `line ${line}`, tabulars: [t] });
  }
  return [...floats, ...orphans].sort((a, b) => a.line - b.line);
}

// ---------- notes ----------

function markdownFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...markdownFiles(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

const mdText = (s) => s.replace(/\\\|/g, '|').replace(/<br\s*\/?>/gi, ' ').replace(/[*`]/g, '').replace(/−/g, '-').replace(/\s+/g, ' ').trim();

function parseNote(path) {
  const text = readFileSync(path, 'utf8');
  const labels = [];
  const rows = [];
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('```')) { fenced = !fenced; continue; }
    if (fenced) continue;
    const lm = /^(?:[-*]\s*)?\**Labels?\**\s*:(.*)$/i.exec(t);
    if (lm) labels.push(...(lm[1].replace(/`/g, ' ').match(/[A-Za-z]+:[\w.:-]+/g) || []));
    if (!t.startsWith('|')) continue;
    if (/^[\s|:-]+$/.test(t) && t.includes('-')) continue;
    rows.push(t.replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(mdText));
  }
  return { path, labels, rows };
}

// ---------- compare ----------

const dataRows = (rows) => rows.filter((r) => r.some((c) => numbers(c).length > 0));

function compare(unit, note) {
  const src = dataRows(unit.tabulars.flatMap((t) => t.rows));
  if (src.length === 0) return [];
  const md = dataRows(note.rows);
  if (src.length !== md.length) return [`${unit.id}: source has ${src.length} rows with numbers, notes (${note.path}) have ${md.length}`];
  const problems = [];
  let label = '';
  src.forEach((row, i) => {
    if (row[0] && numbers(row[0]).length === 0) label = row[0];
    const width = Math.max(row.length, md[i].length);
    for (let c = 0; c < width; c++) {
      const s = numbers(row[c] || '').join(' ');
      const n = numbers(md[i][c] || '').join(' ');
      if (s !== n) problems.push(`${unit.id} row "${label}" col ${c + 1}: source ${s || '(no number)'}, notes ${n || '(no number)'}`);
    }
  });
  return problems;
}

export function runCheck({ tex, notes }) {
  const units = extract(readFileSync(tex, 'utf8'));
  const allNotes = notes.flatMap(markdownFiles).map(parseNote);
  const lines = [];
  const problems = [];
  const unparsed = [];
  let compared = 0;
  for (const unit of units) {
    const note = allNotes.find((n) => n.labels.some((l) => unit.labels.includes(l)));
    if (!note) {
      problems.push(`no note for ${unit.id} (${unit.env}, line ${unit.line})`);
      lines.push(`FAIL ${unit.id}: no note`);
      continue;
    }
    const errors = unit.tabulars.filter((t) => t.error).map((t) => `${unit.id} (line ${t.line}): ${t.error}`);
    if (errors.length) {
      unparsed.push(...errors);
      lines.push(`INCONCLUSIVE ${unit.id}: ${errors.join('; ')}`);
      continue;
    }
    const p = compare(unit, note);
    problems.push(...p);
    const rows = dataRows(unit.tabulars.flatMap((t) => t.rows)).length;
    compared += rows;
    const basis = unit.tabulars.length === 0 ? 'note found; no tabular'
      : rows === 0 ? 'note found; tabular has no numeric cells'
      : `${rows} rows with numbers compared`;
    lines.push(`${p.length ? 'FAIL' : 'PASS'} ${unit.id} (${basis})`);
  }
  // Unparsed tables make the verdict INCONCLUSIVE, never a pass, and only when nothing failed outright.
  const summary = `${notes.join(',')}: ${units.length} tables and figures checked, ${compared} rows with numbers compared`;
  return { summary, problems, unchecked: unparsed, lines };
}

// ---------- CLI ----------

checkCli(import.meta.url, {
  name: 'tables',
  usage: 'node factory/checks/tables.mjs --tex <main.tex> --notes <dir> [--notes <dir> ...] [--root <repo>] [--run <id>] [--agent <id>]',
  options: { tex: 'string', notes: 'list' },
}, (opts) => {
  if (!opts.tex) throw new UsageError('missing --tex <file>');
  if (!opts.notes?.length) throw new UsageError('missing --notes <dir>');
  return runCheck(opts);
});
