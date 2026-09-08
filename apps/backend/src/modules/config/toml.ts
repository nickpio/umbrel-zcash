import {parse, stringify, TomlError} from 'smol-toml'

export type TomlTable = Record<string, unknown>

export class InvalidTomlError extends Error {
	readonly statusCode = 400

	constructor(err: TomlError) {
		const reason = err.message.split('\n')[0].replace(/^Invalid TOML document: /, '')
		super(`Invalid TOML on line ${err.line}: ${reason}`)
		this.name = 'InvalidTomlError'
	}
}

/** Parses TOML text, converting parser failures into a 400-friendly error. */
export function parseToml(text: string): TomlTable {
	try {
		return parse(text)
	} catch (err) {
		if (err instanceof TomlError) throw new InvalidTomlError(err)
		throw err
	}
}

function isTable(value: unknown): value is TomlTable {
	return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

// Tables merge recursively; every other value (scalars, arrays, arrays of tables) is
// replaced by the overlay, matching how a user would expect an override to behave.
function deepMerge(base: TomlTable, overlay: TomlTable): TomlTable {
	const result: TomlTable = {...base}
	for (const [key, value] of Object.entries(overlay)) {
		const existing = result[key]
		result[key] = isTable(existing) && isTable(value) ? deepMerge(existing, value) : value
	}
	return result
}

/**
 * Merges user overrides into the generated zebrad.toml. Both inputs must be valid
 * TOML; the result is re-serialized so it is always a well-formed document.
 */
export function mergeToml(generated: string, custom: string, banner: string): string {
	const merged = deepMerge(parseToml(generated), parseToml(custom))
	return `${banner.trimEnd()}\n\n${stringify(merged)}`
}
