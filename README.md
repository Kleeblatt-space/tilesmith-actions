# TileSmith QC

[![Self-test](https://github.com/Kleeblatt-space/tilesmith-actions/actions/workflows/selftest.yml/badge.svg)](https://github.com/Kleeblatt-space/tilesmith-actions/actions/workflows/selftest.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A zero-friction GitHub Action that scores game tiles for seams, borders, and visual artifacts, creates local overlay PNGs, and reports results in pull requests.

## What it does

- Finds PNG, JPEG, and WebP tiles below configured paths.
- Scores images through the TileSmith API without storing image data.
- Writes overlays, a machine-readable report, a step summary, and an upserted PR comment.

## Quickstart

```yaml
name: TileSmith QC
on: [pull_request]
permissions:
  contents: read
  pull-requests: write
jobs:
  qc:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Kleeblatt-space/tilesmith-actions@v1
        with:
          api-key: ${{ secrets.TILESMITH_API_KEY }}
          paths: 'assets/**'
```

Get a free API key at [the TileSmith dashboard](https://app.kleeblatt.space). Fork pull requests without secrets are handled gracefully and do not fail the workflow.

## Inputs

| Input           |     Default | Description                              |
| --------------- | ----------: | ---------------------------------------- |
| `api-key`       |    required | TileSmith API key. Never logged.         |
| `paths`         | `assets/**` | Comma-separated glob patterns.           |
| `fail-on`       |    `Reject` | `Reject`, `Review`, or `never`.          |
| `max-files`     |       `100` | Maximum 1–500 tiles per run.             |
| `upload-report` |      `true` | Upload aggregate, anonymous report data. |

## Outputs

| Output                             | Description                     |
| ---------------------------------- | ------------------------------- |
| `production` / `review` / `reject` | Number of tiles in each gate.   |
| `avg`                              | Average score.                  |
| `report`                           | `tilesmith-report/report.json`. |

## Privacy

> 🍀 This service is free. To keep it free, we collect anonymous scoring logs (scores, gate, size class, timestamp). Images and personal data are never stored.

The action keeps image bytes in memory for scoring and stores only overlays plus aggregate result metadata in the workflow artifact. No custom telemetry is emitted by this action.

## FAQ and troubleshooting

A missing API key produces a notice and exits successfully, which keeps fork-based open-source workflows usable. Authentication errors (401/403) and quota errors (402) exit with code 2 and provide an actionable message. Network and server failures are retried with exponential backoff; rate limits respect `Retry-After`. Set `fail-on: never` when results should be informational only.

## Development

```bash
npm ci
npm test
npm run build
npm run lint
npm run format:check
```

The committed `dist/index.mjs` is the runtime artifact, so consuming workflows do not need to install dependencies.

## Versioning

Use the moving major tag `@v1` for compatible releases or pin an exact version such as `@v1.2.0` for reproducibility. Release provenance should be verified with GitHub Attestations.

## License

MIT. See [LICENSE](LICENSE).
