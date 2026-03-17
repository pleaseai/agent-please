import type { IssueDetailResponse } from '@/lib/api'
import { useIntervalFn } from '@vueuse/core'
import { ref, watch } from 'vue'
import { fetchIssueDetail } from '@/lib/api'
import { toMessage } from '@/lib/utils'

export function useIssueDetail(identifier: () => string, intervalMs = 3000) {
  const detail = ref<IssueDetailResponse | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(true)

  let fetching = false
  async function load() {
    const id = identifier()
    if (!id)
      return
    if (fetching)
      return
    fetching = true
    try {
      detail.value = await fetchIssueDetail(id)
      error.value = null
    }
    catch (e) {
      console.error('[dashboard]', e)
      error.value = toMessage(e)
    }
    finally {
      fetching = false
      loading.value = false
    }
  }

  watch(identifier, () => {
    loading.value = true
    detail.value = null
    load()
  })

  load()
  useIntervalFn(load, intervalMs)

  return { detail, error, loading, refresh: load }
}
