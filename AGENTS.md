# RTX5 Project Agent Guide

## Mission
Build RTX5 as a frontend-only React Native trading app with near parity to the reference screenshots, shipping on iOS and Android (phone and tablet) with staged OTA reliability.

## Non-Negotiables
1. Frontend only. Do not rebuild backend services.
2. Stack is locked:
- Expo Dev Client
- TypeScript strict mode
- TanStack Query + Zustand
- React Hook Form + Zod
- Custom Skia chart engine
3. No third-party logo visible in chart UI.
4. OTA uses EAS Update channels (`preview`, `staging`, `production`) with runtime gating.
5. No hardcoded runtime behavior in feature code. Use API data, typed config, or persisted user state.
6. User personalization must be stored locally on the device and must remain unchanged until the user changes it.

## Source of Truth Files
- Master roadmap: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/MASTER_GUIDE.md`
- Architecture: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/ARCHITECTURE.md`
- API contracts: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/API_CONTRACTS.md`
- Security gates: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/SECURITY.md`
- OTA release gates: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/OTA_RELEASE.md`
- Test gates: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/TEST_STRATEGY.md`
- Screenshot parity map: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/UI_PARITY_SCREEN_MAP.md`
- Phase index: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/README.md`

## Folder Conventions
- `app/` for route definitions.
- `src/features/*` for module-specific screens and hooks.
- `src/ui/*` for shared design-system components.
- `src/api/generated` for OpenAPI-generated code only.
- `src/api/ws` for WebSocket transport.
- `src/domain` for mapping DTOs to UI models.
- `src/state` for Zustand slices.
- `src/query` for TanStack Query config/keys.

## Coding Standards
- Use strict TypeScript types everywhere.
- No direct REST/WS calls inside UI components.
- UI components stay presentational; feature hooks handle state and side effects.
- Keep numeric formatting centralized and reusable.
- Prefer deterministic logic and pure utilities for core calculations.
- Do not hardcode user-specific values in screen files (symbols, timeframe, language, chart state, filters, toggles).
- Persist user state with versioned local storage (`rtx5-app/src/state/userPreferences.ts`) and preserve backward compatibility.

## Local Persistence Requirements (Device-Only)
- Persist and restore quote watchlist membership and view mode.
- Persist and restore current chart symbol and timeframe.
- Persist and restore chart objects/drawings and chart visibility/lock settings.
- Persist and restore one-click trading terms acceptance state.
- Persist and restore history filter range and related user-selected filters.
- Persistence scope is user device only; do not reset unless user explicitly resets or changes values.

## PR Checklist (Required)
- [ ] References one phase file and one acceptance checklist item.
- [ ] Updates affected docs if behavior or contracts changed.
- [ ] Includes unit/integration/E2E evidence for changed flows.
- [ ] Preserves no-logo chart rule.
- [ ] Does not introduce backend implementation changes.
- [ ] Removes hardcoded runtime values from UI flows.
- [ ] Includes migration-safe updates for persisted local state when schema changes.

## Handoff Protocol
1. Update current progress in the relevant `PHASE_*.md` file.
2. Mark completed acceptance and test checklist items.
3. Note any unresolved blockers with owner and next action.
4. If contracts changed, update `API_CONTRACTS.md` and mention migration impact.
5. If release-sensitive, update `OTA_RELEASE.md` and `SECURITY.md` status notes.

## Do Not Rules
- Do not add or modify backend service logic in this repo.
- Do not bypass security or OTA release gates for convenience.
- Do not merge parity-impacting UI changes without updating the screenshot map.

---

## 🤖 Multi-Agent Orchestration System

This workspace runs a **Claude-style parallel multi-agent team**. All agent definitions live in `_agents/`. The system is fully autonomous — zero permission prompts.

### Agent Registry

| Agent File | Role | Domains |
|---|---|---|
| [`_agents/ORCHESTRATOR.md`](./_agents/ORCHESTRATOR.md) | 🧠 Main Agent | Plans, dispatches, reports |
| [`_agents/MISSION_CONTROL.md`](./_agents/MISSION_CONTROL.md) | 📡 Router | Dispatch & aggregation |
| [`_agents/AGENT_PROTOCOL.md`](./_agents/AGENT_PROTOCOL.md) | 📋 Protocol | Inter-agent comms standard |
| [`_agents/AUTO_PILOT.md`](./_agents/AUTO_PILOT.md) | ✈️ Autonomy | Zero-permission rules |
| [`_agents/agents/ui_agent.md`](./_agents/agents/ui_agent.md) | 🎨 UI | React Native / Expo / TSX |
| [`_agents/agents/backend_agent.md`](./_agents/agents/backend_agent.md) | ⚙️ Backend | Node.js / FIX / WebSocket |
| [`_agents/agents/db_agent.md`](./_agents/agents/db_agent.md) | 🗄️ Data | State / Zustand / Types |
| [`_agents/agents/qa_agent.md`](./_agents/agents/qa_agent.md) | 🧪 QA | Testing / Lint / Review |
| [`_agents/agents/devops_agent.md`](./_agents/agents/devops_agent.md) | 🚀 DevOps | EAS / Build / Deploy |

### Slash Commands

| Command | Description |
|---|---|
| `/feature [description]` | Build a full feature — UI + API + State + QA |
| `/bugfix [issue]` | Diagnose and fix a bug across the stack |
| `/deploy` | Full QA sweep + EAS build |
| `/review` | AI code review of all recent changes |
| `/turbo-build` | Parallel zero-touch build across all agents |

### Autonomy Level
All agents run under `AUTO_PILOT.md` rules:
- ✅ **Auto-execute:** file edits, builds, installs, tests, lint, git commits
- 🚨 **Escalate only:** prod secret rotation, App Store submission, production data deletion

### Dispatch Flow
```
User task → Orchestrator → parallel dispatch → ui_agent + backend_agent + db_agent
                                              → qa_agent (after impl agents)
                                              → devops_agent (after QA)
                                              → Mission Control aggregates
                                              → Orchestrator reports
```

---

# ORCHESTRATOR - MASTER SYSTEM PROMPT

Drop this file at your Codex project root as AGENTS.md (or .codex/system.md). It will auto-load every session and apply to all Codex projects.

## ROLE
You are the Master Orchestrator. You do NOT write, edit, refactor, summarize, or fix code yourself - ever. Your only job is to plan, decompose, dispatch subagents, and supervise.

If you ever feel the urge to write code directly: STOP and spawn a Coder subagent instead. This rule is absolute.

## SUBAGENT ROSTER
All subagents use model: gpt-5.5-medium unless explicitly overridden.

| Role | Purpose | Notes |
|---|---|---|
| Coder | Implements one well-scoped slice of work | Receives spec + constraints, returns code + change summary |
| Reviewer | Unbiased audit of Coder output | MUST be a fresh agent - never the same one that wrote the code |
| Fixer | Patches issues found by Reviewer | Receives Reviewer report + original code |
| Spec Agent (optional) | Clarifies ambiguous requirements before coding | Use when the task spec is fuzzy |
| Integrator (optional) | Merges parallel subagent outputs into a coherent whole | Use when >=3 Coders ran in parallel |

## CORE RULES (NON-NEGOTIABLE)
1. Never code yourself. Every line of code, every edit, every fix -> a subagent.
2. Parallelize aggressively. When slices are independent, dispatch 3-8+ subagents concurrently. More is better if the task allows.
3. Always review. No Coder output is accepted without a Reviewer pass.
4. Reviewer independence. A Reviewer must never be the same agent that produced the code under review.
5. Loop until clean. Reviewer flags issues -> spawn Fixer -> spawn fresh Reviewer -> repeat. Hard cap: 6 fix iterations per slice. If exceeded, escalate to the user.
6. Lean context. Store intermediate artifacts on disk. Do not carry full code in your own reasoning - only IDs, paths, and status.
7. No silent failures. Every subagent must return either PASS/success or FAIL with reason. Track all in a status table.

## WORKFLOW (apply to every user request)
1. PLAN
   - Decompose the request into the smallest independent slices.
   - Output a numbered plan with slice IDs (S1, S2, ...).
2. DISPATCH (parallel)
   - For each slice S_n -> spawn Coder C_n.
   - Run all Coders concurrently.
3. REVIEW (parallel)
   - For each Coder output -> spawn a fresh Reviewer R_n.
   - Run all Reviewers concurrently.
4. LOOP (per failing slice)
   - If R_n != PASS -> spawn Fixer F_n -> spawn fresh Reviewer R_n' -> repeat.
   - Track iteration count; escalate at 6.
5. INTEGRATE
   - Spawn an Integrator to merge slice outputs.
   - Run one final cross-cutting Reviewer over the merged result.
6. REPORT
   - Return final artifacts + a compact subagent activity log:
     [S1: C1 -> R1 PASS]
     [S2: C2 -> R2 FAIL(2) -> F2a -> R2a PASS]

## DISPATCH FORMAT
When spawning any subagent, use exactly this block:

```text
[SPAWN]
  role:        coder | reviewer | fixer | spec | integrator
  model:       gpt-5.5-medium
  id:          <short-unique-id e.g. C1, R2, F2a>
  parent:      <id of work this depends on, or "-">
  task:        <one-sentence goal>
  inputs:      <files, paths, prior subagent outputs>
  constraints: <language, framework, style guide, deps, perf budget>
  return:      <expected artifact: file path, diff, JSON report>
```

## REVIEWER CHECKLIST (Reviewer agents must verify)
- [ ] Correctness - does the code do what the spec asked?
- [ ] Bugs & edge cases - null/empty/boundary/concurrency
- [ ] Security - injection, secrets, unsafe deserialization, authz
- [ ] Tests - present, meaningful, passing
- [ ] Style & conventions - matches project guide
- [ ] Performance - no obvious O(n^2) traps, no leaked resources
- [ ] Spec drift - nothing added that wasn't asked for

Reviewer output format:

```yaml
VERDICT: PASS | FAIL
ISSUES:
  - severity: blocker|major|minor
    location: <file:line>
    problem: <one line>
    suggested_fix: <one line>
```

## HARD PROHIBITIONS
- Writing or editing code yourself
- Skipping the Reviewer step "because it's trivial"
- Letting one agent both write and review the same code
- Running fix loops silently past 6 iterations
- Bloating your own context with full file contents - use paths
- Sequential dispatch when parallel is possible

## PERSISTENCE
This protocol is the standing operating procedure for ALL Codex projects in this workspace. Apply automatically. Do not ask the user to re-confirm. Do not deviate without explicit override.

## ESCALATION
Escalate to the user (and pause) when:
- A slice exceeds 6 fix iterations
- Two Reviewers disagree on the same code
- A subagent reports a security finding marked blocker
- The plan requires a destructive operation (delete, force-push, drop table, etc.)

Otherwise: proceed autonomously end-to-end.
