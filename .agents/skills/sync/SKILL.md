---
name: sync
description: Pull latest changes from a sprint branch into the current branch. Shows what's new (commits, files, authors), previews potential conflicts, handles uncommitted work, and rebases cleanly. Use whenever you want to catch up with the team's latest work.
argument-hint: "[sprint-number]"
---

# Sync with Sprint Branch

Pull the latest changes from `sprint$ARGUMENTS` into the current branch. This command provides situational awareness about what the team has been doing before performing the rebase, so you can spot potential conflicts early.

The target branch is **sprint$ARGUMENTS** (e.g., if invoked as `$sync 9`, the target is `sprint9`).

## Steps

### 1. Check current state

Gather context about where you are before doing anything:

```bash
git branch --show-current
git status --short
```

Note:
- Which branch you're on (the "current branch")
- Whether there are uncommitted changes (staged or unstaged)
- Whether there are untracked files

If you're already on `sprint$ARGUMENTS`, skip to Step 6 (fast-forward pull).

### 2. Stash uncommitted work

If there are any uncommitted changes (staged, unstaged, or untracked), stash them so the rebase can proceed cleanly:

```bash
git stash push -u -m "sync: auto-stash before rebase on sprint$ARGUMENTS"
```

Remember that you stashed — you'll need to pop this at the end.

### 3. Fetch latest

```bash
git fetch origin sprint$ARGUMENTS
```

### 4. Show what's new

This is the situational awareness step. Show the user what changed on sprint$ARGUMENTS since their branch diverged, so they can understand what the team has been working on.

**New commits:**
```bash
git log --oneline --author-date-order HEAD..origin/sprint$ARGUMENTS
```

**Files changed (since divergence):**
```bash
git diff --stat HEAD...origin/sprint$ARGUMENTS
```

**Authors who contributed:**
```bash
git log --format='%an' HEAD..origin/sprint$ARGUMENTS | sort -u
```

Present this as a brief summary to the user:
- How many new commits
- Which files were touched (grouped by area if many: backend, frontend, etc.)
- Who made changes

If there are zero new commits, tell the user they're already up to date, pop the stash if you created one, and stop here.

### 5. Preview conflicts

Before rebasing, check whether any files the user has changed on their branch were also changed on sprint$ARGUMENTS. This warns about likely merge conflicts.

**Files changed on the current branch (relative to merge base):**
```bash
git diff --name-only $(git merge-base HEAD origin/sprint$ARGUMENTS)..HEAD
```

**Files changed on sprint$ARGUMENTS (relative to merge base):**
```bash
git diff --name-only $(git merge-base HEAD origin/sprint$ARGUMENTS)..origin/sprint$ARGUMENTS
```

Compare the two lists. If there's overlap, tell the user which files may conflict before proceeding. This gives them a heads-up, not a blocker.

### 6. Rebase (or fast-forward)

**If on sprint$ARGUMENTS directly:**
```bash
git pull --ff-only origin sprint$ARGUMENTS
```
Skip to Step 8.

**If on a sub-branch:**
```bash
git rebase origin/sprint$ARGUMENTS
```

If the rebase succeeds cleanly, skip to Step 7.

**If the rebase hits conflicts, resolve them:**

Rebase applies commits one at a time, so conflicts may appear at multiple steps. Handle this as a loop:

1. Identify which files have conflicts:
   ```bash
   git diff --name-only --diff-filter=U
   ```

2. For each conflicted file, read the file contents (which will contain conflict markers `<<<<<<<`, `=======`, `>>>>>>>`). Understand what both sides intended:
   - The "ours" side (above `=======`) is the sprint$ARGUMENTS version
   - The "theirs" side (below `=======`) is the current branch's version
   - Read surrounding code and the broader file for context

3. Resolve each conflict by editing the file to produce the correct merged result. Remove all conflict markers. The goal is to preserve the intent of both sides — keep the sprint branch's updates while maintaining the current branch's feature work. If both sides changed the same logic in incompatible ways, favor correctness and consistency over either side.

4. After resolving all conflicted files, stage them and continue:
   ```bash
   git add <resolved-files>
   git rebase --continue
   ```

5. If more conflicts appear on the next commit, repeat from step 1.

After resolving, briefly tell the user what you resolved and how — which files had conflicts, what the competing changes were, and what you chose. Keep it concise but specific enough that they can sanity-check your decisions.

If a conflict is genuinely ambiguous (e.g., two completely different implementations of the same function with no clear "correct" merge), ask the user which direction to go rather than guessing.

### 7. Check if force-push is needed

After a successful rebase, check whether the branch has already been pushed to remote:

```bash
git log --oneline origin/$(git branch --show-current)..HEAD 2>/dev/null
```

If the branch exists on the remote (the command doesn't error), warn the user:
- The rebase rewrote commit history
- They'll need to force-push to update the remote: `git push --force-with-lease`
- `--force-with-lease` is safer than `--force` because it won't overwrite changes someone else pushed to the same branch

If the branch hasn't been pushed yet, no warning needed.

### 8. Pop stash

If you stashed changes in Step 2, restore them:

```bash
git stash pop
```

If the pop has conflicts, resolve them the same way as rebase conflicts: read the conflicted files, understand both sides, edit to produce the correct result, and tell the user what you did.

### 9. Report

Summarize what happened:
- How many commits were pulled in
- Whether the rebase was clean or had conflicts (and what was resolved)
- Whether a force-push is needed
- Whether the stash was restored cleanly
- Any files that were touched by both sides and are worth reviewing

## Important

- Do NOT force-push without telling the user. Only warn and let them decide.
- Do NOT commit anything new. This command only rebases existing work.
- If a conflict is genuinely ambiguous with no clear correct resolution, ask the user before choosing.
- If the rebase gets into a bad state that you can't recover from, suggest `git rebase --abort` as the escape hatch and explain what went wrong.
- This command works from any branch. If run from the target sprint branch itself, it does a simple fast-forward pull.
