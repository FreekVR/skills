<script setup lang="ts">
// The group of generated files: what the AI says made them, the findings on them, the file list and one verdict.
interface GroupFile { path: string, reason: string, detail?: string, hunkId: string, shared: { line: { id: string, name: string, letter: string, color: string, shape?: string }, index: number }[] }
interface Finding { id: string, hunkId: string, severity: string }

const files = computed(() => (generatedFilesInOrder() as GroupFile[]).filter((file) => inScope(file.hunkId)))
const summary = computed(() => ({ id: GENERATED_LINE.id, explanation: state.review.generated?.summary || '' }))
const sources = computed(() => (state.review.generated?.sourceHunkIds || []).map(hunkById).filter(Boolean))
const findings = computed(() => liveFindings().filter((finding: Finding) => isGenerated(finding.hunkId) && inScope(finding.hunkId)) as Finding[])
const findingsByHunk = computed(() => {
  const byHunk = new Map<string, Finding[]>()
  for (const finding of findings.value) {
    if (!byHunk.has(finding.hunkId)) byHunk.set(finding.hunkId, [])
    byHunk.get(finding.hunkId).push(finding)
  }
  return byHunk
})
const findingsOn = (hunkId: string) => findingsByHunk.value.get(hunkId) || []
const withFindings = computed(() => files.value.filter((file) => findingsOn(file.hunkId).length))
const diffs = computed(() => new Map(files.value.map((file) => [file.hunkId, lineCounts(hunkById(file.hunkId)) as { added: number, removed: number }])))
</script>

<template>
  <article class="page-column min-w-0 pt-7 pb-30 wrap-anywhere">
    <StationContext :hunk="summary" plain />
    <p v-if="sources.length" class="mt-1 mb-0 flex flex-wrap gap-x-4">
      <TerminusHunkLink v-for="hunk in sources" :key="hunk.id" :hunk="hunk" />
    </p>

    <section v-if="findings.length" class="mt-10" aria-labelledby="generated-findings">
      <h2 id="generated-findings" class="m-0 mb-4 font-display text-title">Findings</h2>
      <div v-for="file in withFindings" :key="file.hunkId" class="mt-3.5 first-of-type:mt-0">
        <p class="m-0 mb-1.5">
          <UButton color="neutral" variant="ghost" class="-ml-2 text-left font-mono text-label whitespace-normal wrap-break-word text-toned" @click="openGeneratedFile(file.hunkId)">
            <span><template v-for="(part, at) in codeName(file.path)" :key="at">{{ part }}<wbr></template></span>
          </UButton>
        </p>
        <NoteCard v-for="finding in findingsOn(file.hunkId)" :key="finding.id" type="finding" :item="finding" />
      </div>
    </section>

    <section class="mt-10" aria-labelledby="generated-files">
      <h2 id="generated-files" class="m-0 font-display text-title">Files</h2>
      <p class="mt-1 mb-3 text-ui text-toned">Open a file to read its diff.</p>
      <!-- On a phone each row stacks: the path on its own line, the rest under it. The roles keep it a table for a
           screen reader, which a change of display can take away. Words stay whole; a path breaks after a slash. -->
      <table role="table" class="w-full border-separate border-spacing-y-1.5 text-ui wrap-break-word max-md:block">
        <thead role="rowgroup">
          <tr role="row" class="text-left text-meta text-muted max-md:sr-only">
            <th role="columnheader" class="px-3 font-semibold">File</th>
            <th role="columnheader" class="px-3 font-semibold">Why it counts as generated</th>
            <th role="columnheader" class="px-3 font-semibold">Changes</th>
            <th role="columnheader" class="px-3"><span class="sr-only">Findings and flows</span></th>
          </tr>
        </thead>
        <tbody role="rowgroup" class="max-md:grid max-md:gap-1.5">
          <tr v-for="file in files" :key="file.hunkId" role="row" class="bg-elevated max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:rounded-lg max-md:px-1.5 max-md:pb-1.5">
            <td role="cell" class="px-1.5 py-1 md:rounded-l-lg max-md:basis-full max-md:px-0">
              <button type="button" class="cursor-pointer rounded-md px-1.5 py-1 text-left font-mono text-label hover:underline hover:underline-offset-3 focus-visible:outline-2 focus-visible:outline-info" @click="openGeneratedFile(file.hunkId)">
                <span class="text-muted"><template v-for="(part, at) in codeName(folderOf(file.path))" :key="at">{{ part }}<wbr></template></span>{{ fileName(file.path) }}
              </button>
            </td>
            <td role="cell" class="px-3 py-1 text-toned max-md:px-1.5">{{ reasonLabel(file) }}</td>
            <td role="cell" class="px-3 py-1 font-mono text-label whitespace-nowrap max-md:px-1.5">
              <span class="font-semibold text-success">+{{ diffs.get(file.hunkId).added }}</span> <span class="font-semibold text-error">−{{ diffs.get(file.hunkId).removed }}</span>
            </td>
            <td role="cell" class="px-3 py-1 md:rounded-r-lg max-md:px-1.5">
              <span class="flex flex-wrap items-center gap-2">
                <span v-if="findingsOn(file.hunkId).length" class="inline-flex items-center gap-1.5 whitespace-nowrap text-toned">
                  <DiffSeverity :severity="worstOf(findingsOn(file.hunkId)).severity" />{{ plural(findingsOn(file.hunkId).length, 'finding') }}
                </span>
                <UButton
                  v-for="{ line, index } in file.shared"
                  :key="line.id"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  class="gap-1.5 font-mono text-meta font-semibold text-default"
                  :title="`Open ${stationCode(line, index)} in ${line.name}`"
                  @click="go(line.id, index)"
                >
                  <FlowBullet :line="line" class="size-5! text-tag!" />
                  <span>{{ stationCode(line, index) }}</span>
                  <span v-if="verdictOf(file.hunkId)" class="grid size-5 place-items-center rounded-full text-inverted" :class="FLOW_VERDICT_COLORS[verdictOf(file.hunkId)]">
                    <VerdictIcon :verdict="verdictOf(file.hunkId)" class="size-3" />
                    <span class="sr-only">{{ POSTED_HUNK_VERDICTS[verdictOf(file.hunkId)] }}</span>
                  </span>
                </UButton>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <div class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-card bg-elevated px-4 py-3.5">
      <h2 class="m-0 font-display text-lead">Your verdict on {{ files.length === 1 ? 'this file' : `all ${files.length} files` }}</h2>
      <StationVerdicts group />
    </div>

    <StationWholeFile />
  </article>
</template>
