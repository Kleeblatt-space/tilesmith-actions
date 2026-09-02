# Anlage: Hardening, Qualität & Prozesse – `tilesmith-action`

**Ziel:** Die Action ist ein **öffentliches Aushängeschild**. Sie muss so robust, sicher und dokumentiert sein wie die Tools, die wir selbst als Vorbild nehmen (actions/checkout, actions/cache).
**Grundsatz:** User-facing Strings (README, PR-Kommentare, Fehler) = **Englisch** (OSS-Publikum). Interne Doku = Deutsch.

---

## 1. Engineering-Standards

| Thema | Vorgabe |
|---|---|
| Dependencies | **Nur `pngjs` + `esbuild` (dev)**. Keine native Libs (sharp/canvas tabu) → läuft auf ubuntu/windows/macos-Runnern |
| Bundle | `dist/index.mjs` committet; `.gitignore` ignoriert `node_modules`, **nicht** `dist` |
| Runtime | `node20` in `action.yml` gepinnt |
| Code-Stil | ESM, JSDoc-Typen, `eslint` + `prettier` im CI |
| Tests | Unit-Tests (`node:test`) für `overlay.mjs` (Pixel-Asserts), `report.mjs` (Markdown-Struktur), Scan-Logik; CI bei jedem PR |
| Pfade | Report-Dateinamen via `path.posix` + Sanitize (keine `..`, keine absoluten Pfade) |

---

## 2. Robustheit & Fehlerverhalten

**Retry-Logik (API-Calls):**
- Netzwerk/5xx → 3 Versuche, Backoff 1s/2s/4s
- 429 → `Retry-After` respektieren, max. 1 Retry, danach Tile überspringen + `::warning::`
- 401/403 → Hard-Error mit Hinweis „Key prüfen / Dashboard-Link", **Exit 2**
- 402 (Quota) → Hard-Error mit Upgrade-Link, **Exit 2** (sonst produziert der Lauf nur 402-Spam)

**Exit-Codes:** `0` = OK (inkl. fail-on nicht ausgelöst) · `1` = fail-on ausgelöst · `2` = Config/Auth/Quota-Fehler.

**Graceful Degradation:**
- `api-key` leer (z. B. Fork-PRs, GitHub übergibt keine Secrets) → `::notice:: "No API key – skipping QC. Free key: …"` + **Exit 0** (darf OSS-Workflows nicht brechen!)
- `GITHUB_TOKEN` fehlt → PR-Kommentar skippen, Step Summary + Artifact weiterhin schreiben

**Sonstiges:** Concurrency max. 4 parallele Scores · Timeout 30 s/Tile · API-Key **niemals** loggen (auch nicht in Error-Pfad).

---

## 3. Action-Outputs (für User-Workflows)

```yaml
outputs:
  production: 'Anzahl Production-Tiles'
  review:     'Anzahl Review-Tiles'
  reject:     'Anzahl Reject-Tiles'
  avg:        'Ø Score'
  report:     'Pfad zu tilesmith-report/report.json'
```

`report.json` (maschinenlesbar, im Artifact): `{ repo, ref, commit, action_version, stats, tiles: [{file, overall, gate, size_class, cached?}] }` – **keine Bilder, keine Hashes**.

---

## 4. Report-Upload & Badge-Daten (Cross-Team-Vertrag mit Dev 1 / API)

Die Action sendet nach dem Lauf die **Aggregat-Summary** an die API (baut auf dem anonymen Telemetry-Disclaimer auf):

```
POST /v1/reports   (x-api-key)
{ "repo", "ref", "commit", "action_version",
  "stats": { total, production, review, reject, avg },
  "tiles": [{ file, overall, gate, size_class }] }
→ 201 { "report_id", "badge_url" }
```

- Server speichert nur diese Aggregat-Daten → speist **Badge-Endpoint** `/badge/{user}/{repo}.json` + Field-Study-Telemetrie.
- **Wichtig:** Endpoint liegt im API-Repo (Dev 1). Dev 2 baut gegen diesen Vertrag; bis Endpoint live ist: Upload optional (`INPUT_UPLOAD_REPORT`, default `true`, bei Fehler nur `::warning::`, nie den Lauf brechen).
- PR-Kommentar-Footer: Disclaimer (engl.) + „Get your free key" + Upgrade-Hinweis bei Review/Reject.

---

## 5. Sicherheit & Privacy (öffentliches Repo!)

- `SECURITY.md` mit Responsible-Disclosure-Kontakt
- Workflow-Template mit **Least-Privilege**:
  ```yaml
  permissions:
    contents: read
    pull-requests: write
  ```
- **Keine eigene Telemetry in der Action** – einzige Datenquelle ist die API (hält den Disclaimer wahr und einfach)
- Supply Chain: Releases mit **GitHub Attestations** (`gh attestation create`) signieren → User können Build-Provenance prüfen; Doku empfiehlt Pinning `@v1` (Major) oder exakt `@v1.2.0`
- Inputs validieren mit aktionablen Fehlermeldungen (`fail-on` nur Reject|Review|never; `max-files` 1–500)

---

## 6. Versionierung & Releases

- SemVer; Major-Tag `v1` wird bei jedem Minor-Release **bewegt** (Standard-Pattern)
- `CHANGELOG.md` gepflegt; Release Notes mit „Highlights / Breaking / Fixes"
- Deprecation: alte Majors bekommen 6 Monate `::warning::`-Hinweis im Lauf, dann Archivierung
- Eigenes Repo nutzt die eigene Action im Self-Test (**Dogfooding sichtbar**)

---

## 7. Self-Test-Workflow (`.github/workflows/selftest.yml`)

- Fixtures: 4–6 CC0-Tiles aus dem Benchmark-Dataset (Lizenz OK) in `tests/fixtures/`
- Läuft gegen **Staging-API** mit Test-Key aus Repo-Secrets
- Assert-Script prüft: `base-01`-Fixture → overall 97 / Production; brick-Fixture → 95 / scored_at 64x64 (Toleranz ±1, Werte aus `v2-baseline-output.txt`)
- Muss grün sein, bevor ein Major-Tag bewegt wird

---

## 8. README-Struktur (englisch)

1. Eigene Badges (Dogfooding) + One-Liner
2. What it does (3 Bullets)
3. Quickstart (Workflow-YAML)
4. Get your free API key (Dashboard-Link)
5. Inputs/Outputs-Tabellen
6. Beispiel-PR-Kommentar (Screenshot aus Dogfooding)
7. Badge für dein README (Markdown-Snippet)
8. Pricing / Free-Tier (kurz)
9. **Privacy** (Disclaimer-Text englisch)
10. FAQ/Troubleshooting (Fork-PRs, Quota, fail-on)
11. Development (build/test)
12. License MIT

**Disclaimer (engl., copy-paste):**
> 🍀 This service is free. To keep it free, we collect anonymous scoring logs (scores, gate, size class, timestamp). Images and personal data are never stored.

---

## 9. Definition of Done (Dev 2)

- [ ] Self-Test grün (Fixture-Erwartungen erfüllt)
- [ ] Dogfooding-PR im `gc-pipeline-benchmark`-Repo erzeugt Kommentar + Artifact + Overlays
- [ ] Fork-PR ohne Key → Notice + Exit 0 (getestet!)
- [ ] 401/403/402/429-Verhalten getestet
- [ ] README + SECURITY.md + CHANGELOG + LICENSE vollständig
- [ ] `v1` getaggt, Attestation erstellt, Release Notes
- [ ] Report-Upload gegen Vertrags-Spec getestet (Mock + Staging)

---

## 10. Phase-2-Backlog (nicht jetzt)

- Score-Cache (`hash → score` in `.tilesmith-cache.json` + `actions/cache` im Template) → „Unveränderte Tiles kosten keine Quota"
- Contact-Sheet (Montage aller Overlays als ein Bild)
- SARIF-Output für den GitHub-Security-Tab
