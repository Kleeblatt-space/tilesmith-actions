# Work Instruction: `tilesmith-action` Repository (GitHub QC Integration)

**Repository:** github.com/Kleeblatt-space/tilesmith-action (newly created, **public**, MIT"")
**Version:** 1.0
**Dependencies:** Score API is **live** at `https://api.kleeblatt.space/v1/score` (tested 100% against acceptance criteria).
**Delimitation:** Billing/Entitlement/Dashboard/Consent are handled by a different developer in the main repo. **This work instruction contains no billing logic whatsoever.** This action uses existing API keys and receives errors (401/403/402/429) as-is.

---

## 1. Objective

A GitHub Action that scans game repos for tiles, scores them via the TileSmith API, renders local overlay PNGs, and comments on PRs. Zero-friction importable:

```yaml
- uses: Kleeblatt-space/tilesmith-action@v1
  with:
    api-key: ${{ secrets.TILESMITH_API_KEY }}
```

---

## 2. Repository Structure

```
tilesmith-action/
├── action.yml
├── package.json               # only pngjs + esbuild (no native deps!)
├── src/
│   ├── main.mjs               # flow: scan → API → overlay → report → fail
│   ├── overlay.mjs            # overlay renderer (pngjs, 3x5 pixel font)
│   └── report.mjs             # PR comment (upsert) + step summary
├── dist/index.mjs             # bundled, committed (node20 → no node_modules needed)
├── .github/workflows/selftest.yml  # self-test (see §9)
└── README.md                  # quickstart + badges + disclaimer
```

---

## 3. `action.yml` (Spec)

```yaml
name: 'TileSmith QC'
description: >
  Scores game tiles for production readiness (seams, borders, artifacts).
  Zero-retention: images are scored in RAM, only hash + score are stored.
branding: { icon: 'check-square', color: 'green' }
inputs:
  api-key:    { description: 'TileSmith API key (ts_…)', required: true }
  paths:      { description: 'Comma-separated glob patterns', required: false, default: 'assets/**' }
  fail-on:    { description: 'Reject | Review | never', required: false, default: 'Reject' }
  max-files:  { description: 'Max tiles per run', required: false, default: '100' }
runs:
  using: 'node20'
  main: 'dist/index.mjs'
```

Inputs arrive as environment variables `INPUT_API_KEY`, `INPUT_PATHS`, `INPUT_FAIL_ON`, `INPUT_MAX_FILES`.

---

## 4. Flow (`main.mjs`)

1. Recursively search for `*.png|jpg|jpeg|webp` within `paths`. Exclude `.git`, `node_modules`, `tilesmith-report`. Cap at `max-files`.
2. Per file: `POST` raw buffer to API. Headers `x-api-key`, `content-type: image/png`.
3. Render overlay locally from response (§5) → `tilesmith-report/<path_with_underscores>.png`.
4. Aggregate stats (counts per gate, Ø score).
5. Write `$GITHUB_STEP_SUMMARY` + PR comment upsert (§6).
6. Fail logic: `fail-on=Reject` and Reject>0 → exit 1. `Review` and (Review+Reject)>0 → exit 1. `never` → never fails.
7. API errors per file → `::warning::`, do not abort the run.

---

## 5. Overlay Spec (`overlay.mjs`)

- Library: **pngjs** (pure JS, no canvas/sharp – important for runner compatibility).
- If source < 64 px, nearest-neighbor upscale to ≥128 px.
- Gate frame: Production `
