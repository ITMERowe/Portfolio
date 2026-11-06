# Repo hygiene for AI-assisted projects

What belongs in a project's Git repository and what should stay on your own computer when you work with Claude Code or another AI coding assistant. Read it before a project's first commit, and before cleaning up an existing repository.

The test for every file: **would someone who clones or forks the repo need it to install, build, test or understand the project?** If not, keep it local.

## 1. Commit these (the essentials)

| Kind | Examples |
|---|---|
| Source code | `src/`, `app/`, `lib/`, entry points such as `index.html` or `main.py` |
| Build and dependency config | `package.json` + lock file, `pyproject.toml`, `requirements.txt`, `Cargo.toml` + `Cargo.lock`, `go.mod`, `tsconfig.json`, bundler config, build wrappers (e.g. `gradlew` and its wrapper files) |
| Native or platform projects that you actually build | e.g. `android/`, `ios/`, `desktop/` |
| Tests | `tests/`, `__tests__/`, `spec/` |
| CI | `.github/workflows/`, `.gitlab-ci.yml` |
| Docs for people | `README.md`, `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`, architecture notes |
| Images the docs show | only the ones the README or docs actually reference |
| `.gitignore` | always |

## 2. Keep these local (git-ignore them)

| Kind | Examples | Why |
|---|---|---|
| AI tool settings, skills and hooks | `.claude/`, `.codex/`, `.cursor/`, `.windsurf/`, `.aider*`, `.continue/` | Machine-specific paths and personal preferences. Hook files run commands, so a public copy that someone edits in a pull request is a risk. |
| AI instruction and session files | `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, session handoff or notes files | Working context for your assistant, not documentation for users. |
| AI planning output | specs, plans and reports an assistant wrote during sessions | Process notes, usually stale soon after. |
| Generated indexes and caches | knowledge graphs, embeddings, `.cache/`, tool output folders | Regenerated locally. |
| Browser-automation output | `.playwright/`, `.playwright-cli/`, `test-results/`, `playwright-report/` | May hold screenshots, traces or saved logins. |
| Internal reviews | security reviews, audit notes | Written for the owner; may describe weaknesses. |
| Store and marketing assets | app-store screenshots, promo images | Uploaded by hand; not needed to build. |
| Platforms nobody builds | an untested platform project | Can usually be regenerated. Write down any custom code in it before dropping it. |
| Secrets and signing | `.env*`, `*.pem`, `*.key`, `*.jks`, `*.keystore`, `*.p12`, credential JSON files, `local.properties` | Never in any commit, ever. |
| Build output and dependencies | `node_modules/`, `dist/`, `build/`, `target/`, `.venv/`, `__pycache__/`, release binaries | Rebuilt from source. |

Starter `.gitignore` block (trim to what your project uses):

```gitignore
# Dependencies and build output
node_modules/
dist/
build/
.venv/
__pycache__/

# Secrets and signing: never commit
.env
.env.*
*.pem
*.key
*.jks
*.keystore
*.p12

# AI tooling and session notes: local to this machine, not part of the project
.claude/
.codex/
.cursor/
CLAUDE.md
AGENTS.md
HANDOFF.md

# Browser-automation output
.playwright/
.playwright-cli/
test-results/
playwright-report/
```

**Team exception:** if your whole team shares assistant instructions on purpose (for example a `CLAUDE.md` with project conventions everyone's assistant should follow), committing it is a valid choice. Then keep it free of personal paths and secrets, and keep personal settings in an ignored file (Claude Code: `.claude/settings.local.json` and `CLAUDE.local.md`).

## 3. Taking already-committed files out of the repo

1. Check nothing depends on them: search the code, tests, CI config, build config and docs for their paths.
2. Add them to `.gitignore`, then stop tracking them while keeping them on disk:
   ```bash
   git rm -r --cached <paths>
   ```
3. Fix any README or docs links that pointed at them.
4. Prove a fresh clone still works: clone into a temporary folder, install (`npm ci`, `pip install -r …`, etc.), build, and run the tests.
5. Removing files only stops future copies. Older versions stay in Git history; see section 7 if that matters.

**Pitfall: switching branches can delete these files.** After untracking, don't `git checkout` a branch that still tracks them, and don't merge into such a branch from a checkout of it. Git treats ignored files as expendable: switching overwrites them with that branch's committed copies, and the merge that untracks them then deletes them from disk. Any uncommitted local edits are lost. Safer options:
- merge from the branch that already untracked them, or through a pull request on the hosting site;
- or copy the ignored files somewhere outside the repo first, then copy them back after the merge.

If it happens anyway, `git restore --source=<last commit that tracked them> --worktree -- <paths>` brings back the committed versions.

## 4. Commits

- **Assistant attribution is your call.** Some tools add `Co-Authored-By:` trailers or "Generated with …" lines to commits and pull requests. On GitHub, a co-author trailer makes that account show up in the repository's contributors list. If you don't want that, tell your assistant once (in its memory or instructions) to leave those lines out.
- **Author email:** on public repositories, commit with your hosting site's private no-reply address rather than a personal email, and set it before the first commit: `git config user.email <no-reply address>`. On GitHub, also turn on Settings → Emails → *Keep my email address private* and *Block command line pushes that expose my email*.
- Stage files explicitly; don't let `git add -A` sweep in local tool or settings files.
- On Windows PowerShell, multi-line commit messages break easily. Write the message to a file and use `git commit -F <file>`.

## 5. Before every push

- [ ] `git status` and `git diff --staged`: only intended files; no secrets, tool folders or session notes.
- [ ] Type check, lint, tests and build pass.
- [ ] Dependency audit is clean for what you ship (`npm audit --omit=dev`, `pip-audit`, `cargo audit`, …).
- [ ] New images carry no metadata or personal data; screenshots use made-up demo data.
- [ ] README links and image paths resolve.

## 6. Security defaults for new projects

- Local dev servers listen on `localhost` only. Expose them to the network (e.g. `--host`) only on a network you trust, never on public Wi-Fi.
- CI: give the job token the least rights it needs (on GitHub, `permissions: contents: read`); pin third-party actions to a commit SHA; never print secrets; be careful with workflows that run on pull requests from forks.
- Apps: request only the permissions the app uses; limit file sharing to the app's own folders; for web content, add a Content-Security-Policy.
- Keep secrets in environment variables or your CI's secret store, never in the code.

## 7. Rewriting history (only when the owner asks)

Examples: removing assistant trailers from old commits, or purging a file that should never have been committed.

1. Back up every ref first, outside the repo, and verify the backup:
   ```bash
   git bundle create ../<project>-history-backup-<date>.bundle --all
   git bundle verify ../<project>-history-backup-<date>.bundle
   ```
2. Rewrite with `git filter-repo` (recommended) or `git filter-branch`. For message-only changes, check afterwards that the file trees are unchanged (`git rev-parse <branch>^{tree}` before and after) and that the commit count matches.
3. Push with a lease, never a bare force: `git push --force-with-lease origin <branches>`. Assistants are often not allowed to do this; let the owner run it.
4. Tell everyone affected: all commit hashes change, other clones must re-clone or reset, old branches and forks still hold the old commits until they are deleted, and the hosting site's caches (such as the contributors list) can take a day or more to refresh.

**A leaked secret is different: revoke or rotate it first.** Rewriting history doesn't make a secret safe again; anyone may already have copied it.
