---
name: loop-pipeline
description: >-
  The shared mechanics every loop lane repeats: dedup a finding, open an
  isolated worktree, hand the work to loop-drafter, run npm run verify, hand
  the diff to loop-verifier, open a draft PR, and append to .loop/log.md. Use
  when a loop lane skill (loop-watchdog, loop-issue) has decided a finding is
  real and needs it carried to a draft PR. Not a triage skill — it does not
  decide what is worth doing, only what happens next.
---

# Loop pipeline

You are carrying **one** finding from "decided" to "draft PR waiting for a
human". You do not decide whether the finding is worth doing — the calling lane
skill already did.

## Hard stops

- Never merge a PR. Never commit or push to `master`.
- Never run `npm publish` or `vsce publish`, and never invoke `/release`.
- Open exactly one PR, as a **draft**.
- If `npm run verify` cannot be made green, stop and report. Do not weaken a
  test, disable a lint rule, or edit a screenshot baseline to pass.

## Steps

1. **Dedup.** Read `.loop/log.md` and run
   `gh issue list --search "label:loop:watchdog,loop:audit" --state all --json number,title`
   (the comma inside `--search` is an OR; separate `--label` flags would be an
   AND and never match). If this finding was already filed or already judged
   not worth filing, append a one-line note to `.loop/log.md` saying so and
   stop.

2. **Isolate.** `git worktree add ../cccost-loop/<slug> -b loop/<slug> master`,
   branching from the current `master`. Then, in the new worktree, install
   dependencies — they are gitignored and a fresh worktree starts without them:
   `npm ci && npm --prefix web ci && npx playwright install chromium`.
   All work happens in that worktree.

3. **Draft.** Hand the finding to the `loop-drafter` agent with: the finding,
   the acceptance criteria, and the path to `AGENTS.md`. For a bug, the criteria
   must include a test that fails before the fix and passes after.

4. **Verify.** Run `npm run verify` in the worktree (it builds, lints, and
   tests). If it fails, hand the failure back to `loop-drafter` once. If it
   fails again, stop and report — two failed attempts means the finding is not
   as understood.

5. **Review.** Hand the diff (`git diff master...HEAD`) to the `loop-verifier`
   agent along with `AGENTS.md`. Record its verdict; it cannot edit anything.

6. **Push.** `git push -u origin loop/<slug>` — a loop branch, never `master`.

7. **Publish.** `gh pr create --draft`, with the verifier's verdict in the body
   and a link to the originating issue.

8. **Log.** Append to `.loop/log.md`: the date, the finding, what was done, the
   verifier's verdict, and the PR number. Commit that on the `loop/<slug>`
   branch — never on `master`.

9. **Clean up.** `git worktree remove ../cccost-loop/<slug>` once the branch is
   pushed.

## `.loop/log.md` entry format

```
## YYYY-MM-DD <lane>

- **Finding:** one line
- **Action:** filed #N / PR #N / no action
- **Why:** one line — especially when the action was "no action", since that is
  what stops this finding being re-reported tomorrow
```
