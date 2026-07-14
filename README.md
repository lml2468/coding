<p align="center">
<picture>
<source srcset="assets/coding.png" media="(prefers-color-scheme: dark)">
<source srcset="assets/coding.png" media="(prefers-color-scheme: light)">
<img src="assets/coding.png" alt="coding Logo" width="500" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;">
</picture>
</p>

<p align="center">
<strong>An out-of-the-box engineering framework for Claude Code.</strong><br/>
<sub>AI writes code fast, but every session it starts from scratch — no memory of your project, your conventions, or your team's requirements. coding persists specs, tasks, and memory into your repo, so Claude Code works to your engineering standards.</sub>
</p>

<p align="center">
<a href="./README_CN.md">简体中文</a>
</p>

<p align="center">
<a href="https://github.com/lml2468/coding/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-16a34a.svg?style=flat-square" alt="license" /></a>
<a href="https://github.com/lml2468/coding/stargazers"><img src="https://img.shields.io/github/stars/lml2468/coding?style=flat-square&color=eab308" alt="stars" /></a>
<a href="https://github.com/lml2468/coding/issues"><img src="https://img.shields.io/github/issues/lml2468/coding?style=flat-square&color=e67e22" alt="open issues" /></a>
</p>

## Why coding?

`coding` is a Claude Code-only fork of [Trellis](https://github.com/mindfold-ai/Trellis), stripped down to a single platform and simplified around Claude Code's native sub-agent workflow.

| Capability | What it changes |
| --- | --- |
| **Auto-injected specs** | Write conventions once in `.coding/spec/`, then let coding inject the relevant context into each session instead of repeating yourself. |
| **Task-centered workflow** | Keep PRDs, implementation context, review context, and task status in `.coding/tasks/` so AI work stays structured. |
| **Project memory** | Journals in `.coding/workspace/` preserve what happened last time, so each new session starts with real context. |
| **Team-shared standards** | Specs live in the repo, so one person's hard-won workflow or rule can benefit the whole team. |
| **Claude-native loop** | A four-phase Plan → Implement → Verify → Finish loop built on Claude Code's sub-agents and skills. |

## Prerequisites

- **Node.js** >= 18
- **Python** >= 3.9
- **Claude Code**

## Quick Start

```bash
# 1. Install coding
npm install -g @limenglin/coding@latest

# 2. Initialize in your repo
coding init -u your-name
```

## How to Use

The workflow is simple:

1. **Describe what you want** in natural language.
2. **Brainstorm** with the AI one question at a time until the PRD is clear, then implementation begins.
3. **Let it run** — the AI calls coding Implement and auto-checks the result against specs, lint, type-check, and tests.
4. **Type `/coding:finish-work`** when the work is done or the session context fills up. coding archives the task and updates journals.

## How It Works

coding runs a 4-phase loop with auto-invoked skills and sub-agents:

1. **Plan** — `coding-brainstorm` walks through requirements one question at a time and writes `prd.md`. Research-heavy items go to a `coding-research` sub-agent. The result is curated specs + research files referenced from `implement.jsonl` / `check.jsonl`.
2. **Implement** — a `coding-implement` sub-agent writes code from the PRD with the curated context auto-injected, no git commit.
3. **Verify** — a `coding-check` sub-agent reviews the diff against specs and runs lint, type-check, and tests, self-fixing where it can.
4. **Finish** — a final check runs, then `coding-update-spec` promotes new learnings back into `.coding/spec/` so the next session starts smarter.

## FAQ

<details>
<summary><strong>How is coding different from <code>CLAUDE.md</code>?</strong></summary>

`CLAUDE.md` is a useful entry point, but it tends to become monolithic. coding adds scoped specs, task PRDs, workflow gates, and workspace memory around it.

</details>

<details>
<summary><strong>Does coding support other AI platforms?</strong></summary>

No. coding is intentionally Claude Code-only. If you need multi-platform support, use the upstream [Trellis](https://github.com/mindfold-ai/Trellis) project.

</details>

<details>
<summary><strong>Is coding for solo developers or teams?</strong></summary>

Both. Solo developers use it for memory and repeatable workflow. Teams get the larger benefit: shared standards, task boundaries, and reviewable context.

</details>

<details>
<summary><strong>Do I have to write every spec file manually?</strong></summary>

No. Many teams start by letting AI draft specs from existing code and then tighten the important parts by hand. coding works best when you keep the high-signal rules explicit and versioned.

</details>

## Credits

`coding` is a fork of [Trellis](https://github.com/mindfold-ai/Trellis) by Mindfold LLC, licensed under AGPL-3.0. This fork is maintained by [lml2468](https://github.com/lml2468) and remains AGPL-3.0.

<p align="center">
<a href="https://github.com/lml2468/coding">Repository</a> •
<a href="https://github.com/lml2468/coding/blob/main/LICENSE">AGPL-3.0 License</a> •
Forked from <a href="https://github.com/mindfold-ai/Trellis">Trellis</a>
</p>
