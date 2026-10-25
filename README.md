# skills

This repo contains [Agent Skills](https://agentskills.io) that I created for my own development workflow. My personal preferences shine through: I use AI as a supplement, but I prefer to stay in control, understand what it is doing, and have it work the way I work.

You may find these skills useful for your workflows too. If you end up using them, I'd love to know. And if you have suggestions, please open an [issue](https://github.com/FreekVR/skills/issues) or a pull request 🙂

The skills use the open `SKILL.md` format, so they work in Claude Code, Codex, pi, Mistral Vibe and other harnesses that support it.

## Skills

| Skill | Category | What it does |
| ----- | -------- | ------------ |
| _None yet_ | | |

## Installation

### With npx skills

The easiest route is the [`skills`](https://skills.sh) CLI. It needs Node.js.

```bash
# Pick skills and harnesses interactively
npx skills add FreekVR/skills

# One skill, one harness
npx skills add FreekVR/skills --skill <skill-name> -a claude-code

# Available in all your projects
npx skills add FreekVR/skills -g
```

Keep them current with `npx skills check` and `npx skills update`.

### Manually

Copy or symlink a folder from `skills/` into your harness's skills directory, for example `.agents/skills/`, `.claude/skills/` or `.vibe/skills/`.

## Contributing

Every skill and contribution follows the rules in [AGENTS.md](AGENTS.md).

### Layout

```
skills/
  <skill-name>/
    SKILL.md        # frontmatter + instructions
    tests/
      triggers.md   # prompts that should and should not load the skill
    scripts/        # optional: code the agent runs
    references/     # optional: docs the agent reads on demand
    assets/         # optional: templates and static files
```

## License

[MIT](LICENSE)
