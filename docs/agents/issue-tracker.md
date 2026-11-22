# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in `leozeraops/skillbook`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --repo leozeraops/skillbook --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --repo leozeraops/skillbook --json number,title,body,labels,comments`
- **List issues**: `gh issue list --repo leozeraops/skillbook --state open --json number,title,body,labels,comments`
- **Comment on an issue**: `gh issue comment <number> --repo leozeraops/skillbook --body "..."`
- **Apply/remove labels**: `gh issue edit <number> --repo leozeraops/skillbook --add-label "..."` / `--remove-label "..."`
- **Close**: comment with `gh issue comment`, then close with `gh issue close <number> --repo leozeraops/skillbook`

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `leozeraops/skillbook`.

## When a skill says "fetch the relevant ticket"

Read the issue with `gh issue view <number> --repo leozeraops/skillbook --json number,title,body,labels,comments`.
