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

const FLOW_VERDICT_COLORS: Record<string, string> = { approved: 'bg-success', changes: 'bg-error', comment: 'bg-(--ui-text-toned)' }
const GLANCE_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = { ok: 'success', warn: 'warning', bad: 'error', info: 'info', quiet: 'neutral' }

// A fold remembers that it is open, so a redraw or a return to Home keeps it open.
function toggle(key: string, event: Event) {
  if ((event.target as HTMLDetailsElement).open) state.ui.openExplain.add(key)
  else state.ui.openExplain.delete(key)
}

function scrollTo(target: string) {
  document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const groupTitle = 'm-0 flex flex-wrap items-center gap-2.5 text-title font-bold tracking-[-.01em]'
const group = 'mt-18 border-t border-accented pt-7'
const fold = 'inline-flex cursor-pointer list-none items-center gap-2 py-2 text-ui font-semibold text-default [&::-webkit-details-marker]:hidden'
</script>

<template>
  <section class="page-column min-w-0 pt-10 pb-30 wrap-anywhere">
    <p class="m-0 font-mono text-label font-semibold">
      <a :href="review.pr.url" target="_blank" rel="noopener" class="text-info">{{ review.pr.owner }}/{{ review.pr.repo }}#{{ review.pr.number }}</a>
    </p>
    <h2 class="mt-1.5 mb-2.5 text-display font-bold tracking-[-.02em]">
      <MarkupText :text="review.pr.title" />
    </h2>
    <p class="mt-0 mb-5.5 flex items-center gap-2.5 text-ui text-toned">
      <UAvatar :src="avatar(review.pr.author)" alt="" size="xs" class="shrink-0 has-[[data-slot=fallback]]:hidden" />
      <span>by <b>{{ review.pr.author }}</b></span>
    </p>
    <div v-if="context.summary" class="max-w-[70ch] text-body">
      <AiTag label="AI summary" class="mb-2" />
      <SafeMarkdown :value="context.summary" />
    </div>

    <div class="mt-5.5 mb-4.5 flex flex-wrap gap-2" role="group" aria-label="What to look at first">
      <UButton
        v-for="pill in data.glance"
        :key="pill.target"
        :color="GLANCE_COLORS[pill.tone]"
        variant="subtle"
        class="rounded-full px-3.5 py-1.5 text-ui font-semibold"
        @click="scrollTo(pill.target)"
      >
        <HomeStatusIcon :tone="pill.tone" :icon="pill.icon" bare />{{ pill.text }}
      </UButton>
    </div>

    <details v-if="review.pr.body" class="group mt-1 rounded-lg border border-default bg-elevated/60 text-body" :open="state.ui.openExplain.has('pr-body')" @toggle="toggle('pr-body', $event)">
      <summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-label font-semibold text-default [&::-webkit-details-marker]:hidden">
        PR description
        <UIcon name="i-lucide-chevron-down" class="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div class="px-3.5 pb-3 text-toned">
        <SafeMarkdown :value="review.pr.body" />
      </div>
    </details>

    <div :class="group">
      <h3 :class="groupTitle">
        Before you start
      </h3>
      <div class="mt-4.5 grid gap-3.5">
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
          <CriteriaRows v-if="criteria.rest.length" :criteria="criteria.rest" />
          <details v-if="criteria.met.length" :open="state.ui.openExplain.has('criteria-met')" @toggle="toggle('criteria-met', $event)">
            <summary :class="fold">
              {{ criteria.rest.length ? `Show the ${plural(criteria.met.length, 'met criterion', 'met criteria')}` : `Show the ${plural(criteria.met.length, 'criterion', 'criteria')}` }}
              <UIcon name="i-lucide-chevron-down" class="size-4 text-dimmed" aria-hidden="true" />
            </summary>
            <CriteriaRows :criteria="criteria.met" />
          </details>
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
        <li v-for="{ line, seen, findings: pill, verdict } in flows" :key="line.id" class="border-t border-default first:border-t-0">
          <button
            class="grid w-full cursor-pointer grid-cols-[26px_1fr_auto] items-start gap-3 rounded-md px-2.5 py-3 text-left hover:bg-(--line)/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
            :style="{ '--line': `var(--color-${line.color})` }"
            @click="openFlow(line.id)"
          >
            <FlowBullet :line="line" :hollow="line.id === '__none' || line.id === '__files'" />
            <span class="grid min-w-0 gap-1">
              <b class="text-body">
                <FlowIcon :icon="line.icon" class="mr-[.4em] size-[1.05em] align-[-.15em]" :style="{ color: `var(--color-${line.color})` }" />{{ line.name }}
              </b>
              <span v-if="line.explanation" class="line-clamp-2 text-ui text-toned" :title="line.explanation"><MarkupText :text="line.explanation" /></span>
            </span>
            <span class="flex h-6 items-center gap-2">
              <HomePill v-if="pill" :tone="pill.tone">{{ pill.text }}</HomePill>
              <span v-if="verdict" class="grid size-5.5 place-items-center rounded-full text-inverted" :class="FLOW_VERDICT_COLORS[verdict]" :title="FLOW_VERDICT_LABELS[verdict]">
                <VerdictIcon :verdict="verdict" class="size-3" />
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
        <dl class="m-0 mb-5 grid grid-cols-2 gap-x-8 gap-y-4 max-md:grid-cols-1">
          <div>
            <dt class="text-meta tracking-[.05em] text-dimmed uppercase">
              Hunks seen
            </dt>
            <dd class="m-0 mt-1 text-body font-semibold">
              {{ data.seen }} of {{ data.total }}
            </dd>
          </div>
          <div>
            <dt class="text-meta tracking-[.05em] text-dimmed uppercase">
              Your verdicts per hunk
            </dt>
            <dd class="m-0 mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-body font-semibold">
              <span class="whitespace-nowrap text-success">{{ data.verdictCounts.approved }} approved ·</span>
              <span class="whitespace-nowrap text-error">{{ data.verdictCounts.changes }} changes requested ·</span>
              <span class="whitespace-nowrap">{{ data.verdictCounts.comment }} commented</span>
            </dd>
          </div>
          <div>
            <dt class="text-meta tracking-[.05em] text-dimmed uppercase">
              Remarks to post
            </dt>
            <dd class="m-0 mt-1 text-body font-semibold">
              {{ data.items.length ? `${data.items.length} · ${data.onGitHub} on GitHub, ${data.items.length - data.onGitHub} local only` : 'None' }}
            </dd>
          </div>
        </dl>
        <div class="flex flex-wrap gap-2">
          <template v-if="data.seen < data.total">
            <UButton color="neutral" @click="nextUnseen()">
              Continue reviewing
            </UButton>
            <UButton color="neutral" variant="ghost" @click="goTerminus()">
              Submit review…
            </UButton>
          </template>
          <template v-else>
            <UButton color="neutral" @click="goTerminus()">
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
