# Zero-Paid Beta Deploy Runbook

This runbook turns the current monorepo into the first public beta topology described in the Sprint 12 plan:

- frontend on a personal Vercel Hobby project rooted at `frontend/`
- backend on a single Linux VM behind DuckDNS + Caddy
- Postgres, `pgvector`, Docker execution, backend storage, and WebSockets on that same VM
- email/password auth only for launch, with Google auth explicitly disabled

## Files Added For This Runbook

- `frontend/.env.beta.example`
- `frontend/vercel.json`
- `backend/.env.beta.example`
- `deploy/beta/Caddyfile.example`
- `deploy/beta/automl-backend.service.example`
- `deploy/beta/bootstrap-ubuntu.sh`
- `deploy/beta/configure-postgres.sh`
- `deploy/beta/install-app.sh`
- `deploy/beta/gcp-enable-compute.sh`
- `deploy/beta/gcp-reserve-static-ip.sh`
- `deploy/beta/gcp-create-vm.sh`
- `deploy/beta/gcp-provision.sh`
- `deploy/beta/gcp-ssh.sh`
- `deploy/beta/create-release-bundle.sh`
- `deploy/beta/render-backend-env.sh`
- `deploy/beta/gcp-upload-release-bundle.sh`
- `deploy/beta/gcp-upload-backend-env.sh`
- `deploy/beta/gcp-stage-release.sh`
- `deploy/beta/operator.env.example`
- `deploy/beta/vercel.sh`
- `deploy/beta/duckdns-point-to-gcp-ip.sh`
- `deploy/beta/duckdns-update.sh.example`
- `deploy/beta/duckdns.env.example`
- `deploy/beta/duckdns.service.example`
- `deploy/beta/duckdns.timer.example`
- `deploy/beta/smoke-check.sh`

## Public URL Contract

Frontend:

```bash
VITE_API_BASE=https://your-subdomain.duckdns.org/api
VITE_API_BASE_URL=https://your-subdomain.duckdns.org/api
```

Backend:

```bash
FRONTEND_URL=https://your-project.vercel.app
ALLOWED_ORIGINS=https://your-project.vercel.app
GOOGLE_AUTH_ENABLED=false
```

Why both frontend vars? The codebase now prefers `VITE_API_BASE`, but the legacy `VITE_API_BASE_URL` path is still supported during beta hardening. Keep them identical.

## Current Prepared State

This section records the current non-secret operator choices and CLI state for the beta rollout. Keep secrets out of git and only place them in the VM env file or a private local env file.

- GCP CLI authenticated in isolated config directory `/tmp/automl-gcloud-config`
- Active GCP account: `yadava5@miamioh.edu`
- Active GCP project: `automl-494107`
- Planned region / zone: `us-east1` / `us-east1-b`
- Planned VM shape: Ubuntu `24.04` x86_64, `e2-standard-4`, `100 GB`
- Reserved static IP name to use: `automl-beta-ip`
- Backend hostname chosen: `automl.duckdns.org`
- Vercel CLI authenticated in isolated config directory `/tmp/automl-vercel-config`
- Active Vercel account: `ayushyadav`
- Frontend Vercel project created and linked: `agentic-automl-platform`
- Production frontend envs already stored in Vercel:
  - `VITE_API_BASE=https://automl.duckdns.org/api`
  - `VITE_API_BASE_URL=https://automl.duckdns.org/api`
- Local Vercel production settings were pulled into `frontend/.vercel/`
- Local Vercel build path was validated successfully with `npm run vercel:frontend:build`
- Release bundle path was validated successfully with `npm run gcp:bundle:create`
- SMTP sender still pending. A fresh dedicated Gmail attempt was disabled by Google and should not be used.

Still intentionally not recorded in git:

- DuckDNS token
- Gmail app password
- OpenAI API key
- final VM env file contents

## Operator Flow

1. Bring up the backend VM first so you know the final DuckDNS hostname.
2. Configure DuckDNS to point at the VM.
3. Install and enable Caddy on the VM with `deploy/beta/Caddyfile.example`.
4. Copy `backend/.env.beta.example` to a private env file on the VM and fill in real secrets.
5. Install the backend as a systemd service with `deploy/beta/automl-backend.service.example`.
6. Create or link a personal Vercel project rooted at `frontend/`.
7. Set the two frontend Vercel env vars to the public backend `/api` URL, then deploy the frontend.

## Backend Host Checklist

Install on the VM:

- Node.js 22 LTS
- Docker Engine
- Postgres 16 with `pgvector`
- Caddy
- Git

Recommended layout:

- repo checkout: `/opt/automl/ai-augmented-auto-ml-toolchain`
- backend env file: `/opt/automl/backend.beta.env`
- persistent app user: `automl`

Before you create the VM from this Mac:

```bash
gcloud auth login
gcloud config set project <your-gcp-project-id>
PROJECT_ID=<your-gcp-project-id> npm run gcp:enable:compute
PROJECT_ID=<your-gcp-project-id> REGION=us-east1 npm run gcp:reserve:ip
PROJECT_ID=<your-gcp-project-id> ZONE=us-east1-b npm run gcp:create:vm
PROJECT_ID=<your-gcp-project-id> ZONE=us-east1-b npm run gcp:ssh
```

If you want a single launch command later, copy `deploy/beta/operator.env.example` to a private env file and run:

```bash
set -a
source /path/to/operator.env
set +a

npm run gcp:provision
npm run duckdns:point:gcp
npm run gcp:ssh
```

Once the VM exists and the private backend env is ready, the repo transfer path is:

```bash
npm run gcp:bundle:create
npm run gcp:env:render
npm run gcp:bundle:upload
npm run gcp:env:upload
npm run gcp:stage:release
```

The GCP scripts assume:

- Ubuntu 24.04 LTS x86_64
- `e2-standard-4`
- 100 GB boot disk
- one static external IP named `automl-beta-ip`
- firewall rules for ports `80` and `443`

First-run host bootstrap after SSH:

```bash
sudo ./deploy/beta/bootstrap-ubuntu.sh
```

Then, once the repo bundle and env file are uploaded and staged on the VM:

```bash
sudo DB_PASSWORD='replace-me' ./deploy/beta/configure-postgres.sh
sudo ./deploy/beta/install-app.sh
```

Then enable the service:

```bash
sudo cp deploy/beta/automl-backend.service.example /etc/systemd/system/automl-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now automl-backend
sudo systemctl status automl-backend
```

## Caddy + DuckDNS

Use the backend hostname only for the API/WebSocket server. A minimal Caddy config is enough because the backend already serves HTTP and WebSocket traffic on one port.

Example:

```caddyfile
beta-example.duckdns.org {
  encode gzip zstd
  reverse_proxy 127.0.0.1:4000
}
```

After copying the template:

```bash
sudo cp deploy/beta/Caddyfile.example /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Why DuckDNS?

- Caddy needs a real hostname to provision HTTPS automatically.
- DuckDNS gives you a free hostname without buying a domain first.
- The updater runs on the Linux VM, not on your Mac.

If you keep the reserved static GCP IP, the DuckDNS systemd timer is optional on day one. You can set the DuckDNS record once to that static IP and skip the timer until you expect the IP to move.

For DuckDNS, the repo includes systemd timer assets so you do not need a cron job:

```bash
sudo cp deploy/beta/duckdns-update.sh.example /opt/automl/duckdns/duckdns-update.sh
sudo chmod 700 /opt/automl/duckdns/duckdns-update.sh
sudo chown automl:automl /opt/automl/duckdns/duckdns-update.sh
sudo cp deploy/beta/duckdns.env.example /opt/automl/duckdns.env
sudo chmod 600 /opt/automl/duckdns.env
sudo cp deploy/beta/duckdns.service.example /etc/systemd/system/duckdns.service
sudo cp deploy/beta/duckdns.timer.example /etc/systemd/system/duckdns.timer
sudo systemctl daemon-reload
sudo systemctl enable --now duckdns.timer
systemctl list-timers duckdns.timer
```

## SMTP

The app already has working password-reset and verification templates. The missing launch requirement is real SMTP config.

For the zero-paid beta, use Gmail SMTP with an app password:

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=<gmail address>`
- `SMTP_PASSWORD=<gmail app password>`
- `SMTP_FROM=Agentic AutoML Platform <same gmail address>`

## Vercel Setup

- Create a separate personal Vercel project for this app.
- If your college/self-managed GitLab instance does not connect cleanly in Vercel, use the Vercel CLI from this machine instead of Git integration.
- Root the project at `frontend/`.
- Project already prepared: `agentic-automl-platform`
- The included `frontend/vercel.json` handles React Router SPA rewrites on Vercel.
- Add both `VITE_API_BASE` and `VITE_API_BASE_URL`.
- Redeploy after the backend hostname is stable.

CLI flow from this machine:

```bash
npm run vercel:frontend:whoami
npm run vercel:frontend:pull:preview
npm run vercel:frontend:build
npm run vercel:frontend:deploy:preview
```

The wrapper script `deploy/beta/vercel.sh` uses the isolated Vercel config directory, so it does not touch any unrelated Vercel login already present on the machine.
Production envs for the linked Vercel project are already set to `https://automl.duckdns.org/api`.

## Remaining Live Tasks

To move from prepared state to a working public beta, the remaining tasks are:

- provide a real `OPENAI_API_KEY` for the VM env file
- choose working SMTP credentials (existing Gmail, another personal Gmail, or later a custom-domain sender)
- provision the GCP VM and reserved IP with `npm run gcp:provision`
- point `automl.duckdns.org` at the reserved IP with `npm run duckdns:point:gcp`
- SSH into the VM and run `deploy/beta/bootstrap-ubuntu.sh`
- fill the private backend env file on the VM with database, JWT, SMTP, and OpenAI secrets
- run `deploy/beta/configure-postgres.sh`
- install and enable the backend systemd service
- install and reload Caddy with `deploy/beta/Caddyfile.example`
- run the Vercel CLI flow rooted at `frontend/`
- set `VITE_API_BASE` and `VITE_API_BASE_URL` to `https://automl.duckdns.org/api`
- run the public smoke checks

## Smoke Test Checklist

Before opening the beta:

- `npm run lint`
- `npm run test`
- `npm run build`
- verify `/api/health` through the DuckDNS hostname
- verify signup sends a real email
- click the verification link and confirm it ends on `/login?verified=1`
- verify forgot-password email delivery
- confirm Google buttons show `Coming soon`
- confirm direct `/api/auth/google` returns a disabled response
- confirm deployment API snippets use the public DuckDNS hostname instead of `127.0.0.1`

There is also a helper script for the public-host checks:

```bash
BACKEND_ORIGIN=https://your-subdomain.duckdns.org \
FRONTEND_ORIGIN=https://your-project.vercel.app \
./deploy/beta/smoke-check.sh
```

## Known Scope For Launch

- Google auth is intentionally disabled.
- Deployment predict traffic stays proxied through the backend at `/api/deployments/:id/predict`.
- The single-VM design keeps parity with local development and avoids introducing a second operational surface before the beta proves demand.
