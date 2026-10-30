<script setup lang="ts">
// Submit review: the checks before posting, the review form and the posts sent. After the final post, the posted review.
const BUTTON_COLORS: Record<string, 'success' | 'error' | 'neutral'> = { ok: 'success', danger: 'error', ink: 'neutral' }
const VERDICT_ICON_COLORS: Record<string, string> = { APPROVE: 'text-success', REQUEST_CHANGES: 'text-error' }
const LEDE = 'mt-0 mb-6 max-w-[68ch] leading-[1.65] text-toned'
const LINK_BUTTON = 'cursor-pointer text-info underline underline-offset-3 focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info'

const view = computed(() => terminus())
const draft = computed(() => draftLine())
const criteria = computed(() => criteriaCheck())
const verdicts = computed(() => hunkVerdictsCheck())
const notPosted = computed(() => notPostedFindings())
const posts = computed(() => sentPosts())
const ownReview = computed(() => hasOwnReview())
const draftCount = computed(() => localCount())
const draftLabel = computed(() => (draftCount.value ? `Post as draft. ${plural(draftCount.value, 'remark')} not on GitHub yet.` : 'Post as draft'))
const summary = computed(() => state.reviewer.summary.trim())
const reducedMotion = usePreferredReducedMotion()

const coverageCounts = computed(() => {
  const { unseen, flows, flowsDone, outdated } = view.value
  const total = state.review.hunks.length
  return `${total - unseen.length} of ${plural(total, 'hunk')} · ${flows.length ? `${flowsDone} of ${plural(flows.length, 'flow')} complete` : 'no flows'}${outdated.length ? ` · ${outdated.length} remarks on changed hunks` : ''}`
})

async function showThem() {
  showUnseen()
  await nextTick()
  document.getElementById('term-coverage')?.scrollIntoView({ behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth', block: 'start' })
}
</script>

<template>
  <section class="page-column pt-9 pb-24">
    <TerminusPosted v-if="view.posted" :sent="view.posted" :finishing="view.finishing" :pr-open="view.prOpen" />
    <template v-else>
      <p v-if="draft" class="mt-0 mb-3.5 flex items-center gap-2 rounded-lg border border-default px-3 py-2 text-ui text-toned">
        <VerdictIcon verdict="comment" class="size-3.5" />
        <span>Draft on GitHub{{ draft.at ? `, updated ${timeLabel(draft.at)}` : '' }}.<template v-if="draft.url">
          {{ ' ' }}<a :href="draft.url" target="_blank" rel="noopener" class="text-info underline underline-offset-3">View</a>
        </template></span>
      </p>
      <p :class="LEDE">
        Nothing reaches GitHub until you press a post button.
      </p>
      <p v-if="ownReview" :class="LEDE">
        This posts a new review with new comments. To approve the fixes or follow up on your earlier comments,
        <button type="button" :class="LINK_BUTTON" @click="goReviews()">update your review</button> instead.
      </p>
      <p v-if="state.review.pr.isOwnPr" :class="LEDE">
        This is your own PR. GitHub does not accept approve or request changes from the author; use comment.
      </p>

      <div class="mt-10">
        <h2 class="m-0 mb-1.5 text-lead tracking-[-0.01em]">
          Before you post
        </h2>
        <ol role="list" class="m-0 list-none border-t border-default p-0">
          <TerminusCheckItem :number="1" :done="criteria.done" section="criteria" title="Acceptance criteria" :counts="criteria.counts">
            <template #title>
              <AiTag label="checked by AI" class="ml-2" />
            </template>
            <template v-if="criteria.criteria.length">
              <p :class="LEDE">
                The agent's check of each criterion. Open a flow to see the code that should meet it.
              </p>
              <CriteriaRows :criteria="criteria.criteria" framed />
            </template>
          </TerminusCheckItem>
          <TerminusCheckItem
            :number="2"
            :done="view.openGeneral === 0"
            :section="view.general.length ? 'findings' : null"
            title="What the AI found for the whole PR"
            :counts="view.general.length ? `${view.general.length}${view.openGeneral ? ` · ${view.openGeneral} open` : ' · all decided'}` : 'nothing'"
            :open="view.openGeneral > 0"
          >
            <template v-if="view.general.length">
              <NoteCard v-for="finding in view.general" :key="finding.id" type="finding" :item="finding" />
            </template>
          </TerminusCheckItem>
          <TerminusCheckItem :number="3" :done="view.unseen.length === 0" section="coverage" title="Hunks and flows you have seen" :counts="coverageCounts" :open="view.outdated.length > 0">
            <template v-if="view.unseen.length">
              <div v-for="{ line, open } in view.unseenByFlow" :key="line.id" class="mt-4.5 first:mt-0">
                <p class="m-0 mb-1.5 flex flex-wrap items-center gap-2">
                  <FlowBullet :line="line" :hollow="line.id.startsWith('__')" />
                  <UIcon v-if="/^[a-z0-9-]+$/.test(line.icon || '')" :name="`i-lucide-${line.icon}`" class="size-[1.05em]" :style="{ color: `var(--color-${line.color})` }" aria-hidden="true" />
                  <b>{{ line.name }}</b>
                  <span class="text-ui text-toned">{{ open.length }} of {{ line.stops.length }} not seen</span>
                </p>
                <ul role="list" class="m-0 list-none columns-[2_300px] gap-x-6 p-0">
                  <li v-for="{ stop, index } in open" :key="index">
                    <UButton color="neutral" variant="ghost" class="-ml-2 text-left font-mono text-label wrap-anywhere text-toned" @click="go(line.id, index)">
                      {{ stationCode(line, index) }} {{ hunkById(stop.hunkId)?.file || '' }}
                    </UButton>
                  </li>
                </ul>
              </div>
            </template>
            <p v-else :class="LEDE">
              You have seen every hunk.
            </p>
            <template v-if="view.outdated.length">
              <p :class="LEDE">
                Remarks on hunks that changed since you wrote them. They are not posted.
              </p>
              <NoteCard v-for="remark in view.outdated" :key="remark.id" type="remark" :item="remark" />
            </template>
          </TerminusCheckItem>
          <TerminusCheckItem v-if="notPosted" :number="4" section="not-posted" title="AI findings on hunks you are not posting" :counts="notPosted.counts">
            <p :class="LEDE">
              You did not accept these, so they are not in the review. Accept one here to post it.
            </p>
            <div v-for="hunk in notPosted.hunks" :key="hunk.id" class="mt-3.5 first-of-type:mt-0">
              <p class="m-0 mb-1.5">
                <TerminusHunkLink :hunk="hunk" />
              </p>
              <NoteCard v-for="finding in notPosted.open.filter((candidate: { hunkId: string }) => candidate.hunkId === hunk.id)" :key="finding.id" type="finding" :item="finding" />
            </div>
          </TerminusCheckItem>
        </ol>
      </div>

      <div class="mt-10">
        <h2 class="m-0 mb-1.5 text-lead tracking-[-0.01em]">
          Your review
        </h2>
        <ol role="list" class="m-0 list-none border-t border-default p-0">
          <TerminusCheckItem :number="1" title="Summary">
            <template #title>
              <StatusBadge v-if="summary" id="summary" :body="summary" class="ml-2" />
            </template>
            <UTextarea
              id="summary"
              :model-value="state.reviewer.summary"
              placeholder="The review body: what you checked and what you want from the author."
              aria-label="Review summary"
              autoresize
              :rows="4"
              class="w-full"
              @update:model-value="setSummary"
            />
            <TerminusSummaryTools />
          </TerminusCheckItem>
          <TerminusCheckItem :number="2" :done="verdicts.done" section="hunk-verdicts" title="Your verdicts per hunk">
            <template #counts>
              <span class="font-semibold whitespace-nowrap text-success">{{ verdicts.approved }} approved</span> · <span class="font-semibold whitespace-nowrap text-error">{{ verdicts.changes.length }} changes requested</span> · <span class="whitespace-nowrap">{{ verdicts.comments }} commented</span> · <span class="whitespace-nowrap">{{ verdicts.without.length }} without</span>
            </template>
            <p :class="LEDE">
              These are local only. The page proposes a verdict once every hunk has one.
            </p>
            <template v-if="verdicts.without.length">
              <p :class="LEDE">
                Hunks without a verdict:
              </p>
              <ul role="list" class="m-0 list-none p-0">
                <li v-for="hunk in verdicts.without" :key="hunk.id">
                  <TerminusHunkLink :hunk="hunk" />
                </li>
              </ul>
            </template>
            <template v-if="verdicts.changes.length">
              <p :class="LEDE">
                Hunks where you requested changes:
              </p>
              <ul role="list" class="m-0 list-none p-0">
                <li v-for="hunk in verdicts.changes" :key="hunk.id">
                  <TerminusHunkLink :hunk="hunk">
                    <VerdictIcon verdict="changes" class="mr-1.5 size-4 text-error" />
                  </TerminusHunkLink>
                </li>
              </ul>
            </template>
          </TerminusCheckItem>
          <TerminusCheckItem :number="3" section="preview" title="What will be posted" :counts="view.posts">
            <TerminusPreview :post="view.post" />
          </TerminusCheckItem>
          <TerminusCheckItem :number="4" title="Verdict and post">
            <div class="grid grid-cols-3 gap-2.5 max-md:grid-cols-1" role="group" aria-label="Verdict">
              <button
                v-for="option in VERDICTS"
                :key="option.id"
                type="button"
                class="verdict flex cursor-pointer flex-col justify-start rounded-lg border border-accented bg-default px-3.5 py-3 text-left hover:border-(--ui-text-dimmed) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info aria-pressed:border-(--ui-text) aria-pressed:shadow-[inset_0_0_0_1px_var(--ui-text)]"
                :class="{ muted: view.proposal && option.id !== view.proposal }"
                :aria-pressed="view.verdict === option.id"
                @click="setVerdict(option.id)"
              >
                <strong class="block text-body">
                  <VerdictIcon :verdict="option.icon" class="mr-1 size-4 align-[-3px]" :class="VERDICT_ICON_COLORS[option.id]" />{{ option.label }}<span
                    v-if="option.id === view.proposal"
                    class="ml-1.5 inline-block rounded-sm border border-(--ui-text) px-1.5 py-0.5 align-[2px] font-mono text-tag leading-none font-semibold text-default"
                  >proposed</span>
                </strong>
                <span class="mt-0.5 block text-label text-dimmed">{{ option.hint }}</span>
              </button>
            </div>
            <UAlert
              v-if="view.unseenWarning"
              color="warning"
              variant="outline"
              orientation="horizontal"
              class="mt-3.5 py-2.5"
              :ui="{ description: 'mt-0 text-ui text-default' }"
            >
              <template #description>
                {{ view.unseenWarning }}
                <UButton color="neutral" variant="ghost" size="sm" class="text-toned" @click="showThem()">
                  Show them
                </UButton>
              </template>
            </UAlert>
            <p class="mt-5 mb-0 text-ui text-toned">
              Posts {{ view.posts }}.<template v-if="view.openFindings.length">
                {{ ` ${plural(view.openFindings.length, 'AI finding')} ${view.openFindings.length === 1 ? 'is' : 'are'} still open and not posted.` }}
              </template>
            </p>
            <div class="mt-4.5 flex flex-wrap items-center gap-2.5">
              <UButton v-if="view.finalVerdict" :color="BUTTON_COLORS[view.finalVerdict.button]" class="font-semibold" @click="post('final')">
                <template #leading>
                  <VerdictIcon :verdict="view.finalVerdict.icon" class="size-4" />
                </template>
                {{ ownReview ? 'Post new review' : 'Post review' }}: {{ view.finalVerdict.label.toLowerCase() }}
              </UButton>
              <UButton v-else color="neutral" variant="soft" disabled>
                Choose a verdict to post
              </UButton>
              <UButton color="warning" variant="outline" class="font-semibold" :aria-label="draftLabel" :title="draftLabel" @click="post('draft')">
                Post as draft
                <UBadge v-if="draftCount" color="warning" variant="solid" size="sm" class="ml-1 rounded-full" aria-hidden="true">
                  {{ draftCount }}
                </UBadge>
              </UButton>
            </div>
            <div v-if="posts.length" class="mt-6.5">
              <h3 class="m-0 mb-2 text-body font-semibold">
                Sent to GitHub
              </h3>
              <TerminusPostResult v-for="sent in posts" :key="sent.id" :result="postResult(sent)" />
            </div>
          </TerminusCheckItem>
        </ol>
      </div>
    </template>
  </section>
</template>

<style scoped>
.verdict.muted:not([aria-pressed="true"]):not(:hover):not(:focus-visible) strong,
.verdict.muted:not([aria-pressed="true"]):not(:hover):not(:focus-visible) strong svg { color: var(--ui-text-dimmed); font-weight: 600; }
</style>
