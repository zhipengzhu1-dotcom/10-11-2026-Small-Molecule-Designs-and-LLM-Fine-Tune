# Ticket template

Every ticket body follows this shape. `/to-tickets` and anyone writing a ticket by hand start from it.

## Naming deliverables

Name every file a subagent writes as a role or a kind of note: `notes.md`, `scout.md`, `review-a.md`, `<ref>/notes.md`. Claude Code refuses a subagent's write to a report-like Markdown file.

Check a body before creating the issue:

```
node factory/checks/ticket.mjs --body ticket.md
```

It also reads a body on stdin. It fails, naming the line, on a refused name.

## Body

```markdown
## Parent

#<spec>

## What to build

<what and why, in a few sentences>

## Deliverables

- `<path>/notes.md`: <what it holds>

## Acceptance criteria

- [ ] <a check that can pass or fail, with where its evidence will be>
```
