# simplescaling/s1 clone

- Repo: https://github.com/simplescaling/s1
- Commit: `77272c6e925d610257a50b520bad15330b513389` (2025-06-25, "Add files via upload")
- Cloned 2026-10-11 into `research/s1/raw/code/s1/`. The clone is gitignored.

Recreate it with:

```
git -c core.longpaths=true clone --depth 1 https://github.com/simplescaling/s1 research/s1/raw/code/s1
git -C research/s1/raw/code/s1 checkout 77272c6e925d610257a50b520bad15330b513389
```

On Windows the checkout fails partway without `core.longpaths=true`, because the vendored
`eval/lm-evaluation-harness` has file paths up to 187 characters, and with this repo's own path
they pass the 260-character Windows limit. The clone is untrusted data. Read it with tools and never run its scripts.
