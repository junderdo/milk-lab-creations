---
name: run-app
description: Launch this app locally so a change can be exercised in a browser — starts the personal SST stage (DSQL + Cognito), the tRPC API on :3001, and the SvelteKit dev server on :5173.
---

# run-app

`pnpm dev` is `sst dev`: it deploys your personal stage, runs migrations, and supervises both
dev servers itself. There is no lighter path — `dev:server` reads the Db and UserPool env that
`sst dev` injects through resource linking, and this repo has no `.env` files to stand in for
it. Run the whole thing.

Two snags account for every failed attempt, and neither confesses itself in the output.

## 1. Live AWS credentials

The stage is real infrastructure, so an expired SSO token fails the run before anything starts.

```bash
aws sts get-caller-identity --profile milklab-dev
```

`Token has expired and refresh failed` → the refresh is a browser flow, so it belongs to the
user. Ask them to type `! pnpm sso` and wait for it to land. Re-check before continuing;
logging in yourself is not an option this environment offers.

## 2. A real terminal

`sst dev` is a full-screen TUI. Redirecting its output — a pipe, a file, `run_in_background`
without a pty — takes the terminal away and it dies immediately:

```
panic: runtime error: invalid memory address or nil pointer dereference
tcell/v2.(*tScreen).enableMouse ... sst/mosaic/multiplexer.New()
```

That reads like a broken install and is only a missing pty. Give it one with tmux:

```bash
tmux kill-session -t milklab 2>/dev/null
tmux new-session -d -s milklab -x 200 -y 50 -c "$(git rev-parse --show-toplevel)"
tmux send-keys -t milklab 'pnpm dev' Enter
```

Read it back with `tmux capture-pane -pt milklab -S -60`; stop it with
`tmux kill-session -t milklab`. Leaving the session up across turns is fine and saves the
startup cost.

## 3. Wait on the ports

The TUI repaints in place, so pane text is a poor readiness signal — a "ready" banner scrolls
off or gets overdrawn while the servers are still coming up. The listening ports are the
truth. Wait on them in the background:

```bash
until ss -ltn | grep -q ':5173'; do sleep 5; done
```

Both belong to the app: **:3001** the tRPC API, **:5173** the SvelteKit dev server.

**A stage whose last run was `sst deploy` deletes its CloudFront distribution before the dev
servers start.** That is several minutes of nothing but a `Deleting WebCdn` spinner. It is
not a hang — wait it out.

Listening is not the same as working, and the query path runs all the way to DSQL. One call
proves the whole stack:

```bash
curl -s -H 'Origin: http://localhost:5173' \
  'http://localhost:3001/trpc/animations.gallery?input=%7B%22json%22%3A%7B%7D%7D'
```

Seeded animations come back as JSON. A bare `/trpc/` returns 404 — that is tRPC wanting a
procedure name, not a broken server.

## 4. Drive it

The app is at **http://localhost:5173**.

Signed-out pages — home, the gallery, public animation detail pages — you can drive yourself.

Everything owner-scoped is behind Cognito's hosted Google login, which is a real consent
screen no agent can complete. The editor (`/animations/[id]/edit`), `/my`, and creating or
remixing anything all sit behind it. For those, hand off: give the user the URL, say what
changed, and list what to click. Their browser session is the only one that gets through.
