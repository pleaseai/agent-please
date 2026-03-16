import { consola } from 'consola'

let verboseEnabled = false

export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled
  if (enabled) {
    consola.level = 5 // trace level
  }
}

export function isVerbose(): boolean {
  return verboseEnabled
}

export function createLogger(tag: string) {
  return consola.withTag(tag)
}
