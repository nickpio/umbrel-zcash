export const SECONDS_PER_HOUR = 3600
export const MS_PER_HOUR = 3600000
export const BYTES_PER_KB = 1_000

export function bytesToKB(bytes: number): number {
	return bytes / BYTES_PER_KB
}

export function zatToZEC(zat: number): number {
	return zat / 1e8
}

export function formatZec(zec: number): string {
	if (!Number.isFinite(zec) || zec === 0) return '0'
	return zec.toFixed(8).replace(/\.?0+$/, '')
}

// Calculate hours ago from a Unix timestamp (seconds)
export function calculateHoursAgo(timestampSeconds: number): number {
	return (Date.now() / 1000 - timestampSeconds) / SECONDS_PER_HOUR
}

export function hoursToMs(hours: number): number {
	return hours * MS_PER_HOUR
}

// Snap an hours-ago span to a readable ceiling so Recharts ticks stay on whole hours.
// Zcash targets ~75s blocks, so 200 blocks is ~4.2h — not Bitcoin's 24h / 144-block window.
const HOURS_AXIS_CEILINGS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24, 36, 48, 72] as const

export type HoursAxis = {
	domainMax: number
	domain: [number, number]
	ticks: number[]
	heightTicks: number[]
}

function hoursAxisStep(domainMax: number): number {
	if (domainMax <= 6) return 1
	if (domainMax <= 12) return 2
	if (domainMax <= 24) return 6
	if (domainMax <= 48) return 12
	return 24
}

export function hoursAxisFromData(hoursAgo: Iterable<number>): HoursAxis {
	let maxHours = 0
	let hasPoint = false
	for (const value of hoursAgo) {
		if (!Number.isFinite(value) || value < 0) continue
		hasPoint = true
		if (value > maxHours) maxHours = value
	}

	// Empty input keeps the historical 24h domain so a chart with no points still has a scale.
	const domainMax = hasPoint
		? (HOURS_AXIS_CEILINGS.find((ceiling) => ceiling >= maxHours) ?? Math.ceil(maxHours))
		: 24

	const step = hoursAxisStep(domainMax)
	const ticks: number[] = [domainMax]
	for (let t = domainMax - step; t > 0; t -= step) ticks.push(t)
	ticks.push(0)

	return {
		domainMax,
		domain: [domainMax, 0],
		ticks,
		heightTicks: ticks.filter((t) => t !== 0),
	}
}

export function formatLastHoursLabel(domainMax: number): string {
	return domainMax === 1 ? 'last 1 hour' : `last ${domainMax} hours`
}

// Safety cap: drop points older than 24h. Chart axes use hoursAxisFromData, not this window.
// TODO: remove minBlock and maxBlock from the return value if we end up not using them for graph titles
export function sliceLast24h<T extends {height: number; time: number}>(rows: T[]) {
	const cutoff = Date.now() / 1000 - 24 * SECONDS_PER_HOUR
	const slice = rows.filter((r) => r.time >= cutoff)

	return {
		slice,
		minBlock: slice[0]?.height,
		maxBlock: slice.at(-1)?.height,
	}
}

// Find the data point with the closest value to the target
// Using Array.reduce() for simplicity, but if our data gets large, we could use a binary search
// instead because block data is returned in chronological order
export function findClosestDataPoint<T>(data: T[], target: number, getKey: (item: T) => number): T | null {
	if (!data.length) return null

	return data.reduce((closest, current) =>
		Math.abs(getKey(current) - target) < Math.abs(getKey(closest) - target) ? current : closest,
	)
}
