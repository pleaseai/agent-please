import type { Issue, IssueFilter } from './types'

export function matchesFilter(issue: Issue, filter: IssueFilter): boolean {
  if (filter.assignee.length > 0) {
    const filterAssignees = new Set(filter.assignee.map(a => a.toLowerCase()))
    if (!issue.assignees.some(a => filterAssignees.has(a.toLowerCase()))) {
      return false
    }
  }
  if (filter.label.length > 0) {
    const filterLabels = new Set(filter.label.map(l => l.toLowerCase()))
    if (!issue.labels.some(l => filterLabels.has(l.toLowerCase()))) {
      return false
    }
  }
  return true
}
