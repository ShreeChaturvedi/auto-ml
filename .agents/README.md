# `.agents` (Codex / OpenAI / other tools)

Canonical skills live under **`.claude/skills/`**. This repo does not commit a `.agents/skills` path because Git expands directory symlinks when adding them, which would duplicate the whole tree.

For tools that only look under `.agents/skills/`, create a local symlink after clone:

```bash
mkdir -p .agents
ln -sf ../.claude/skills .agents/skills
```

On Windows (Developer Mode + `git config core.symlinks true`): `mklink /D .agents\skills ..\.claude\skills` from the repo root in `cmd.exe`.
