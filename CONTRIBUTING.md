# Contributing

Thanks for taking the time to help.

## Setup

See **Getting started** in the [README](README.md). Use the Node version in `.nvmrc`.

## Workflow

1. Branch from `main` (`feat/...`, `fix/...`).
2. Keep changes focused; one concern per pull request.
3. If you change `apps/api/src/database/schema.ts`, run `npm run db:generate -w @friendster/api` and commit the
   generated migration. CI fails if the schema and migrations disagree.
4. Before pushing, run the same checks CI runs:

   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```

5. Add or update tests for behavior you change. API coverage must stay above the thresholds in
   `apps/api/vitest.config.ts`.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:` ...), and add
user-visible changes to [CHANGELOG.md](CHANGELOG.md) under **Unreleased**.
