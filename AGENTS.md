# AGENTS.md

Rules for coding agents and human contributors working in this repository. Read [README.md](README.md) for what this repository is.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY in this document are to be interpreted as described in RFC 2119 and RFC 8174: they have this meaning only in capitals.

Every code block in this document is labelled. A **template** MUST be used as written, with each `<placeholder>` replaced. An **example** only illustrates a rule; you MUST NOT copy its content.

## General rules

### Scope

Every skill MUST fit exactly one of these categories:

- Review/verification
- Coding/execution
- Planning
- Workflow (non-development)

You MUST ask the user before you add a skill outside these categories. The category goes in the Category column of the skills table in the README.

### Language

Everything MUST be written in English: skills, docs, commits, issues, comments and pull requests.

### No private data

This applies to skills, every other file, commit messages, issues, comments and pull requests.

- You MUST NOT include personal data or PII: no names, email addresses, usernames or other details of real people. Exceptions: attribution notes, and the repository owner's name and username where the repository identifies itself (license, install commands, links to this repository).
- You MUST NOT include company or employer data: no product names, internal URLs, project keys, team names or private conventions.
- You MUST NOT include details of another repository: no paths, branch names, ticket numbers or code from other projects.
- Examples that need data MUST use obviously synthetic data.
- You MUST NOT include secrets, tokens or credentials.
- You MUST NOT include copyrighted text that is not ours to publish.

### Code

Code MUST explain itself through clear names and small functions. Comments MUST explain why something is done, never what it does.

## Writing skills

### Layout

- Every skill MUST live in `skills/<skill-name>/`. The installer discovers skills there.
- You MUST NOT put a `SKILL.md` in the repository root. The installer would treat the whole repository as one skill.
- A skill folder contains `SKILL.md`, `tests/triggers.md` and, if needed, `scripts/`, `references/` and `assets/`. Everything the skill uses MUST stay inside its folder.

### Frontmatter

Template:

```yaml
---
name: <skill-name>
description: Use when <…>
---
```

- `name` MUST use lowercase letters, digits and hyphens, be at most 64 characters, have no leading, trailing or double hyphens, and match the folder name.
- `description` MUST be at most 1024 characters. It MUST start with "Use when …", use the phrases a user would type, and name close cases where the skill MUST NOT load. The agent sees only this before it decides to load the skill.
- You MAY use the other fields of the Agent Skills specification: `license`, `compatibility` (at most 500 characters), `metadata` and `allowed-tools`. The skill MUST still work in a harness that ignores them. You MUST NOT add fields outside the specification.
- A work-in-progress skill SHOULD set `metadata.internal: true`. The installer hides it unless `INSTALL_INTERNAL_SKILLS=1` is set.

### Harness neutrality

Every skill MUST work in any harness that supports `SKILL.md`, such as Claude Code, Codex, pi and Mistral Vibe, unless it states a hard capability requirement. Apply graceful degradation.

- A skill MAY use a capability that only some harnesses have, such as subagents, task lists, structured questions to the user or tool permissions. It MUST describe the capability in generic terms and MUST give the fallback for harnesses without it, for example: "If you can start a subagent, run the review there. Otherwise, run it yourself after the work is done."
- A skill MAY have a hard capability requirement when no fallback can reach its end goal. It MUST describe the capability in generic terms, state it in `compatibility`, and check it in Preflight. When the capability is missing, the skill MUST stop and tell the user.
- A skill MUST NOT refer to a tool, command or setting by a name that only one harness uses.
- `compatibility` MUST NOT limit a skill to one harness. Use it for runtime requirements and hard capability requirements only, for example "Needs git and python3".

### References

- A skill MUST NOT refer to specific files or skills outside its own folder, such as a named instruction file, a config path or another skill by name.
- A skill MAY use generic lookups: "if a skill for writing commit messages is available, use it", "read the project's contribution guide if there is one".
- A skill MAY have a hard dependency on another skill in this repository. It MUST declare it in a `## Requires` section at the top of the `SKILL.md` body, before Preflight: name the skill, say why it is needed and what happens without it.
- A skill MAY name any file inside its own folder.

### Instructions

- Each skill MUST have exactly one end goal. It MAY take several steps or jobs to reach it.
- A skill MUST name the end goal and the exact shape of the result first: format, location and what makes it done. The route to it comes second.
- You SHOULD name existing concepts where they apply (for example "conventional commits", "RFC 2119", "Given/When/Then") instead of explaining them. The model already knows them.
- You MUST NOT invent new concepts or terms. Use the ones the model and the user already know, and use one term per concept throughout the skill.
- Rules MUST use RFC 2119 keywords. You SHOULD NOT explain why a rule exists. Add the reason only when the model repeatedly gets the rule wrong or ignores it.
- You SHOULD give one good example instead of prose. Add a wrong/right pair only for a mistake the model keeps making.
- You SHOULD NOT prescribe specific commands or API calls. Do so only when it is critical that the step is always done that way, or when the model got it wrong without the exact instruction.
- A step whose result has to be the same every time MUST have a fixed form: a script, a reference, an inline code block, a command or an API call.
- A skill MUST name every step that needs confirmation from the user before it runs, such as pushing, deleting or writing to an external system.
- A skill MUST NOT contain time-sensitive information: no version numbers, dates or claims about what is current.
- `SKILL.md` SHOULD stay under about 500 lines. Move detail to `references/` and say when to read each file.

### Preflight

Every skill that depends on input, tools or environment state MUST have a section named `## Preflight` before any step that acts. Only `## Requires` MAY come before it.

- It MUST be a numbered list of checks. The agent MUST work through it in order and mark each item as done.
- It MUST cover what applies: the information the skill needs is present, system requirements are met, the environment is in the expected state.
- Each check MUST say what to do when it fails: ask the user, or stop.

Example. The heading and the first sentence are fixed; the checks are illustrative:

```markdown
## Preflight

You MUST complete these checks in order and mark each one done before you continue.

1. [ ] The user has named the target branch. If not, ask.
2. [ ] `git` is available. If not, stop and tell the user.
3. [ ] The working tree has no uncommitted changes. If it has, ask how to proceed.
```

### Self-healing

Every skill MUST end with a self-healing section. When the skill's task is done, and the user corrected the agent or the skill fell short, the agent offers to:

1. draft an issue for this repository that describes the frustration or mistake as it relates to the skill;
2. optionally draft a pull request that improves the skill.

The agent MUST show the draft and get the user's agreement before it opens anything. Issues and pull requests MUST follow Submitting changes.

Template. You MAY add skill-specific wording, but MUST keep every rule in it:

```markdown
## Self-healing

When the task is done and the user corrected you, or this skill gave wrong or incomplete guidance, offer to draft an issue for https://github.com/FreekVR/skills/issues describing the problem as it relates to this skill. You MAY also offer a pull request that improves the skill. You MUST show the draft and open it only after the user agrees. You MUST NOT include personal, company or repository-specific data. You MUST add the AI disclosure.
```

### Scripts

- Scripts MUST use POSIX shell, `python3` or `node`, with the standard library only.
- Scripts MUST NOT access the network or install packages.
- Scripts MUST NOT write outside the working directory, and MUST NOT change git state unless the skill exists to do that.
- Exception: a script MAY write state that must outlive a session to a per-user data directory: `$XDG_STATE_HOME/<skill-name>/`, or `~/.local/state/<skill-name>/` when `XDG_STATE_HOME` is not set. `SKILL.md` MUST name what is stored there and when it is deleted.
- `SKILL.md` MUST say how to run each script.

### Trigger tests

Every skill MUST ship trigger tests in `skills/<skill-name>/tests/triggers.md`:

- at least three prompts that are expected to load the skill;
- at least two similar prompts that are expected not to load it.

You MUST update them when you change the `description`.

### Verification in isolation

All verification and tests MUST run in isolation, so that nothing outside this repository affects the result.

- The verifying context MUST NOT contain the chat history or the context in which the change was written. A fresh session, or a subagent that starts without that context, both qualify.
- The verifying context MUST see the change under verification, including work that is not committed yet, and no unrelated changes. The only instructions are this `AGENTS.md` and the skills under `skills/`. You MUST NOT switch branches, reset or discard work to get there; verify in place, or in a separate copy of the current state.
- You MUST turn off user-level and global instructions, memory, and skills installed elsewhere, as far as the harness allows. If something cannot be turned off, you MUST say so in the result.
- You MUST report the harness, the model and the result of every trigger prompt.

## Submitting changes

### Commits

- Commit messages MUST follow Conventional Commits. Any type the specification allows MAY be used, such as `feat`, `fix`, `docs`, `refactor`, `test` and `chore`.
- The scope MUST be the skill name, for example `feat(review-pr): ...`. Repository-wide changes, such as changes to this file or the README, MUST omit the scope.
- A change to several skills SHOULD be split into one commit per skill. If it cannot be split, it MUST omit the scope.
- Footers MUST stay clean, because release-please reads them to build the changelog. Use only Conventional Commits footers such as `BREAKING CHANGE:` and release-please footers such as `Release-As:`.
- You MUST NOT add tool or agent attribution as a footer or anywhere else in a commit: no `Co-authored-by` lines for agents, no session links, no "Generated with" lines. The one exception is the AI disclosure block that a squash-merge carries over from the pull request description.

### Pull requests

Pull requests are squash-merged, so the title and description become the commit on `main`.

- The title MUST be a Conventional Commits subject.
- The description MUST start with the AI disclosure.
- After the disclosure, the description MUST be at most two paragraphs: the symptom, the fix or improvement, and why. You MAY add one code example or reproduction steps when they help.
- The description MUST NOT repeat what the diff already shows: no file lists, no change summaries, no test logs.
- A pull request that adds or changes a skill MUST end its description with one sentence that names the models the skill was built with and tested with, for example "Built with model A, tested with models A and B." It does not count toward the two-paragraph limit.
- A line in the description MUST NOT start with a token followed by a colon or by a space and `#`, such as `Fixes:` or `Refs #12`, except an intended footer such as `BREAKING CHANGE:`. Release-please reads those lines as footers.

### Issues and comments

- An issue MUST start with the AI disclosure, followed by at most two paragraphs: the symptom, the expected behavior, and why it matters. You MAY add one code example or reproduction steps.
- A comment on an issue or pull request MUST end with the AI disclosure line.

### AI disclosure

Every issue, pull request and comment MUST carry an AI disclosure. It MUST say if AI was used for the text, the code or the skill, whether a human read and approved what AI generated, and which parts a human wrote by hand. It MUST NOT name a harness or a model.

Pull request and issue descriptions MUST start with a GitHub note panel. Omit "Written by a human" when a human wrote none of it. Template:

```markdown
> [!NOTE]
> **AI disclosure.** AI used for: <the text / the code / the skill / nothing>. Human review: <read and approved by a human / not yet reviewed by a human>. Written by a human: <parts>.
```

Comments MUST end with a single `<sub>` line. Omit "Written by a human" when a human wrote none of it. Template:

```markdown
<sub>AI disclosure: written with AI. Human review: <read and approved by a human / not yet reviewed by a human>. Written by a human: <parts>.</sub>
```

### Attribution

When a change uses someone else's concept, idea or input, you MUST credit them in a plain note. Put it in the pull request description, or in the commit message body for a commit that does not go through a pull request. The note does not count toward the two-paragraph limit. Example:

```
Idea for the review checklist from <author>'s <project or post>.
```

- The note MUST name the author and the work, and say what was taken from it.
- You MUST NOT use a `Co-authored-by` footer, a reference footer or an "authored by" line for this.

### Verification before submission

This repository has no CI/CD and no automated review. You MUST verify every change locally before you push or open a pull request.

- You MUST run the verification in isolation, as described in Verification in isolation, against this `AGENTS.md` only.
- You MUST check every item in the checklist below, fix what fails and run the verification again.
- You MUST report the result to the user before you submit. You MUST NOT put it in the pull request.

#### Checklist

- `name` matches the folder and the frontmatter is valid YAML.
- `npx skills add . --list` shows the skill.
- Trigger tests exist and pass in an isolated run.
- The skill has a Preflight section where it needs one, and ends with a Self-healing section.
- Every file that `SKILL.md` refers to exists. No references break the References rules.
- No private data in the skill, the commit, the issue or the pull request.
- The AI disclosure is present and filled in, and a pull request that adds or changes a skill names the models it was built and tested with.
- Attribution notes are in the pull request or the commit where needed.
- The skills table in the README is up to date, with a category for each skill. Skills with `metadata.internal: true` are not listed.
