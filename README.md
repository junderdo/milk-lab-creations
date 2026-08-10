# Milk Lab Creations

A web app for making keyframe animations for **Milk Lab robots** and putting them on real hardware.

- **Gallery** — browse and filter community animations; each one previews in a 3D viewer.
- **Editor** — build animations keyframe by keyframe against a rigged 3D model
  (`robo-cat-ears`: 4 servo channels, up to 64 keyframes), then save, publish, or remix.
- **Send to my ears** — connect a pair of robo-cat-ears over Web Bluetooth from a chip in the
  header, then upload an animation into one of the device's 16 animation slots (and rename or
  clear slots) from the upload dialog.

Animations are stored as canonical JSON (`apps/api/src/payload.ts`); the binary wire format the
firmware consumes is derived on demand, never stored.

## Layout

pnpm + Turborepo monorepo, packages scoped `@milklab/*`:

| Path              | What it is                                                              |
| ----------------- | ----------------------------------------------------------------------- |
| `apps/api`        | tRPC v11 API on AWS Lambda; Prisma against Aurora DSQL; Cognito auth     |
| `apps/web`        | SvelteKit 2 / Svelte 5, Tailwind v4, Tark UI, Threlte (three.js) preview |
| `packages/config` | shared tsconfig / eslint / prettier presets                             |
| `docs/`           | specs, ADRs, model + wire-format docs                                    |
| `scripts/`        | Python helpers (rig the `.glb`, generate the wire-format fixture)        |

## Requirements

- **Node 24+** and **pnpm 11.9** (`packageManager` pins the version; use Corepack).
- **AWS account + SSO profile `milklab-dev`** in `us-west-2`. Infra is
  [SST v3](https://sst.dev) (`sst.config.ts`): Aurora DSQL, Cognito user pool with Google as the
  identity provider, API Gateway v2 + Lambda, SvelteKit on CloudFront.
- **SST secrets** per stage: `GoogleClientId`, `GoogleClientSecret` (one Google OAuth client;
  each stage's Cognito domain must be added to its authorized redirect URIs).
  Set with `pnpm sst secret set GoogleClientId <value>`.
- **Python 3** only if you need to re-run the scripts in `scripts/`.
- A **Chromium browser** for the send-to-ears flow — Web Bluetooth, and device permission is not
  persisted, so it's connect-per-session.

Deploys and local DSQL access both go through the `milklab-dev` profile; re-auth with:

```bash
pnpm sso        # aws sso login --sso-session personal
```

## Running it

```bash
pnpm install
pnpm dev        # sst dev on your personal stage
```

`pnpm dev` brings up the personal stage (DSQL + Cognito), runs migrations, and starts the local
tRPC server on **:3001** and the SvelteKit dev server on **:5173**.

To run the halves separately against an already-provisioned stage:

```bash
AWS_PROFILE=milklab-dev pnpm --filter @milklab/api dev:server   # tRPC on :3001
pnpm --filter @milklab/web dev                                  # web on :5173
```

## Checks

```bash
pnpm build
pnpm check      # tsc / svelte-check
pnpm lint
pnpm test       # vitest
```

CI (`.github/workflows/ci.yml`) runs all four plus `pnpm audit --prod` on every PR, and deploys
`main` to the **production** stage (`milklabcreations.com`, API at `api.milklabcreations.com`) via
GitHub OIDC, running migrations after the deploy.

## Database

Prisma with the Aurora DSQL adapter. The generated client is gitignored — run
`pnpm --filter @milklab/api generate` after a fresh clone if you aren't going through `pnpm dev`.

```bash
pnpm --filter @milklab/api db:migrate       # apply migrations
pnpm --filter @milklab/api db:migrate:new   # author a new one
```

## More

- `CLAUDE.md` — conventions for agents working in this repo (issue tracking lives on Trello).
- `docs/typescript.md` — coding standards.
- `docs/adr/` — accepted architectural decisions.
- `docs/spec/` — build-ready specs, including the animation editor and the wire format.

---

Created by Jeff Underdown (junderdo)
