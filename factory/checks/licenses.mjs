#!/usr/bin/env node
// License check (issue #16). Every committed file under research/**/raw/ needs a row whose
// license allows republishing, in the reference catalog or in research/licenses.tsv. Writes one
// check event and exits 0 on pass, 1 on fail.
//
//   node factory/checks/licenses.mjs [--root <repo>] [--run <id>] [--agent <id>]
//                                    [--catalog <catalog.tsv>] [--licenses <licenses.tsv>]
//
// "Committed" means tracked by git (`git ls-files`), not merely on disk: most raw files are
// gitignored. A row covers the file named in its `file` column. The catalog is rebuilt from the
// paper's citations, so raw files that are not cited references (dataset cards, the repo's own
// provenance notes) are listed by hand in research/licenses.tsv; there, "own work" marks a file
// the repo wrote itself and exempts that exact path.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, posix } from 'node:path';
import { checkCli, shown } from './check.mjs';
import { readCatalog } from './references.mjs';

// Licenses that allow republishing (issue #16): CC BY, CC BY-SA, CC0, Apache-2.0 and MIT, with or
// without a version. The catalog cell may add a note in parentheses after the license, as in
// "Apache-2.0 (license of the source repo ...)". CC BY-NC, CC BY-ND and the rest do not match.
const ALLOWED = [/^CC[- ]BY(?:-SA)?(?:[- ]v?\d+(?:\.\d+)?)?$/i, /^CC0(?:[- ]v?1\.0)?$/i, /^Apache[- ]2\.0$/i, /^MIT$/i];

export function licenseId(cell) {
  return cell.replace(/\s*\(.*$/, '').trim();
}

export function allowed(cell) {
  const id = licenseId(cell);
  return ALLOWED.some((re) => re.test(id));
}

// A license text (LICENSE, LICENSE.txt, LICENCE-APACHE, COPYING, ...). Apache-2.0 requires its text
// to travel with the file, so an Apache-2.0 file needs one committed in its own folder. A license
// text is the license itself, not a third-party work, so it needs no catalog row of its own.
const LICENSE_TEXT = /^(?:LICEN[CS]E|COPYING)(?:[.-][^/]*)?$/i;
const isLicenseText = (path) => LICENSE_TEXT.test(basename(path));

// Files git tracks under any research/**/raw/ folder, as repo-relative paths.
function committedRaw(root) {
  const r = spawnSync('git', ['-C', root, 'ls-files', '-z', '--', 'research'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ls-files failed in ${root}: ${r.stderr.trim()}`);
  return r.stdout.split('\0').filter((p) => /^research\/(?:.+\/)?raw\//.test(p));
}

// The hand-kept list's license for a file the repo wrote itself. Only an exact path listed with it
// is exempt, so a third-party README beside it is still checked.
const OWN_WORK = 'own work';

export function runCheck(opts) {
  const catalog = opts.catalog ?? join(opts.root, 'research', 'refs', 'catalog.tsv');
  const list = opts.licenses ?? join(opts.root, 'research', 'licenses.tsv');
  const listed = existsSync(list) ? readCatalog(readFileSync(list, 'utf8')) : [];
  const own = new Set(listed.filter((r) => r.license === OWN_WORK).map((r) => r.file));
  const rows = [...readCatalog(readFileSync(catalog, 'utf8')), ...listed.filter((r) => r.license !== OWN_WORK)];
  const files = committedRaw(opts.root);
  const texts = new Set(files.filter(isLicenseText).map((p) => posix.dirname(p)));
  const problems = [];
  for (const file of files.filter((p) => !isLicenseText(p) && !own.has(p))) {
    const entries = rows.filter((r) => r.file === file);
    if (!entries.length) problems.push(`${file}: no catalog entry`);
    for (const { license = '' } of entries) {
      if (!allowed(license)) problems.push(`${file}: license "${license}" not allowlisted`);
      else if (/^Apache/i.test(licenseId(license)) && !texts.has(posix.dirname(file))) {
        problems.push(`${file}: Apache-2.0 without its license text committed in ${posix.dirname(file)}/`);
      }
    }
  }
  const where = `${files.length} committed raw files vs ${shown(opts.root, catalog)} and ${shown(opts.root, list)} (${own.size} own work)`;
  return { evidence: [where, ...(problems.length ? problems : ['all have an allowlisted license'])].join('; '), problems };
}

checkCli(import.meta.url, {
  name: 'licenses',
  usage: 'node factory/checks/licenses.mjs [--root <repo>] [--run <id>] [--agent <id>] [--catalog <catalog.tsv>] [--licenses <licenses.tsv>]',
  options: { catalog: 'string', licenses: 'string' },
}, runCheck);
