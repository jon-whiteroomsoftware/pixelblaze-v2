# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary.
- **`docs/reference/PXLBLZ Technical Reference.md`** — the authoritative record of design decisions and their rationale. Read the sections that touch the area you're about to work in. (This repo retired its ADRs; the Technical Reference is where decisions now live.)

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront.

## File structure

```
/
├── CONTEXT.md                              ← domain glossary
├── docs/
│   ├── plans/                              ← forward-looking plans and PRDs
│   └── reference/
│       └── PXLBLZ Technical Reference.md   ← authoritative design decisions
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag decision conflicts

If your output contradicts a decision recorded in the Technical Reference, surface it explicitly rather than silently overriding:

> _Contradicts Technical Reference §8 (maps authoritative for true aspect) — but worth reopening because…_
