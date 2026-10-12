// The factory root: the main checkout, never the cwd (CONTEXT.md, Factory root). Subagents run in
// worktrees, but activity files and the decision log live in the main checkout. Its own module so
// the writer (log.mjs) and the reader (read.mjs) both take it without importing each other.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --root is the caller's; then FACTORY_ROOT, then CLAUDE_PROJECT_DIR, then the repo holding this file.
export function defaultRoot(env = process.env) {
  return env.FACTORY_ROOT || env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..');
}
