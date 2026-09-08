// Leading + trailing throttle: the first transaction in a quiet period is sent
// immediately; anything else arriving within `minIntervalMs` is accumulated and
// flushed as one frame when the window closes, so a burst followed by silence is
// still delivered in full instead of waiting for the next event.
export function createPingThrottle(broadcast: (count: number) => void, minIntervalMs: number): () => void {
	let pending = 0
	let lastPingMs = 0
	let flushTimer: NodeJS.Timeout | null = null

	const flush = () => {
		flushTimer = null
		if (pending === 0) return
		broadcast(pending)
		pending = 0
		lastPingMs = Date.now()
	}

	return () => {
		pending += 1
		const elapsed = Date.now() - lastPingMs
		if (elapsed >= minIntervalMs) {
			if (flushTimer) clearTimeout(flushTimer)
			flush()
		} else if (!flushTimer) {
			flushTimer = setTimeout(flush, minIntervalMs - elapsed)
		}
	}
}
