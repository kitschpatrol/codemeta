// Re-export types and utilities
export type { DiscoveredFile } from './discover.js'
export { discover } from './discover.js'

export type { GenerateOptions } from './generate.js'
export { DEFAULT_GENERATE_OPTIONS, generate, generateFromFiles } from './generate.js'

export { setLogger } from './log.js'

export type { CodeMeta } from './types.js'

export type { ValidationResult, ValidationWarning } from './validate.js'
export { validate } from './validate.js'
