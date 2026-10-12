// The agent description grammar (spec #52, stories 2 and 3): every launch says which role the agent
// plays and which ticket it serves, as `<role> #<n|-> <what>`, for example
// `implementer #53 pointer grammar` or `audit #- trail rows 77-87`. The role is one lowercase word
// (hyphens allowed, no closed list); `#-` marks work with no ticket. One parser, shared by the
// launch hook (factory/hooks/agent-description.mjs) and the dispatch event.

export const GRAMMAR = '<role> #<n|-> <what>';
export const EXAMPLES = ['implementer #53 pointer grammar', 'audit #- trail rows 77-87'];

const PATTERN = /^([a-z]+(?:-[a-z]+)*) #(?:(\d+)|-) (\S.*)$/;

// { role, ticket, what } for a description that follows the grammar, else null. `ticket` is the
// ticket number, or null for `#-`.
export function parseDescription(description) {
  if (typeof description !== 'string') return null;
  const m = PATTERN.exec(description.trim());
  if (!m) return null;
  return { role: m[1], ticket: m[2] === undefined ? null : Number(m[2]), what: m[3].trim() };
}
