import type { CodeMeta } from './types.js'
import { reconcile } from './merge.js'

/** A single validation issue found in a {@link CodeMeta} object. */
export type ValidationWarning = {
	/** Human-readable description of the issue. */
	message: string
	/** The CodeMeta property name that the warning relates to (e.g. `'license'`, `'codeRepository'`). */
	property: string
	/** Severity level: `'error'` for required fields, `'warn'` for recommended fields, `'info'` for suggestions. */
	severity: 'error' | 'info' | 'warn'
}

/** Result of validating a {@link CodeMeta} object via {@link validate}. */
export type ValidationResult = {
	/** `true` if no errors were found (warnings and info are allowed). */
	valid: boolean
	/** All validation issues found, including errors, warnings, and informational messages. */
	warnings: ValidationWarning[]
}

/**
 * Validate a {@link CodeMeta} object for completeness and consistency.
 *
 * Checks for missing recommended properties (`codeRepository`, `author`,
 * `license`) and detects conflicts such as multiple contradictory licenses.
 * @param meta - The CodeMeta object to validate (may be partial).
 * @returns A {@link ValidationResult} with a `valid` flag and an array of warnings.
 */
export function validate(meta: Partial<CodeMeta>): ValidationResult {
	const warnings = reconcile(meta)
	return {
		valid: warnings.every((warning) => warning.severity !== 'error'),
		warnings,
	}
}
