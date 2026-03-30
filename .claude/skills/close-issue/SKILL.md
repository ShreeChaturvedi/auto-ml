---
name: close-issue
description: Close the GitLab issue referenced in recent commits with an auto-generated summary note
disable-model-invocation: true
---

# Close Issue

1. Run `git log --oneline -5` and extract the issue number from the most recent commit that references `#<number>`.
2. Run `glab issue view <number>` to get the title and acceptance criteria.
3. Run `git show --stat <sha>` on the resolving commit(s).
4. Run `glab issue close <number>`.
5. Run `glab issue note <number>` with: resolving commit(s), branch, changed files summary, and acceptance criteria checklist marked done/deferred.
