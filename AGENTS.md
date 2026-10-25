# AGENTS.md

Rules for coding agents working in this repository.

## What this repository is

Personal Agent Skills in the open `SKILL.md` format, for development workflow and for writing (tickets, pull requests, docs). They install with `npx skills add FreekVR/skills`.

## Scope

- Skills cover development workflow or writing and docs. Ask before adding a skill outside that scope.
- Write everything in English: skills, docs, commits and pull requests.

## No private data

This applies to skills, every other file, commit messages and pull requests.

- No personal data and no PII: no names, email addresses, usernames or other details of real people, except the attribution notes described under Attribution, and the repository owner's name and username where the repository identifies itself (license, install commands, links to this repository).
- No company or employer data: no product names, internal URLs, project keys, team names or private conventions.
- No details of a specific repository: no paths, branch names, ticket numbers or code from other projects.
- When an example needs data, use obviously synthetic data.

## References

- Do not refer to specific files or skills outside the skill's own folder, for example a named instruction file, a config path or another skill by name.
- Generic lookups are allowed: "if a skill for writing commit messages is available, use it", "read the project's contribution guide if there is one".
- A hard dependency on another skill in this repository is allowed. Declare it in a `## Requires` section at the top of the `SKILL.md` body: name the skill, say why it is needed and what happens without it.
- Files inside the skill's own folder (`scripts/`, `references/`, `assets/`, `tests/`) are always fine to name.

## Harness neutrality

Every skill must work the same in Claude Code, Codex, pi, Mistral Vibe and any other harness that supports `SKILL.md`. No exceptions.

- Do not refer to tools, slash commands, subagents or settings that exist in one harness only. Describe the action instead: "read the file", "run the command", "ask the user".
- Do not use `allowed-tools` or other harness-specific frontmatter.
- Do not use `compatibility` to limit a skill to one harness. Use it only for runtime requirements, for example "Needs git and python3".
- If a skill cannot work without one harness, it does not belong here.

## Layout

- Put every skill in `skills/<skill-name>/`. The installer discovers skills there.
- Never put a `SKILL.md` in the repository root. The installer would treat the whole repository as one skill.
- A skill folder contains `SKILL.md`, `tests/triggers.md` and, if needed, `scripts/`, `references/` and `assets/`. Everything the skill uses stays inside its folder.

## SKILL.md

Frontmatter:

```yaml
---
name: skill-name
description: What the skill does and when to use it.
---
```

- `name`: lowercase letters, digits and hyphens, at most 64 characters, no leading, trailing or double hyphens. It must match the folder name.
- `description`: at most 1024 characters. State what the skill does and when to use it, in the words a user would type. The agent sees only this before it decides to load the skill.
- Allowed optional fields: `license`, `compatibility` (at most 500 characters), `metadata`. Nothing else.
- Set `metadata.internal: true` on a work-in-progress skill. The installer hides it unless `INSTALL_INTERNAL_SKILLS=1` is set.

Body:

- Keep `SKILL.md` under about 500 lines. Move detail to `references/` and say when to read each file.

## Writing skill instructions

- Give each skill exactly one end goal. A skill MAY take several steps or jobs to reach it.
- Name the end goal and the exact shape of the result: format, location and what makes it done. The route to it comes second.
- Write the `description` as "Use when …" with the phrases a user would type. Name close cases where the skill MUST NOT load.
- Name existing concepts where they apply (for example "conventional commits", "RFC 2119", "Given/When/Then") instead of explaining them. The model already knows them.
- Do not invent new concepts or terms. Use the ones the model and the user already know, and use one term per concept throughout the skill.
- Write rules with RFC 2119 keywords: MUST, MUST NOT, SHOULD, SHOULD NOT, MAY. Do not explain why a rule exists. Add the reason only when the model repeatedly gets the rule wrong or ignores it.
- Prefer one good example over prose. Add a wrong/right pair only for a mistake the model keeps making.
- Do not prescribe specific commands or API calls. Do so only when it is critical that the step is always done that way, or when the model got it wrong without the exact instruction.
- When a step must give the same result every time, fix its form: a script, a reference, an inline code block, a command or an API call.
- Name every step that needs confirmation from the user before it runs, such as pushing, deleting or writing to an external system.
- Nothing time-sensitive: no version numbers, dates or claims about what is current.

## Preflight

Every skill that depends on input, tools or environment state MUST start with a section named `## Preflight`, placed before any step that acts.

- Write it as a numbered list of checks. The agent MUST work through it in order and mark each item as done.
- Cover what applies: the information the skill needs is present, system requirements are met, the environment is in the expected state.
- For each check, say what to do when it fails: ask the user, or stop.

```markdown
## Preflight

You MUST complete these checks in order and mark each one done before you continue.

1. [ ] The user has named the target branch. If not, ask.
2. [ ] `git` is available. If not, stop and tell the user.
3. [ ] The working tree has no uncommitted changes. If it has, ask how to proceed.
```

## Self-healing

Every skill MUST end with a self-healing step. When the skill's task is done, and the user corrected the agent or the skill fell short, the agent offers to:

1. draft an issue for this repository that describes the frustration or mistake as it relates to the skill;
2. optionally draft a pull request that improves the skill.

The agent MUST show the draft and get the user's agreement before it opens anything. Issues and pull requests follow the rules in this file, including No private data. Use this section in each skill, adapted where needed:

```markdown
## Self-healing

When the task is done and the user corrected you, or this skill gave wrong or incomplete guidance, offer to draft an issue for https://github.com/FreekVR/skills/issues describing the problem as it relates to this skill. You MAY also offer a pull request that improves the skill. You MUST show the draft and open it only after the user agrees. You MUST NOT include personal, company or repository-specific data.
```

## Scripts

- Allowed languages: POSIX shell, `python3`, `node`. Use the standard library only.
- No network access and no package installs.
- Do not write outside the working directory. Do not change git state unless the skill exists to do that.
- Document how to run each script in `SKILL.md`.

## Other content

- No secrets, tokens or credentials.
- No copyrighted text that is not ours to publish.

## Commits

Use conventional commits: `feat(<skill-name>): ...`, `fix(<skill-name>): ...`, `docs: ...`, `chore: ...`.

Keep commit and pull request footers clean. Release tooling reads them to build the changelog.

- Use only conventional commit footers, such as `BREAKING CHANGE:` and `Release-As:`.
- Do not add tool or agent attribution: no `Co-authored-by` lines for agents, no session links, no "Generated with" lines. This applies to commits and to pull request descriptions.

Pull requests are squash-merged, so the title and description become the commit on `main`.

- Write the pull request title as a conventional commit subject.
- Do not start any line in the description with `Word:` or `Word #`, except for an intended footer such as `BREAKING CHANGE:`. Release tooling reads those lines as footers.

## Issues and pull requests

Keep them short and to the point.

- At most two paragraphs: the symptom, the fix or improvement, and why.
- Add one code example or reproduction steps only when they help.
- Do not repeat what the diff already shows: no file lists, no change summaries, no test logs.

## Code

Write code that explains itself through clear names and small functions. Comment only on why something is done, never on what it does.

## Attribution

Attribution is required. When a change uses someone else's concept, idea or input, credit them as a plain note in the commit message body and in the pull request description, which becomes the commit on squash-merge. For example:

```
Idea for the review checklist from <author>'s <project or post>.
```

- Name the author and the work, and say what was taken from it.
- Use a note only. Do not use a `Co-authored-by` trailer, a reference trailer or an "authored by" line for this.

## Trigger tests

Every skill ships trigger tests in `skills/<skill-name>/tests/triggers.md`:

- at least three prompts that must load the skill;
- at least two similar prompts that must not load it.

Update them when you change the `description`.

## Verification in isolation

Run all verification and tests in isolation, so that nothing outside this repository affects the result.

- Start a fresh session with no chat history.
- Use a clean checkout of this repository as the working directory. The only instructions are this `AGENTS.md` and the skills under `skills/`.
- Turn off user-level and global instructions, memory, and skills installed elsewhere. If a harness cannot turn something off, say so in the result.
- Do not run tests in the session that wrote the skill. Its context biases the result.
- Report the harness you used and the result of every trigger prompt.

## Review before submission

This repository has no CI/CD and no automated review. You MUST verify and review every change locally before you push or open a pull request.

- Run the review in isolation, as described above, against this `AGENTS.md` only.
- Check every item in Before you finish. Fix what fails and run the review again.
- Report the result to the user before you submit. Do not put it in the pull request.

## Before you finish

- `name` matches the folder and the frontmatter is valid YAML.
- `npx skills add . --list` shows the skill.
- Trigger tests exist and pass in an isolated run.
- The skill has a Preflight section where it needs one, and ends with a Self-healing section.
- Every file that `SKILL.md` refers to exists. No references break the References rules.
- No private data in the skill, the commit or the pull request.
- Attribution notes are in the commit where needed.
- The skills table in `README.md` is up to date. Skills with `metadata.internal: true` are not listed.
