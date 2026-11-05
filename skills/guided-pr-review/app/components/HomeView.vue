<script setup lang="ts">
// The overview of the PR: what to look at first, the flows and the reviewer's progress.
const data = computed(() => home())
const criteria = computed(() => criteriaPanel())
const findings = computed(() => findingsPanel())
const review = computed(() => state.review)
const context = computed(() => state.review.context)

const flows = computed(() => lines().map((line: { stops: { hunkId: string }[] }) => ({
  line,
  seen: line.stops.filter((stop) => isSeen(stop.hunkId)).length,
  findings: flowFindingsPill(line),
  verdict: flowVerdict(line),
})))

const GLANCE_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = { ok: 'success', warn: 'warning', bad: 'error', info: 'info', quiet: 'neutral' }

// A fold remembers that it is open, so a redraw or a return to Home keeps it open.
function toggle(key: string, event: Event) {
  if ((event.target as HTMLDetailsElement).open) state.ui.openExplain.add(key)
  else state.ui.openExplain.delete(key)
}

function scrollTo(target: string) {
  document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const groupTitle = 'm-0 flex flex-wrap items-center gap-3 font-display text-display'
const changes = computed(() => changesSince())
const group = 'mt-16'
const fold = 'inline-flex cursor-pointer list-none items-center gap-2 py-2 text-ui font-semibold text-default [&::-webkit-details-marker]:hidden'
</script>

<template>
  <section class="page-column min-w-0 pt-8 pb-30 wrap-anywhere">
    <!-- A pill shows its icon and count; its label slides out on hover and on focus, and is always read to a screen reader. -->
    <div class="mb-7 flex flex-wrap gap-2.5" role="group" aria-label="What to look at first">
      <UButton
        v-for="pill in data.glance"
        :key="pill.target"
        :color="GLANCE_COLORS[pill.tone]"
        :variant="['warn', 'bad'].includes(pill.tone) ? 'solid' : 'soft'"
        size="lg"
        class="group rounded-full py-2 pr-4 pl-3.5 font-display text-ui"
        :aria-label="pill.text"
        :title="pill.text"
        @click="scrollTo(pill.target)"
      >
        <HomeStatusIcon :tone="pill.tone" :icon="pill.icon" bare class="size-5!" />
        <span v-if="pill.count" class="tabular-nums">{{ pill.count }}</span>
        <SlideLabel class="font-sans text-label font-semibold group-hover:ml-1 group-focus-visible:ml-1">{{ pill.label }}</SlideLabel>
      </UButton>
    </div>

    <div v-if="context.summary" class="max-w-[70ch] text-lead leading-[1.55]">
      <AiTag label="AI summary" class="mb-2" />
      <SafeMarkdown :value="context.summary" />
    </div>

    <HomeStack v-if="hasStack()" />

    <section v-if="changes" class="mt-5 max-w-[70ch] rounded-card bg-elevated px-4.5 py-3.5 text-body" aria-labelledby="changes-since">
      <h3 id="changes-since" class="m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ui font-semibold">
        Changed since your last review
        <span class="text-label font-normal text-muted"><CommitLink :sha="changes.from" /> → <CommitLink :sha="changes.to" /></span>
        <AiTag label="AI summary" />
      </h3>
      <div class="mt-1.5 text-toned [&>:first-child]:mt-0 [&>:last-child]:mb-0">
        <SafeMarkdown :value="changes.summary" />
      </div>
    </section>

    <details v-if="review.pr.body" class="group mt-5 rounded-card bg-elevated text-body" :open="state.ui.openExplain.has('pr-body')" @toggle="toggle('pr-body', $event)">
      <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-ui font-semibold text-default [&::-webkit-details-marker]:hidden">
        PR description
        <UIcon name="i-lucide-chevron-down" class="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div class="px-4 pb-3.5 text-toned">
        <SafeMarkdown :value="review.pr.body" />
      </div>
    </details>

    <div :class="group">
      <h3 :class="groupTitle">
        Before you start
      </h3>
      <div class="mt-5 grid gap-3">
        <HomePanel v-if="criteria.reason" id="home-criteria" tone="quiet" :icon="criteria.status.icon" title="Acceptance criteria">
          <p class="m-0 mb-1.5 max-w-[72ch] text-body text-toned">
            {{ criteria.reason }}
          </p>
        </HomePanel>
        <HomePanel v-else id="home-criteria" :tone="criteria.status.tone" :icon="criteria.status.icon" title="Acceptance criteria">
          <template #tag>
            <AiTag label="checked by AI" />
          </template>
          <template #pills>
            <HomePill :tone="criteria.status.tone">
              {{ criteria.status.label }}
            </HomePill>
          </template>
          <!-- In a stack, one list shows each criterion with every PR that meets it, this one included. -->
          <CoverageList v-if="hasStack()" />
          <template v-else>
          <CriteriaRows v-if="criteria.rest.length" :criteria="criteria.rest" />
          <details v-if="criteria.met.length" :open="state.ui.openExplain.has('criteria-met')" @toggle="toggle('criteria-met', $event)">
            <summary :class="fold">
              {{ criteria.rest.length ? `Show the ${plural(criteria.met.length, 'met criterion', 'met criteria')}` : `Show the ${plural(criteria.met.length, 'criterion', 'criteria')}` }}
              <UIcon name="i-lucide-chevron-down" class="size-4 text-dimmed" aria-hidden="true" />
            </summary>
            <CriteriaRows :criteria="criteria.met" />
          </details>
          </template>
        </HomePanel>

        <HomePanel v-if="liveFindings().length" id="home-findings" :tone="findings.status.tone" :icon="findings.status.icon" title="What the AI found">
          <template #tag>
            <AiTag label="AI findings" />
          </template>
          <template #pills>
            <template v-if="findings.status.open.length">
              <HomePill v-for="{ severity, count } in findings.bySeverity" :key="severity" :tone="severityTone(severity)">
                {{ count }} {{ severity }}
              </HomePill>
            </template>
            <HomePill v-else tone="ok">
              {{ findings.status.label }}
            </HomePill>
            <HomePill tone="quiet">
              {{ findings.whole.length }} on the whole PR
            </HomePill>
            <HomePill tone="quiet">
              {{ findings.onHunks }} in the flows
            </HomePill>
          </template>
          <ul v-if="findings.whole.length" role="list" class="m-0 mt-1 list-none p-0">
            <HomeFinding v-for="finding in findings.whole" :key="finding.id" :finding="finding" />
          </ul>
        </HomePanel>

        <HomePanel v-if="data.general.length" id="home-comments" tone="warn" icon="comment" title="Comments outside the diff">
          <template #pills>
            <HomePill tone="warn">
              {{ data.general.length }} open
            </HomePill>
          </template>
          <HomeComment v-for="comment in data.general" :key="comment.id" :comment="comment" />
        </HomePanel>

        <HomePanel v-if="context.coverage" id="home-coverage" tone="info" icon="coverage" title="Test coverage">
          <template #tag>
            <AiTag label="AI summary" />
          </template>
          <p class="m-0 mb-1.5 max-w-[72ch] text-body text-toned">
            <MarkupText :text="context.coverage.summary" /> <span class="text-muted">Source: <MarkupText :text="context.coverage.source" /></span>
          </p>
        </HomePanel>

        <HomePanel v-if="data.skipped.length" id="home-skipped" tone="warn" icon="notRead" title="Not read by the AI">
          <template #tag>
            <AiTag />
          </template>
          <template #pills>
            <HomePill tone="warn">
              {{ plural(data.skipped.length, 'item') }}
            </HomePill>
          </template>
          <ul class="m-0 grid list-disc gap-1 pl-5 text-body text-toned">
            <li v-for="(text, index) in data.skipped" :key="index">
              <MarkupText :text="text" />
            </li>
          </ul>
        </HomePanel>
      </div>

      <details v-if="data.relatedCounts.length" class="mt-4.5" :open="state.ui.openExplain.has('related')" @toggle="toggle('related', $event)">
        <summary :class="fold">
          <UIcon name="i-lucide-link" class="size-4 text-dimmed" aria-hidden="true" />{{ data.relatedCounts.join(' · ') }}
          <UIcon name="i-lucide-chevron-down" class="size-4 text-dimmed" aria-hidden="true" />
        </summary>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-x-12">
          <div v-if="context.tickets?.length" class="mt-6">
            <h4 class="m-0 text-ui font-semibold">
              Tickets
            </h4>
            <ul class="mt-2 mb-0 grid list-disc gap-1 pl-5 text-ui text-toned">
              <li v-for="ticket in context.tickets" :key="ticket.key">
                <a :href="ticket.url" target="_blank" rel="noopener" :title="`${ticket.key}: ${ticket.title}`" class="text-info">{{ ticket.key }}</a> {{ ticket.title }}
              </li>
            </ul>
          </div>
          <div v-if="context.linkedPrs?.length" class="mt-6">
            <h4 class="m-0 flex flex-wrap items-center gap-2 text-ui font-semibold">
              Linked pull requests <AiTag label="AI summaries" />
            </h4>
            <ul class="mt-2 mb-0 grid list-disc gap-1 pl-5 text-ui text-toned">
              <li v-for="pr in context.linkedPrs" :key="`${pr.repo}#${pr.number}`">
                <MarkupText :text="`${pr.repo}#${pr.number}`" /> <span class="text-muted">{{ pr.state.toLowerCase() }}</span><br>
                <MarkupText :text="pr.summary || pr.title" />
              </li>
            </ul>
          </div>
        </div>
      </details>
    </div>

    <div :class="group">
      <h3 :class="groupTitle">
        Flows <AiTag label="grouped and explained by AI" />
      </h3>
      <ul role="list" class="m-0 mt-4 list-none p-0">
        <li v-for="{ line, seen, findings: pill, verdict } in flows" :key="line.id" class="mt-1.5 first:mt-0">
          <button
            class="grid w-full cursor-pointer grid-cols-[28px_1fr_auto] items-start gap-3.5 rounded-card px-3 py-3.5 text-left hover:bg-(--line)/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
            :style="{ '--line': `var(--color-${line.color})` }"
            @click="openFlow(line.id)"
          >
            <FlowBullet :line="line" :hollow="line.id === '__none' || line.id === '__files'" />
            <span class="grid min-w-0 gap-1">
              <b class="font-display text-lead">
                <FlowIcon :icon="line.icon" class="mr-[.4em] size-[1.05em] align-[-.15em]" :style="{ color: `var(--color-${line.color})` }" />{{ line.name }}
              </b>
              <span v-if="line.explanation" class="line-clamp-2 text-ui text-toned" :title="line.explanation"><MarkupText :text="line.explanation" /></span>
            </span>
            <span class="flex h-6 items-center gap-2">
              <HomePill v-if="pill" :tone="pill.tone">{{ pill.text }}</HomePill>
              <span v-if="verdict" class="grid size-6 place-items-center rounded-full text-inverted" :class="FLOW_VERDICT_COLORS[verdict]" :title="FLOW_VERDICT_LABELS[verdict]">
                <VerdictIcon :verdict="verdict" class="size-3.5" />
                <span class="sr-only">{{ FLOW_VERDICT_LABELS[verdict] }}</span>
              </span>
              <span class="font-mono text-meta leading-none text-muted">{{ seen }}/{{ line.stops.length }} seen</span>
            </span>
          </button>
        </li>
      </ul>
    </div>

    <div id="home-progress" :class="[group, 'scroll-mt-6']">
      <h3 :class="groupTitle">
        <HomeStatusIcon :tone="data.proposalTone" icon="progress" small />Your review so far
        <HomePill :tone="data.proposalTone">
          <template v-if="data.proposal">
            <VerdictIcon :verdict="data.proposal.icon" class="size-3.5" />Proposed: {{ data.proposal.label }}
          </template>
          <template v-else>
            No proposal yet: {{ undecidedLabel() }} to decide
          </template>
        </HomePill>
      </h3>
      <HomePanel :tone="data.proposalTone" icon="progress" class="mt-4">
        <dl class="m-0 mb-5 flex flex-wrap gap-x-12 gap-y-4 [&>div]:flex [&>div]:flex-col-reverse">
          <div>
            <dt class="mb-1.5 text-label text-muted">
              Hunks seen
            </dt>
            <dd class="m-0 font-display text-stat">
              {{ data.seen }}<span class="text-lead text-muted">/{{ data.total }}</span>
            </dd>
          </div>
          <div>
            <dt class="mb-1.5 text-label text-muted">
              approved · changes requested · commented
            </dt>
            <dd class="m-0 flex flex-wrap gap-x-3 font-display text-stat">
              <span class="text-success">{{ data.verdictCounts.approved }}</span>
              <span class="text-error">{{ data.verdictCounts.changes }}</span>
              <span>{{ data.verdictCounts.comment }}</span>
            </dd>
          </div>
          <div>
            <dt class="mb-1.5 text-label text-muted">
              {{ data.items.length ? `remarks to post · ${data.onGitHub} on GitHub, ${data.items.length - data.onGitHub} local only` : 'remarks to post' }}
            </dt>
            <dd class="m-0 font-display text-stat">
              {{ data.items.length }}
            </dd>
          </div>
        </dl>
        <div class="flex flex-wrap gap-2">
          <template v-if="data.seen < data.total">
            <UButton color="neutral" size="lg" class="font-display" @click="nextUnseen()">
              Continue reviewing
            </UButton>
            <UButton color="neutral" variant="ghost" @click="goTerminus()">
              Submit review…
            </UButton>
          </template>
          <template v-else>
            <UButton color="neutral" size="lg" class="font-display" @click="goTerminus()">
              Submit review…
            </UButton>
            <UButton color="neutral" variant="ghost" @click="goFirst()">
              Go to the first hunk
            </UButton>
          </template>
        </div>
      </HomePanel>
    </div>
  </section>
</template>
