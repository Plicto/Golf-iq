# Golf IQ project rules

## GitHub Actions

Do not use, create, trigger, dispatch, rerun, enable, or depend on GitHub Actions for Golf IQ work.

Before any repository write, verify that the write cannot trigger a GitHub Actions workflow. If there is any uncertainty, do not perform the write until the workflow risk is removed.

Builds, tests, verification, preview publication, and deployment must use a non-GitHub-Actions path unless the user explicitly changes this rule.

Do not add or modify files under `.github/workflows/` unless the user explicitly asks to change this rule.
