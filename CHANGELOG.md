# Changelog

## 0.3.0 — protocol 0.2 acceptance criteria

- Add protocol 0.2. A plan that declares `protocol: "0.2"` lists acceptance criteria as `AC-NN:` list items under any heading, milestones name the criteria they deliver in one `**Acceptance criteria:**` coverage line, and plan and milestone statuses use pending, in progress, or done.
- Add `observeCriteria`, which reports each valid criterion with its covering milestones and progress derived from their statuses. Parsed plans gain `protocol` and `criteria`, milestone entries gain `criteria` and `criteriaMarkers`, and inspection and CLI output gain a top-level `criteria` observation.
- Report protocol 0.2 findings in check and inspect: missing, invalid, duplicate, or empty criteria, other status values, malformed or misplaced coverage lines, unknown IDs, and criteria no milestone covers. Plans without the marker keep exactly the 0.1 findings.
- Ship hand-written criteria examples with machine-readable expected results, and export CriterionIdSchema, ProgressSchema, ProtocolVersionSchema, PROGRESS_VALUES, and PROTOCOL_VERSIONS. PROTOCOL_VERSION is now `0.2`; no runtime dependency changed.

## 0.2.0 — document observations and tooling

- Add pure edit preparation, expected-hash guards, explicit body/core-metadata and milestone-source writes, opt-in UUID assignment, and guarded milestone removal. Return digests and assigned IDs through the library and CLI.
- Coordinate every filesystem mutation through shared canonical local document locks; preserve explicit crash recovery and truthful uncertain outcomes after failed release.

- Add complete UTF-16 source ranges for unfenced level-two sections, document preambles, milestone headings, and recognized Overview tables without dropping shared or trailing requirements.
- Share optional frontmatter parsing between plans and milestones; expose exact milestone body and raw extension metadata without requiring plan metadata fields.
- Return exact-byte SHA-256 values for readable documents. Add pure `fingerprintPlan` and optional inspection/CLI structural fingerprints using explicit caller-selected metadata exclusions and strict deterministic JSON.
- Use `jg-crypto` and `jg-utilities` as direct runtime dependencies. Protocol 0.1 remains provisional; fingerprints and observations grant no execution authority.

## 0.1.2 — documentation and examples

- Complete the canonical documentation and consumer integration recipes alongside the visual example explorer, original-source downloads, and verified package availability presentation.
- Keep protocol 0.1 provisional and the reference library/CLI behavior unchanged.

## 0.1.1 — trusted publishing validation

- Prepare the first automated release after the manual 0.1.0 bootstrap, using the qualified archive and registry/provenance verification workflow.
- Keep protocol 0.1 and the reference API/CLI behavior from the initial preview.

## 0.1.0 — development preview

- Introduce provisional protocol 0.1 for Markdown plans with optional milestones, extensible metadata, and ordinary user edits/deletion.
- Add tolerant parsing, selected-directory inspection, and optional conformance checking with structured diagnostics.
- Add exclusive plan creation and conservative metadata/marker updates that preserve unrelated bytes; document caller serialization and unsupported edits.
- Ship the library declarations, four-command CLI, canonical public references, synthetic examples, and a runnable installed-consumer example.
- Qualify an exact archive across the supported Node/OS matrix, with checksum receipts, registry/content checks, OIDC publishing readiness, and an isolated owner bootstrap runbook.
- Establish the private documentation website workspace and shared project maintenance skill. Public release and live deployment remain unverified.
