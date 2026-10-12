// Claim state and relations of a decision row: the one grammar for them, shared by the decision
// writer (decide.mjs) and the trail check (checks/trail.mjs), and read by the node model (spec #52,
// stories 13 to 16 and 19). No new columns, so pstack's show-me-your-work format is not forked:
//
//   decision  <relation>[, <relation>]...: <text>
//             relation: supersedes | withdraws | corrects line <N>[ (part)]   an earlier row
//                       closes challenge <id>                                   a challenge event
//   result    <state>[: <text>]
//             state: a word of STATES, each mapped to a SACM assertionDeclaration
//
// `pass`/`fail` are check results, not states, and `defeated` is derived from later rows, never
// written. The trail check enforces this for rows from CLAIM_RULES_FROM on.

// Claim state -> SACM v2.3 assertionDeclaration (OMG formal/23-05-08, section 11.8).
export const STATES = {
  adopted: 'asserted',
  open: 'needsSupport',
  assumed: 'assumed',
  given: 'axiomatic',
  cited: 'asCited',
};

// Relations in the order the writer puts them; the first three name a row, `closes` a challenge.
export const RELATIONS = ['supersedes', 'withdraws', 'corrects', 'closes'];
const ROW_RELATIONS = RELATIONS.filter((r) => r !== 'closes');

// Rows written from this date on follow the grammar above; the rows before it stay valid as written.
export const CLAIM_RULES_FROM = '2026-10-13';

// A challenge id is a plain name (plainName in factory/log.mjs).
const ID = '[A-Za-z0-9][A-Za-z0-9._-]*';
const ONE = `(?:(${ROW_RELATIONS.join('|')}) line (\\d+)( \\(part\\))?|closes challenge (${ID}))`;
const PREFIX = new RegExp(`^(${ONE}(?:, ${ONE})*): `);
const LEADING_RELATION = new RegExp(`^(${RELATIONS.join('|')})\\b`);
const STATE_LIST = Object.keys(STATES).join(', ');

// The claim state that starts `result`: { state, sacm }, or { problem }.
export function claimState(result) {
  const word = /^[^\s:;,]*/.exec(result ?? '')[0];
  if (Object.hasOwn(STATES, word)) return { state: word, sacm: STATES[word] };
  if (word === 'pass' || word === 'fail') return { problem: `"${word}" is a check result, not a claim state; one of ${STATE_LIST}` };
  if (word === 'defeated') return { problem: `"defeated" is derived from later rows, never written; one of ${STATE_LIST}` };
  return { problem: `unknown claim state "${word}"; one of ${STATE_LIST}` };
}

// The relation word a decision cell starts with, or null.
export const leadingRelation = (decision) => LEADING_RELATION.exec(decision ?? '')?.[1] ?? null;

// A row relation flag's value ("12", "12 (part)" or "12(part)") as { line, part }, or null.
export function parseRowTarget(value) {
  const m = /^\s*(\d+)\s*(\(part\))?\s*$/.exec(value);
  return m ? { line: Number(m[1]), part: Boolean(m[2]) } : null;
}

// The decision-cell prefix for relations, "" for none: each is { kind, line, part } for a row
// relation, or { kind: 'closes', challenge }.
export function formatRelations(relations) {
  const one = (r) => (r.kind === 'closes' ? `closes challenge ${r.challenge}` : `${r.kind} line ${r.line}${r.part ? ' (part)' : ''}`);
  return relations.map(one).join(', ') + (relations.length ? ': ' : '');
}

// The relations a decision cell starts with and the text after them: { relations, text }, each
// relation shaped as formatRelations takes it. A cell that starts with a relation word but not a
// well-formed prefix gets { relations: [], text, problem }.
export function parseRelations(decision) {
  const m = PREFIX.exec(decision);
  if (!m) {
    const word = leadingRelation(decision);
    return word
      ? { relations: [], text: decision, problem: `decision starts with "${word}" but not "<relation> line <N>[ (part)]: " or "closes challenge <id>: "` }
      : { relations: [], text: decision };
  }
  const relations = [...m[1].matchAll(new RegExp(ONE, 'g'))].map(([, kind, line, part, challenge]) => (challenge
    ? { kind: 'closes', challenge }
    : { kind, line: Number(line), part: Boolean(part) }));
  return { relations, text: decision.slice(m[0].length) };
}
