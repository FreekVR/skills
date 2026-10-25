# skills

My personal [Agent Skills](https://agentskills.io) for development workflow and writing. One set of `SKILL.md` files that works in Claude Code, Codex, pi, Mistral Vibe and any other harness that supports the format.

```bash
npx skills add FreekVR/skills
```

## Why this exists

Coding agents are good at generic defaults. These skills teach them how I work instead: how I write commits and pull requests, how I review code, and how I write tickets and docs.

I build them for myself, but they are not tied to any employer or private setup. If one is useful to you, use it.

## Install

Requires a recent Node.js.

```bash
# Pick skills and harnesses interactively
npx skills add FreekVR/skills

# One skill, one harness
npx skills add FreekVR/skills --skill <skill-name> -a claude-code

# Available in all your projects
npx skills add FreekVR/skills -g

# Try a skill without installing it
npx skills use FreekVR/skills@<skill-name>
```

Keep them current with `npx skills check` and `npx skills update`.

To install by hand, copy or symlink a folder from `skills/` into your harness's skills directory, for example `.agents/skills/`, `.claude/skills/` or `.vibe/skills/`.

## Skills

| Skill | What it does |
| ----- | ------------ |
| _None yet_ | |

## Layout

```
skills/
  <skill-name>/
    SKILL.md        # frontmatter + instructions
    scripts/        # optional: code the agent runs
    references/     # optional: docs the agent reads on demand
    assets/         # optional: templates and static files
    tests/          # trigger tests: prompts that must and must not load it
```

## Feedback

Using one of these skills? I'd love to hear about it: [open an issue](https://github.com/FreekVR/skills/issues) or just drop a note. Improvements are welcome as pull requests; see [AGENTS.md](AGENTS.md) for the rules every skill follows.

## License

[MIT](LICENSE)
