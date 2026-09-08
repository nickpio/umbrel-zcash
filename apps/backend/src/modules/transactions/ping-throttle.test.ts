import {afterEach, beforeEach, describe, it, mock} from 'node:test'
import assert from 'node:assert/strict'

import {createPingThrottle} from './ping-throttle.ts'

const INTERVAL = 33

describe('createPingThrottle', () => {
	let frames: Array<{t: number; count: number}>
	let onTx: () => void

	beforeEach(() => {
		mock.timers.enable({apis: ['setTimeout', 'Date'], now: 10_000})
		frames = []
		onTx = createPingThrottle((count) => frames.push({t: Date.now(), count}), INTERVAL)
	})

	afterEach(() => mock.timers.reset())

	it('delivers the rest of a burst once the window closes (issue #6 reproduction)', () => {
		for (let i = 0; i < 10; i++) onTx()
		assert.deepEqual(frames, [{t: 10_000, count: 1}])

		mock.timers.tick(INTERVAL - 1)
		assert.equal(frames.length, 1)

		mock.timers.tick(1)
		assert.deepEqual(frames, [
			{t: 10_000, count: 1},
			{t: 10_000 + INTERVAL, count: 9},
		])
	})

	it('sends nothing extra when there is no backlog', () => {
		onTx()
		mock.timers.tick(INTERVAL * 3)
		assert.deepEqual(frames, [{t: 10_000, count: 1}])
	})

	it('never exceeds one frame per interval and never loses transactions', () => {
		const sent = 40
		for (let i = 0; i < sent; i++) {
			onTx()
			mock.timers.tick(5)
		}
		mock.timers.tick(INTERVAL)

		for (let i = 1; i < frames.length; i++) {
			assert.ok(frames[i].t - frames[i - 1].t >= INTERVAL, `frames ${i - 1} and ${i} are too close`)
		}
		assert.equal(
			frames.reduce((sum, frame) => sum + frame.count, 0),
			sent,
		)
	})

	it('resets the window after a trailing flush', () => {
		onTx()
		onTx()
		mock.timers.tick(INTERVAL) // trailing flush at t=10_033

		onTx() // inside the new window: must wait, not send immediately
		assert.equal(frames.length, 2)
		mock.timers.tick(INTERVAL)
		assert.deepEqual(frames.at(-1), {t: 10_000 + INTERVAL * 2, count: 1})
	})
})
