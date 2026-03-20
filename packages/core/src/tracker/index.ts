import type { PlatformConfig, ProjectConfig } from '../types'
import type { TrackerAdapter, TrackerError } from './types'
import { createAsanaAdapter } from './asana'
import { createGitHubAdapter } from './github'

export { formatTrackerError, isTrackerError } from './types'
export type { TrackerAdapter, TrackerError }

export function createTrackerAdapter(project: ProjectConfig, platform: PlatformConfig): TrackerAdapter | TrackerError {
  if (platform.kind === 'github')
    return createGitHubAdapter(project, platform)
  if (platform.kind === 'asana')
    return createAsanaAdapter(project, platform)

  return { code: 'unsupported_tracker_kind', kind: platform.kind }
}
