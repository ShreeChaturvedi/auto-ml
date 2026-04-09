---
name: kill-ports
description: Kill all processes occupying dev server ports so a fresh `npm run dev` can start cleanly. Use whenever the user says "kill ports", "free up ports", "clear ports", "can't start dev server", "port already in use", "EADDRINUSE", or anything about needing to restart dev servers. Also use before launching `npm run dev` if a previous session may still be running.
---

# Kill Dev Server Ports

## Key lesson

`lsof` is **not comprehensive** — it routinely misses processes bound to `[::1]` or `0.0.0.0`. Always use `ss -tlnp` as the primary scanner and `fuser -k` as the killer. Cross-check with `lsof` as a secondary pass only.

## Port ranges

Vite auto-increments when its default port is taken, so crashed sessions can leave multiple frontend instances (5173, 5174, 5175...). Same applies to the backend. Scan ranges, not single ports.

| Service  | Default | Scan range |
|----------|---------|------------|
| Backend  | 4000    | 4000-4010  |
| Frontend | 5173    | 5173-5183  |
| Postgres | 5433    | 5433       |

## Procedure

1. **Scan** with `ss -tlnp` and `lsof -iTCP:<ranges> -sTCP:LISTEN -P -n` — union the results
2. If nothing found, report clean and stop
3. **Kill** occupied ports with `fuser -k <port>/tcp` for each found port
4. **Wait** 1 second, then **re-scan with both tools** to verify
5. If anything survives, escalate with `fuser -k -9 <port>/tcp`, wait, verify again
6. If still occupied after two rounds, report the stuck ports/PIDs and stop

Always verify. Never report success without a passing re-scan from both `ss` and `lsof`.
