import {describe, it} from 'node:test'
import assert from 'node:assert/strict'

import {formatLastHoursLabel, hoursAxisFromData} from './chartHelpers.ts'

describe('hoursAxisFromData', () => {
	it('falls back to a 24h domain when there are no usable points', () => {
		assert.deepEqual(hoursAxisFromData([]), {
			domainMax: 24,
			domain: [24, 0],
			ticks: [24, 18, 12, 6, 0],
			heightTicks: [24, 18, 12, 6],
		})
		assert.deepEqual(hoursAxisFromData([Number.NaN, -1, Number.POSITIVE_INFINITY]), {
			domainMax: 24,
			domain: [24, 0],
			ticks: [24, 18, 12, 6, 0],
			heightTicks: [24, 18, 12, 6],
		})
	})

	it('uses a 5h window for 200 Zcash blocks at the 75s target (~4.17h)', () => {
		const zcashWindowHours = (200 * 75) / 3600
		assert.equal(zcashWindowHours.toFixed(2), '4.17')

		const axis = hoursAxisFromData([0.01, zcashWindowHours])
		assert.deepEqual(axis, {
			domainMax: 5,
			domain: [5, 0],
			ticks: [5, 4, 3, 2, 1, 0],
			heightTicks: [5, 4, 3, 2, 1],
		})
		assert.ok(axis.domainMax >= zcashWindowHours)
	})

	it('does not clip the oldest point when snapping to a nice ceiling', () => {
		const axis = hoursAxisFromData([4.9, 0])
		assert.equal(axis.domainMax, 5)
		assert.ok(axis.domainMax >= 4.9)
	})

	it('keeps an exact nice span without padding up to the next ceiling', () => {
		assert.equal(hoursAxisFromData([4]).domainMax, 4)
		assert.equal(hoursAxisFromData([6]).domainMax, 6)
		assert.equal(hoursAxisFromData([1]).domainMax, 1)
	})

	it('uses hourly ticks at or below 6h and 2h ticks through 12h', () => {
		assert.deepEqual(hoursAxisFromData([3.2]).ticks, [4, 3, 2, 1, 0])
		assert.deepEqual(hoursAxisFromData([7.1]).ticks, [8, 6, 4, 2, 0])
		assert.deepEqual(hoursAxisFromData([12]).ticks, [12, 10, 8, 6, 4, 2, 0])
	})

	it('uses 6h ticks for a true 24h span', () => {
		assert.deepEqual(hoursAxisFromData([23.4]), {
			domainMax: 24,
			domain: [24, 0],
			ticks: [24, 18, 12, 6, 0],
			heightTicks: [24, 18, 12, 6],
		})
	})

	it('covers a single very recent point with a 1h domain', () => {
		assert.deepEqual(hoursAxisFromData([0.05]), {
			domainMax: 1,
			domain: [1, 0],
			ticks: [1, 0],
			heightTicks: [1],
		})
	})
})

describe('formatLastHoursLabel', () => {
	it('singularizes a 1 hour window', () => {
		assert.equal(formatLastHoursLabel(1), 'last 1 hour')
		assert.equal(formatLastHoursLabel(5), 'last 5 hours')
	})
})
