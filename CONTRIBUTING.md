# Contributing

1. Open an issue first: what is wrong or missing, in about three lines.
2. Branch from `main` as `<issue-number>-<slug>`, for example `12-keep-module-paths`.
3. One concern per pull request. Fill in the template: What, Behaviour, How tested, Closes #n.
4. Sign your commits (`git commit -S`); `main` accepts signed commits only.
5. Before you push:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm test:generate   # needs Java 21+
   ```

Every source file starts with a header: WHAT, NOT, GOVERNED BY, CORRECTNESS and,
where it helps, GOTCHA. Keep it current when the file changes.

Only synthetic data belongs here. Never commit real patient data, generated
cohorts or the Synthea JAR. Add yourself to [CONTRIBUTORS.md](CONTRIBUTORS.md)
in your first pull request, and report security problems as
[SECURITY.md](SECURITY.md) says.
