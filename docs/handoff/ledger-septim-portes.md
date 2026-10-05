# SDD ledger — plan: docs/superpowers/plans/2026-10-05-septim-portes.md
Setup: Ruling: no worktree, designated branch claude/happy-pascal-f10qin (session-mandated, not main) — cost if wrong: none
Setup: Ruling: spec+plan not submitted for approval before execution — user delegated all decisions (« décide tout pour moi », repeated « selon toi ») — cost if wrong: rework of parts the user would have scoped differently
Pre-flight: T1→T2 resolveRef/normalizeRef/RefError(code, matches) — consistent
Pre-flight: T2→T4 FactoryError/STATUS/Factory methods — consistent
Pre-flight: T4→T5 McpHttpHandler(req,res,body) — consistent
Pre-flight: T4→T6 ROUTES — consistent
Pre-flight: T6 step 4 starts the server with `septim studio`, which T7 creates — conflict. Ruling: T6 browser test starts the server through a scratch script calling startServer(createFactory()) — same code path minus the CLI wrapper — cost if wrong: none (T9 E2E uses septim studio)
Pre-flight: T7→T8 HELP, MCP_CLIENTS, mcpConfig — consistent
Task 1: complete (commits 0a724c8..29af0fb, tests: npx vitest run →              at least ~695ms faster with isolate: false — reuses workers across files instead of one per file)
Task 2: Ruling: event handlers receive {video?, task?, error?} instead of VideoDetail — a render that throws before any job exists has no video, yet video.failed must still fire — cost if wrong: one adapter in webhooks (Task 3 consumes the new shape)
Task 2: Ruling: tontine script copied into __tests__/fixtures — .septim-viral/ is gitignored, the test would fail on a fresh clone — cost if wrong: none
Task 2: Ruling: publish refuses (conflict) a job already published, rejected, or without video, before taking the lock — clearer API answer than a silent no-op — cost if wrong: none
Task 2: complete (commits 29af0fb..0f8d8be, tests: npx vitest run →              at least ~765ms faster with isolate: false — reuses workers across files instead of one per file)
Task 3: Ruling: webhookPayload(event, EventPayload, publicUrl) consumes Task 2's {video?, task?, error?} shape; failures without a job send task+error — cost if wrong: none
Task 3: complete (commits 0f8d8be..30b0c45, tests: npx vitest run →              at least ~793ms faster with isolate: false — reuses workers across files instead of one per file)
Handoff: user moves to another account after Task 3 — docs/REPRISE.md (resume prompt, state, pitfalls, decisions), ledger versioned in docs/handoff/, restored automatically by .claude/hooks/restore-ledgers.sh; GitHub push still 403 (Claude app lacks write on SeptimeDSR/design), bundle sent; next: Task 4
