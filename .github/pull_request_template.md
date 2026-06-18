<!--
PR title convention: `[#<issue>] <type>: <summary>`  e.g. `[#42] feat: fuzzy search on claims list`
The issue number is the prefix; <type> is a conventional-commit type (feat, fix, refactor, …).
-->

Closes #<!-- issue number -->

## What changed

<!-- Summary of the change. -->

## How it was tested

<!-- pnpm lint / check-types / relevant test suites. For entity changes: migration generated + reviewed. -->

## Checklist

- [ ] Branch/worktree is prefixed with the issue number (`<issue>-<slug>`)
- [ ] PR title is prefixed with `[#<issue>]`
- [ ] `Closes #<issue>` above links the originating issue
- [ ] Entity change? migration generated, SQL reviewed, and committed (see CLAUDE.md → Database & migrations)
