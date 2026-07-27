# Getting good UI work out of Claude Code on Finora

This is the setup and the prompting patterns for this repo. The short version: an agent is
only as good as the context it starts with and the checks it can run on itself. Copilot's
inline completion wins on speed for a single-file edit you already know how to make;
an agent wins on multi-file features — but only if the conventions are written down and
the verification is runnable. That's what the files below are for.

## What's installed

| Path | What it does |
| --- | --- |
| `CLAUDE.md` | Loaded automatically every session. Architecture, domain model, conventions. |
| `.claude/skills/finora-ui/SKILL.md` | UI implementation rules + verify loop. Loads on UI work, or type `/finora-ui`. |
| `.claude/agents/ui-reviewer.md` | Subagent: audits a UI diff against the conventions. Reports, doesn't fix. |
| `.claude/agents/i18n-sync.md` | Subagent: repairs en/ar/fa parity with real translations. |
| `.claude/settings.json` | Pre-approves the check commands so runs don't stall on permission prompts. |
| `scripts/i18n-check.mjs` | `npm run i18n:check` — makes "keep ar/fa in sync" a pass/fail gate. |
| `npm run verify` | lint + typecheck + i18n parity in one command. |

The single biggest lever is the last two rows. A convention an agent can *test* gets
followed; a convention it can only read gets followed about 70% of the time.

## The prompt shape that works here

Weak: *"add an expenses page"* — the agent picks its own scope, styling, and data shape,
and you review a large diff you didn't specify.

Strong, four parts:

```
[1 GOAL]      Add a "Cost centres" list page at /app/cost-centres.
[2 PATTERN]   Follow src/pages/customers/CustomersPage.tsx exactly — same table +
              search + Segmented filter layout, same FormModal sibling for create/edit.
[3 DATA]      Read via a new useCostCentres hook in queries.ts over an existing
              api.ts selector. Columns: code, name, owner, YTD spend (Money), status
              (StatusTag).
[4 DONE]      npm run verify clean, npm run smoke green, and show me the dark-mode
              and fa-RTL screenshots before you commit.
```

Part 2 is what most people leave out and it matters more than the rest. "Follow file X"
gives the agent a concrete target for layout, spacing, and idiom — it is the difference
between output that matches your app and output that matches generic Ant Design.

Part 4 is what separates a claim from a result. Ask for the evidence and you get the
verify loop actually run.

## Working patterns

**Plan before big changes.** For anything touching more than ~3 files, ask for the plan
first: *"Plan this, don't write code yet — list the files you'll touch and the query keys
you'll add."* Correcting a plan costs one message; correcting a 600-line diff costs a
session. Shift+Tab twice enters plan mode, which enforces this.

**Screenshots close the loop.** `npm run smoke` writes to `/tmp/finora-shots` and exits
non-zero on any console error. Then say: *"read back 03-dashboard-dark.png and
08-dashboard-fa-rtl.png and tell me what looks wrong."* An agent that has looked at the
render catches overflow, contrast, and broken RTL mirroring that no type-checker will.
This is the closest thing to the feedback loop you get from watching yourself code, and
it's the main thing that makes agentic UI work land.

**Delegate the audit.** After a UI change: *"run the ui-reviewer agent on this diff."*
A fresh subagent with a checklist and no memory of writing the code finds the
hard-coded `marginLeft` that the author just spent an hour not seeing.

**Delegate the translations.** Never hand-write ar/fa. Add English keys, then:
*"run i18n-sync."*

**Figma, if you design there.** The Figma MCP server is connected in this environment.
Paste a frame URL and ask to implement it — the agent reads the actual frame (layout,
spacing, tokens), it isn't guessing from a description. Anchor it: *"implement this frame,
but use our theme tokens and PageHeader, not the raw Figma colors."*

**Point at reality, not memory.** *"Look at how ContractsPage handles the empty state and
do the same"* beats any amount of description. File paths in a prompt are cheap and exact.

## Two things to stop doing

**Don't accept "should work".** If the reply doesn't say which checks ran, they probably
didn't. Ask: *"paste the verify output."*

**Don't let one session run for hours.** Context fills; quality drops with it. One feature
per session, commit, start fresh. Long threads are the most common cause of "it got worse
as we went".

## When Copilot is genuinely the better tool

Be honest about the split. Inline completion inside a file you're already editing — a
column definition, an interface, the next three lines of an obvious loop — is faster with
Copilot and always will be; you don't want a planning agent for a tab-complete. Reach for
Claude Code when the work spans files and needs the conventions held in mind at once:
a new page across its six touch points, a refactor of `api.ts` selectors, an RTL sweep, a
change that has to stay translated in three locales. Using both is not a contradiction.
