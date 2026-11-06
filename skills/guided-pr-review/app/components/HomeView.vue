<script setup lang="ts">
// The overview of the PR. The reading column holds the PR and its checks, worst first, each one line that opens in
// place; the side panel holds what changed since the last review and the reviewer's own review, in view while scrolling.
const data = computed(() => home())
const criteria = computed(() => criteriaPanel())
const findings = computed(() => findingsPanel())
const checks = computed(() => homeChecks())
const since = computed(() => sinceLastTime())
const review = computed(() => state.review)
const context = computed(() => state.review.context)

// A fold remembers that it is open, so a redraw or a return to Home keeps it open.
function toggle(key: string, event: Event) {
  if ((event.target as HTMLDetailsElement).open) state.ui.openExplain.add(key)
  else state.ui.openExplain.delete(key)
}
function flip(key: string) {
  if (state.ui.openExplain.has(key)) state.ui.openExplain.delete(key)
  else state.ui.openExplain.add(key)
}

const label = 'm-0 mb-2.5 flex flex-wrap items-center gap-2 font-display text-meta tracking-[.1em] text-muted uppercase'
const fold = 'inline-flex cursor-pointer list-none items-center gap-2 py-2 text-ui font-semibold text-default [&::-webkit-details-marker]:hidden'
// A passed check carries a check mark; a check that only informs carries an info mark, so it never reads as passed.
// Related tickets and the linked PRs outside this PR's stack open on request; the stack box shows the PRs in the stack.
const related = computed(() => context.value.relatedTickets || [])
const otherPrs = computed(() => (context.value.linkedPrs || []).filter((pr: { repo: string, number: number }) => !inStack(pr)))
const relatedCount = computed(() => [related.value.length && plural(related.value.length, 'ticket'), otherPrs.value.length && plural(otherPrs.value.length, 'PR')].filter(Boolean).join(' · '))
const QUIET_ICONS: Record<string, { icon: string, color: string }> = { ok: { icon: 'i-lucide-circle-check', color: 'text-success' }, quiet: { icon: 'i-lucide-info', color: 'text-muted' } }
</script>

<template>
  <!-- Home uses the full width of the main column: the reading column grows with the window. -->
  <section class="min-w-0 px-gutter pt-10 pb-30 wrap-anywhere rail:px-14">
    <!-- Two columns only where the reading column keeps room next to the rail and the side panel. -->
    <div class="grid gap-x-14 gap-y-10 rail:grid-cols-[minmax(0,1fr)_340px]">
      <div class="min-w-0">
        <!-- On a wide screen the stack sits next to the PR text, so the reading column uses its width. -->
        <section aria-labelledby="home-pr" class="min-[1600px]:grid min-[1600px]:grid-cols-[minmax(0,1fr)_minmax(0,560px)] min-[1600px]:gap-x-14">
          <div class="min-w-0">
            <h3 id="home-pr" :class="label">
              This pull request <AiTag v-if="context.summary" label="AI summary" class="tracking-normal normal-case" />
            </h3>
            <div v-if="context.summary" class="lead [&>:first-child]:mt-0 [&>:last-child]:mb-0">
              <SafeMarkdown :value="context.summary" />
            </div>
            <p v-for="ticket in context.tickets || []" :key="ticket.key" class="m-0 mt-3 text-ui">
              Resolves <a :href="ticket.url" target="_blank" rel="noopener" class="font-mono text-info">{{ ticket.key }}</a> <b>{{ ticket.title }}</b>
            </p>
            <div class="mt-2">
              <details v-if="review.pr.body" :open="state.ui.openExplain.has('pr-body')" @toggle="toggle('pr-body', $event)">
                <summary :class="fold">
                  Description
                  <UIcon name="i-lucide-chevron-down" class="size-4 text-dimmed" aria-hidden="true" />
                </summary>
                <div class="max-w-[72ch] pb-3 text-body text-toned [&>:first-child]:mt-0 [&>:last-child]:mb-0">
                  <SafeMarkdown :value="review.pr.body" />
                </div>
              </details>
              <details v-if="related.length || otherPrs.length" :open="state.ui.openExplain.has('related')" @toggle="toggle('related', $event)">
                <summary :class="fold">
                  Related tickets and other PRs
                  <span class="text-label font-normal text-muted">{{ relatedCount }}</span>
                  <UIcon name="i-lucide-chevron-down" class="size-4 text-dimmed" aria-hidden="true" />
                </summary>
                <div class="max-w-[72ch] pb-3">
                  <template v-if="related.length">
                    <h4 class="m-0 text-ui font-semibold">
                      Related tickets
                    </h4>
                    <p class="m-0 mb-1.5 text-label text-muted">
                      Open tickets on the same code, found by the agent. A finding may already be planned in one of them.
                    </p>
                    <ul class="m-0 grid list-disc gap-1 pl-5 text-ui text-toned">
                      <li v-for="ticket in related" :key="ticket.key">
                        <a :href="ticket.url" target="_blank" rel="noopener" class="font-mono text-info">{{ ticket.key }}</a> {{ ticket.title }}
                      </li>
                    </ul>
                  </template>
                  <template v-if="otherPrs.length">
                    <h4 class="m-0 text-ui font-semibold" :class="related.length && 'mt-4'">
                      Other PRs <AiTag v-if="otherPrs.some((pr: { summary?: string }) => pr.summary)" label="AI summaries" class="ml-1" />
                    </h4>
                    <p class="m-0 mb-1.5 text-label text-muted">
                      Linked from the tickets or this PR, outside its stack.
                    </p>
                    <ul class="m-0 grid list-disc gap-1 pl-5 text-ui text-toned">
                      <li v-for="pr in otherPrs" :key="`${pr.repo}#${pr.number}`">
                        <a :href="pr.url" target="_blank" rel="noopener" class="font-mono text-info">{{ pr.repo }}#{{ pr.number }}</a> {{ pr.title }} <span class="text-muted">{{ pr.state.toLowerCase() }}</span>
                        <span v-if="pr.summary" class="block text-label text-muted"><MarkupText :text="pr.summary" /></span>
                      </li>
                    </ul>
                  </template>
                </div>
              </details>
            </div>
          </div>
          <HomeStack v-if="hasStack()" class="min-[1600px]:mt-0 min-[1600px]:self-start" />
        </section>

        <div class="mt-14" role="group" aria-label="What needs your attention">
          <h3 :class="label">
            What needs your attention
          </h3>
          <p v-if="!checks.attention.length" class="m-0 text-body text-toned">
            Nothing. Every check passed or has been decided.
          </p>
          <HomeCheck v-for="check in checks.attention" :id="check.id" :key="check.id" :level="check.level" :severity="check.severity" :icon="check.icon" :title="check.title" :line="check.line">
            <template v-if="check.id === 'criteria'">
              <!-- In a stack, one list shows each criterion with every PR that meets it, this one included. -->
              <CoverageList v-if="hasStack()" />
              <template v-else>
                <CriteriaRows v-if="criteria.rest.length" :criteria="criteria.rest" />
                <details v-if="criteria.met.length" :open="state.ui.openExplain.has('criteria-met')" @toggle="toggle('criteria-met', $event)">
                  <summary :class="fold">
                    Show the {{ plural(criteria.met.length, 'met criterion', 'met criteria') }}
                    <UIcon name="i-lucide-chevron-down" class="size-4 text-dimmed" aria-hidden="true" />
                  </summary>
                  <CriteriaRows :criteria="criteria.met" />
                </details>
              </template>
            </template>
            <template v-else-if="check.id === 'findings'">
              <p class="m-0 font-mono text-label text-toned">
                {{ findings.bySeverity.map(({ severity, count }) => `${count} ${severity}`).join(' · ') }}
              </p>
              <p class="m-0 mt-0.5 text-label text-muted">
                {{ findings.whole.length }} on the whole PR · {{ findings.onHunks }} in the flows
              </p>
              <!-- The check already folds, so each finding on the whole PR shows as its note, not as a second fold. -->
              <ul v-if="findings.whole.length" role="list" class="m-0 mt-3 grid list-none gap-3 p-0">
                <li v-for="finding in findings.whole" :key="finding.id">
                  <NoteCard type="finding" :item="finding" />
                </li>
              </ul>
            </template>
            <template v-else-if="check.id === 'own'">
              <p class="m-0 text-ui text-toned">
                Resolve, leave open or reply on the Existing reviews page.
              </p>
              <UButton color="neutral" variant="soft" class="mt-2" @click="goReviews()">
                Open Existing reviews
              </UButton>
            </template>
            <template v-else-if="check.id === 'comments'">
              <HomeComment v-for="comment in data.general" :key="comment.id" :comment="comment" />
            </template>
          </HomeCheck>
        </div>

        <div v-if="checks.quiet.length" class="mt-12" role="group" aria-label="Also checked">
          <h3 :class="label">
            Also checked
          </h3>
          <details v-for="item in checks.quiet" :id="`home-${item.id}`" :key="item.id" class="group" :open="state.ui.openExplain.has(`check-${item.id}`)" @toggle="toggle(`check-${item.id}`, $event)">
            <summary class="flex cursor-pointer list-none items-center gap-2.5 py-1 text-ui text-toned hover:text-default [&::-webkit-details-marker]:hidden">
              <UIcon :name="QUIET_ICONS[item.tone].icon" class="size-4 shrink-0" :class="QUIET_ICONS[item.tone].color" aria-hidden="true" />
              <span class="min-w-0 truncate group-open:whitespace-normal"><MarkupText :text="item.title" /></span>
              <UIcon name="i-lucide-chevron-down" class="size-3.5 shrink-0 text-dimmed transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div class="pt-1 pb-3 pl-5">
              <template v-if="item.id === 'criteria'">
                <p v-if="criteria.reason" class="m-0 max-w-[72ch] text-ui text-toned">
                  {{ criteria.reason }}
                </p>
                <CoverageList v-else-if="hasStack()" />
                <CriteriaRows v-else :criteria="criteria.met" />
              </template>
              <p v-else-if="item.id === 'coverage'" class="m-0 max-w-[72ch] text-ui text-toned">
                <AiTag label="AI summary" class="mr-1.5" /><MarkupText :text="context.coverage.summary" /> <span class="text-muted">Source: <MarkupText :text="context.coverage.source" /></span>
              </p>
              <ul v-else-if="item.id === 'skipped'" class="m-0 grid list-disc gap-1 pl-5 text-ui text-toned">
                <li v-for="(text, index) in data.skipped" :key="index">
                  <MarkupText :text="text" />
                </li>
              </ul>
              <p v-else-if="item.id === 'findings'" class="m-0 text-ui text-toned">
                You accepted or dismissed every AI finding: {{ findings.whole.length }} on the whole PR · {{ findings.onHunks }} in the flows.
              </p>
            </div>
          </details>
        </div>
      </div>

      <aside class="grid content-start gap-4 self-start max-rail:order-first rail:sticky rail:top-6" aria-label="Your progress">
        <section v-if="since" class="rounded-card bg-[color-mix(in_srgb,var(--ui-warning)_12%,var(--ui-bg))] px-5 py-5" aria-labelledby="home-since">
          <h3 id="home-since" :class="label" class="mb-1!">
            {{ since.sinceReview ? 'Since your last review' : 'Since your last visit' }}
          </h3>
          <p v-if="since.changes" class="m-0 mb-2.5 font-mono text-meta text-muted">
            <CommitLink :sha="since.changes.from" /> → <CommitLink :sha="since.changes.to" />
          </p>
          <p v-if="since.fresh.length" class="m-0 text-ui font-semibold">
            {{ plural(since.fresh.length, 'new or changed hunk') }}
          </p>
          <p v-if="since.findings.length" class="m-0 text-label text-toned">
            {{ plural(since.findings.length, 'open finding') }} on changed code
          </p>
          <div v-if="since.check" class="mt-2.5">
            <AgentPending v-if="since.check === 'running'" text="The agent is checking the code of this commit…" />
            <template v-else>
              <p class="m-0 text-label text-warning">The agent has not checked the code of this commit yet.</p>
              <AgentPending v-if="agentState() === 'none'" text="" no-agent-text="No agent runs this review. Resume it to check this commit." class="mt-1" />
              <UButton v-else color="primary" class="mt-1.5 font-semibold" @click="refresh()">
                Ask the agent to check it
              </UButton>
            </template>
          </div>
          <!-- What changed is the first thing to read after new commits, so it starts open; the reviewer can fold it away. -->
          <UButton v-if="since.fresh.length" color="neutral" variant="link" class="mt-1 min-h-6 p-0 text-label text-info" @click="showFirstChangedHunk()">
            Show the first changed hunk
          </UButton>
          <div v-if="since.changes" class="mt-3">
            <button class="group flex min-h-6 w-full cursor-pointer items-center gap-1.5 text-left text-label font-semibold" :aria-expanded="!state.ui.openExplain.has('since-folded')" @click="flip('since-folded')">
              What changed <AiTag label="" />
              <UIcon name="i-lucide-chevron-down" class="ml-auto size-4 text-dimmed transition-transform group-aria-expanded:rotate-180" aria-hidden="true" />
            </button>
            <div v-if="!state.ui.openExplain.has('since-folded')" class="mt-1 text-label leading-snug text-toned [&_li]:my-1 [&_li]:ps-0 [&_li]:leading-snug [&_ol]:my-0 [&_ol]:ps-4 [&_p]:my-0 [&_p]:leading-snug [&_ul]:my-0 [&_ul]:ps-4">
              <SafeMarkdown :value="since.changes.summary" />
            </div>
          </div>
        </section>

        <section id="home-progress" class="rounded-card bg-elevated px-5 py-5" aria-labelledby="home-mine">
          <h3 id="home-mine" :class="label">
            Your review
          </h3>
          <dl class="m-0 flex gap-6 [&>div]:flex [&>div]:flex-col-reverse">
            <div>
              <dt class="text-label text-muted">
                seen
              </dt>
              <dd class="m-0 font-display text-stat leading-none">
                {{ data.seen }}<span class="text-lead text-muted">/{{ data.total }}</span>
              </dd>
            </div>
            <div>
              <dt class="text-label text-muted">
                {{ data.items.length === 1 ? 'remark' : 'remarks' }}
              </dt>
              <dd class="m-0 font-display text-stat leading-none">
                {{ data.items.length }}
              </dd>
            </div>
          </dl>
          <div class="mt-3 h-1.5 rounded-full bg-accented" aria-hidden="true">
            <div class="h-1.5 rounded-full bg-(--ui-text)" :style="{ width: `${data.total ? (data.seen / data.total) * 100 : 0}%` }" />
          </div>
          <UButton v-if="data.seen < data.total" color="neutral" class="mt-3.5 w-full justify-center font-display" @click="nextUnseen()">
            Continue reviewing
          </UButton>
          <UButton v-else color="neutral" class="mt-3.5 w-full justify-center font-display" @click="goTerminus()">
            Submit review…
          </UButton>
        </section>
      </aside>
    </div>
  </section>
</template>
