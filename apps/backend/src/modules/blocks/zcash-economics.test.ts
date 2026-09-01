import {describe, it} from 'node:test'
import assert from 'node:assert/strict'

import {
	blockFeesZat,
	computeBlockSubsidy,
	computeLockboxZat,
	conventionalFeeZat,
	percentiles,
	tryActualFeeZat,
	txFeeSamplesZat,
} from './zcash-economics.ts'

describe('computeBlockSubsidy', () => {
	it('ramps during slow start', () => {
		assert.equal(computeBlockSubsidy(0, 'main'), 0)
		assert.equal(computeBlockSubsidy(1, 'main'), 62_500)
		assert.equal(computeBlockSubsidy(10_000, 'main'), 625_062_500)
	})

	it('is 12.5 ZEC after slow start and before Blossom', () => {
		assert.equal(computeBlockSubsidy(20_000, 'main'), 1_250_000_000)
		assert.equal(computeBlockSubsidy(653_599, 'main'), 1_250_000_000)
	})

	it('halves the per-block subsidy at Blossom', () => {
		assert.equal(computeBlockSubsidy(653_600, 'main'), 625_000_000)
		assert.equal(computeBlockSubsidy(1_046_399, 'main'), 625_000_000)
	})

	it('uses the post-Blossom halving heights', () => {
		assert.equal(computeBlockSubsidy(1_046_400, 'main'), 312_500_000)
		assert.equal(computeBlockSubsidy(2_726_400, 'main'), 156_250_000)
	})

	it('uses the testnet Blossom height', () => {
		assert.equal(computeBlockSubsidy(583_999, 'test'), 1_250_000_000)
		assert.equal(computeBlockSubsidy(584_000, 'test'), 625_000_000)
	})
})

describe('computeLockboxZat', () => {
	it('defers nothing before NU6', () => {
		assert.equal(computeLockboxZat(2_726_399, 'main'), 0)
	})

	it('defers 12% of the subsidy from NU6 through the NU6.1 stream', () => {
		assert.equal(computeLockboxZat(2_726_400, 'main'), 18_750_000)
		assert.equal(computeLockboxZat(3_146_400, 'main'), 18_750_000)
		assert.equal(computeLockboxZat(4_406_399, 'main'), 18_750_000)
	})

	it('ends with the NU6.1 stream at the next halving', () => {
		assert.equal(computeLockboxZat(4_406_400, 'main'), 0)
	})

	it('follows the testnet ranges, including the gap between NU6 and NU6.1 streams', () => {
		assert.equal(computeLockboxZat(2_975_999, 'test'), 0)
		assert.equal(computeLockboxZat(2_976_000, 'test'), 18_750_000)
		assert.equal(computeLockboxZat(3_396_000, 'test'), 0)
		assert.equal(computeLockboxZat(3_536_500, 'test'), 18_750_000)
		assert.equal(computeLockboxZat(4_476_000, 'test'), 0)
	})
})

describe('ZIP-317 conventional fee', () => {
	it('applies the 2-action grace window', () => {
		assert.equal(conventionalFeeZat({}), 10_000)
		assert.equal(conventionalFeeZat({orchard: {actions: [{}, {}]}}), 10_000)
	})

	it('scales with orchard actions', () => {
		assert.equal(conventionalFeeZat({orchard: {actions: [{}, {}, {}, {}]}}), 20_000)
	})

	it('counts ironwood actions', () => {
		assert.equal(conventionalFeeZat({ironwood: {actions: [{}, {}, {}]}}), 15_000)
	})
})

describe('fees from coinbase and transparent inputs', () => {
	it('subtracts subsidy from coinbase created value', () => {
		const coinbase = {
			vin: [{coinbase: '00'}],
			vout: [{valueZat: 156_260_000}],
		}
		assert.equal(blockFeesZat(coinbase, 156_250_000), 10_000)
	})

	it('includes shielded coinbase outputs via valueBalance', () => {
		const coinbase = {
			vin: [{coinbase: '00'}],
			vout: [{valueZat: 125_000_000}],
			ironwood: {valueBalanceZat: -31_260_000, actions: []},
		}
		assert.equal(blockFeesZat(coinbase, 156_250_000), 10_000)
	})

	it('excludes the deferred lockbox from the expected coinbase value', () => {
		// Post-NU6 mainnet: 1.5625 ZEC subsidy, 0.1875 ZEC deferred, 0.0001 ZEC in fees.
		const coinbase = {
			vin: [{coinbase: '00'}],
			vout: [{valueZat: 12_500_000}],
			orchard: {valueBalanceZat: -125_010_000, actions: []},
		}
		assert.equal(blockFeesZat(coinbase, 156_250_000), 0)
		assert.equal(blockFeesZat(coinbase, 156_250_000, 18_750_000), 10_000)
	})

	it('computes an actual fee when input values are present', () => {
		assert.equal(
			tryActualFeeZat({
				vin: [{valueSat: 20_000}],
				vout: [{valueZat: 10_000}],
			}),
			10_000,
		)
	})

	it('uses shielded valueBalance as the fee for orchard-only txs', () => {
		assert.equal(tryActualFeeZat({orchard: {valueBalanceZat: 10_000, actions: [{}, {}]}}), 10_000)
	})

	it('returns null when transparent inputs have no value', () => {
		assert.equal(tryActualFeeZat({vin: [{txid: 'ab', vout: 0}], vout: [{valueZat: 1}]}), null)
	})

	it('skips the coinbase when sampling median fees', () => {
		const samples = txFeeSamplesZat([
			{vin: [{coinbase: '00'}], vout: [{valueZat: 156_250_000}]},
			{orchard: {actions: [{}, {}, {}, {}]}},
		])
		assert.deepEqual(samples, [20_000])
	})
})

describe('percentiles', () => {
	it('returns zeros for an empty set', () => {
		assert.deepEqual(percentiles([]), {p10: 0, p50: 0, p90: 0})
	})

	it('picks sorted ranks', () => {
		assert.deepEqual(percentiles([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]), {p10: 20, p50: 60, p90: 100})
	})
})
