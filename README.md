# ArgonautScribe

Clinical documentation tool for small dental practices. The dentist creates a note in the web app, fills picklist fields and/or dictates per-encounter specifics, reviews the AI-assembled structured note, and copies it as one block into her PMS.

See [`SPEC.md`](SPEC.md) for the full product and technical specification, and [`CLAUDE.md`](CLAUDE.md) for the operational working-context (privacy invariants, conventions, gotchas) — read both before writing code.

## Status

Pre-MVP. The monorepo scaffolding is in place; substantive implementation has not begun. MVP scope is **web-only**; mobile PWA is v1.1.

## Layout

```
apps/web/        # The web app (MVP)
functions/       # Cloud Functions (processSegment)
shared/          # Shared TypeScript types and constants
firestore/       # Firestore + Storage security rules and indexes
benchmarks/      # Recording → expected output pairs for accuracy testing
docs/ADR/        # Architecture Decision Records
```

## Setup

```sh
pnpm install              # Install all workspace deps
pnpm dev:web              # Start the web app (Vite dev server)
pnpm emulators            # Start Firebase emulators (auth/firestore/functions/storage)
pnpm build                # Build all packages
pnpm typecheck            # Typecheck all packages
pnpm lint                 # Lint all packages
```

The Firebase project ID in `.firebaserc` is a placeholder (`argonautscribe-dev`); replace it with your dev project before running emulators or deploying. Copy `apps/web/.env.example` to `apps/web/.env` and fill in your Firebase config.

## Privacy reminder

This project handles a tightly-scoped piece of PHI (the patient tag in `patient_tags/{note_id}`). Read CLAUDE.md §2 before touching any code that processes audio, transcripts, prompts, or tags. Violating those invariants is the only thing that can break this project.
