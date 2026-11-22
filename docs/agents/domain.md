# Domain Docs

How engineering skills consume this repository's domain documentation.

## Before exploring, read these

- `GLOSSARY.md` at the repository root, if it exists.
- `GLOSSARY-MAP.md` at the repository root if it exists.
- ADRs under `docs/adr/` that touch the area being worked on.

If these files do not exist, proceed silently. The `/domain-modeling` skill creates them when terms or decisions are resolved.

## File structure

Single-context repository:

```text
/
├── GLOSSARY.md
├── docs/adr/
│   └── 0001-example.md
└── src/
```

## Use the glossary's vocabulary

Use glossary terms consistently in issue titles, refactor proposals, hypotheses, and test names. Do not silently replace a project-specific term with a synonym.

## Flag ADR conflicts

If an output contradicts an existing ADR, surface the conflict explicitly rather than silently overriding it.
