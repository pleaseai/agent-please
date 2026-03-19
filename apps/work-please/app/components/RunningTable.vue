<script setup lang="ts">
import type { RunningEntryPayload } from '~/utils/types'
import { formatTime, formatTokens } from '~/utils/format'

defineProps<{
  entries: RunningEntryPayload[]
}>()

const columns = [
  { key: 'issue_identifier', label: 'Identifier' },
  { key: 'state', label: 'State' },
  { key: 'turn_count', label: 'Turn' },
  { key: 'session_id', label: 'Session' },
  { key: 'started_at', label: 'Started' },
  { key: 'last_event', label: 'Last Event' },
  { key: 'tokens', label: 'Tokens' },
]
</script>

<template>
  <UTable :data="entries" :columns="columns">
    <template #issue_identifier-cell="{ row }">
      <NuxtLink :to="`/issues/${encodeURIComponent(row.original.issue_identifier)}`" class="font-medium hover:underline">
        {{ row.original.issue_identifier }}
      </NuxtLink>
    </template>
    <template #state-cell="{ row }">
      <StateBadge :state="row.original.state" />
    </template>
    <template #turn_count-cell="{ row }">
      <span class="tabular-nums">{{ row.original.turn_count }}</span>
    </template>
    <template #session_id-cell="{ row }">
      <span class="max-w-32 truncate text-muted text-xs font-mono">
        {{ row.original.session_id ?? '—' }}
      </span>
    </template>
    <template #started_at-cell="{ row }">
      <span class="tabular-nums">{{ formatTime(row.original.started_at) }}</span>
    </template>
    <template #last_event-cell="{ row }">
      <span class="text-muted">{{ row.original.last_event ?? '—' }}</span>
    </template>
    <template #tokens-cell="{ row }">
      <span class="tabular-nums">{{ formatTokens(row.original.tokens.total_tokens) }}</span>
    </template>
  </UTable>
</template>
