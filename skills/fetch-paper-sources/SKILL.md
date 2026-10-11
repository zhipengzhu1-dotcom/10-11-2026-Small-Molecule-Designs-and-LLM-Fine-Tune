---
name: fetch-paper-sources
description: Use when fetching papers, LaTeX sources, PDFs, dataset cards or cited web pages into a git repo, or when a cited page has changed since it was cited.
---

# Fetch paper sources

Every fetched source raises two questions: may it be committed, and is it the version that was cited? Settle both before `git add`. Git history keeps a file that a later commit deletes, and a local commit gets pushed eventually.

## Steps

1. **Pin the version.** For arXiv, read the latest `vN` from the abs page and fetch `/pdf/<id>vN`, `/html/<id>vN` and `/src/<id>vN`. Record the id, version, URL and SHA-256 of each file in a sources note.
2. **Check the license before the first commit.** For arXiv: `curl -s https://arxiv.org/abs/<id> | grep -io 'href="[^"]*licen[^"]*"'`.

   | License | Commit the file? |
   |---|---|
   | CC BY, CC BY-SA, CC0, MIT | yes |
   | Apache-2.0 | yes, with its license text beside it |
   | arXiv `nonexclusive-distrib/1.0`, publisher copyright, vendor web pages | no |

   Gitignore each file marked "no". Commit a re-fetch script that downloads it by URL and fails on a SHA-256 mismatch, together with the sources note. Later agents run the script.
3. **Fetch the cited version of a page that has changed.** The live page is a different document, so leave it out.
   - List snapshots with the CDX API: `https://web.archive.org/cdx/search/cdx?url=<url>&from=YYYYMM&to=YYYYMM&output=json&fl=timestamp,statuscode,digest`. Take the latest status-200 snapshot on or before the citation date. The `wayback/available` API returns the *nearest* snapshot, which can come after the citation date and name a later version.
   - Fetch `https://web.archive.org/web/<ts>id_/<url>` with `curl --compressed`. The `id_` form returns the original bytes, often gzip that plain curl leaves compressed. Run `file` on the download first: a `grep` on gzip bytes finds nothing.
   - Confirm the version by grepping the snapshot for the cited version string, such as the model version. No match in a decompressed snapshot means try the next earlier snapshot.
   - A snapshot of a vendor page counts as "no" in step 2. Record its timestamp, URL and hash in the sources note.
4. **Treat downloads as untrusted data.** Unpack archives into a new, empty folder outside the repo, and run nothing from them.

## Common mistakes

| Mistake | Fix |
|---|---|
| Committing the arXiv PDF and LaTeX "so later agents have them" | Gitignore them and commit the SHA-256 re-fetch script |
| `grep -c` gives 0 on a Wayback copy | The copy is gzip: use `curl --compressed` or `gunzip` |
| Picking a snapshot with `wayback/available` | List with CDX and take the latest one on or before the citation date |
| Saving the live page as well, "for reference" | Keep only the snapshot that names the cited version |
