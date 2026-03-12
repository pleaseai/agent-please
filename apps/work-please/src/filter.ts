import type { Issue, IssueFilter } from './types'

export function matchesFilter(issue: Issue, filter: IssueFilter): boolean {
  if (filter.assignee.length > 0) {
    if (!issue.assignee
      || !filter.assignee.some(a => a.toLowerCase() === issue.assignee!.toLowerCase())) {
      return false
    }
  }
  if (filter.label.length > 0) {
    if (!issue.labels.some(l => filter.label.some(f => f.toLowerCase() === l.toLowerCase()))) {
      return false
    }
  }
  return true
}
