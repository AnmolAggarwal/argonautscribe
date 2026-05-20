# Benchmarks

Pairs of recordings and expected field-value outputs, used to measure per-template accuracy across prompt and model changes.

## Layout

```
recordings/{template_id}/*.webm   # Audio files (gitignored — store separately)
expected/{template_id}/*.json     # Hand-graded ideal field_values output
```

## Run

```sh
pnpm benchmark -- --template cementation
```

The runner loads each recording, runs the full pipeline (STT → LLM → format), compares to the matching expected output, and reports per-field accuracy plus a summary score. Regressions block deployment.

Runner not yet implemented; see SPEC §17.1 and CLAUDE.md §8.3.
