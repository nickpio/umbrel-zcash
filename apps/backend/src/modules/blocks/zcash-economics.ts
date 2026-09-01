import type {RawTransaction} from '#types'

export type ZcashChain = 'main' | 'test' | 'regtest'

type FeeTx = Partial<RawTransaction>

const MAX_BLOCK_SUBSIDY = 1_250_000_000
const SLOW_START_INTERVAL = 20_000
const SLOW_START_SHIFT = SLOW_START_INTERVAL / 2
const PRE_BLOSSOM_HALVING_INTERVAL = 840_000
const BLOSSOM_POW_RATIO = 2

const BLOSSOM_HEIGHT: Record<ZcashChain, number> = {
	main: 653_600,
	test: 584_000,
	regtest: 1,
}

// ZIP-1015 / ZIP-1016 defer 12% of the subsidy to a lockbox that is never paid out in the coinbase.
// Ranges are [start, end) and mirror Zebra's `Deferred` funding streams (NU6 and NU6.1).
const LOCKBOX_NUMERATOR = 12
const FUNDING_STREAM_DENOMINATOR = 100
const LOCKBOX_HEIGHT_RANGES: Record<ZcashChain, Array<[number, number]>> = {
	main: [[2_726_400, 4_406_400]],
	test: [
		[2_976_000, 3_396_000],
		[3_536_500, 4_476_000],
	],
	regtest: [],
}

const ZIP317_MARGINAL_FEE = 5_000
const ZIP317_GRACE_ACTIONS = 2

export function chainFromRpc(chain: string | undefined): ZcashChain {
	if (chain === 'test' || chain === 'regtest') return chain
	return 'main'
}

function halvingHeight(height: number, blossom: number): number {
	if (height < blossom) return height - SLOW_START_SHIFT
	return Math.floor((height - blossom) / BLOSSOM_POW_RATIO) + (blossom - SLOW_START_SHIFT)
}

export function computeBlockSubsidy(height: number, chain: ZcashChain = 'main'): number {
	if (height < 0) return 0
	if (height < SLOW_START_SHIFT) {
		return Math.floor((MAX_BLOCK_SUBSIDY * height) / SLOW_START_INTERVAL)
	}
	if (height < SLOW_START_INTERVAL) {
		return Math.floor((MAX_BLOCK_SUBSIDY * (height + 1)) / SLOW_START_INTERVAL)
	}

	const blossom = BLOSSOM_HEIGHT[chain]
	const halvings = Math.floor(halvingHeight(height, blossom) / PRE_BLOSSOM_HALVING_INTERVAL)
	if (halvings >= 64) return 0
	const blossomDivisor = height >= blossom ? BLOSSOM_POW_RATIO : 1
	return Math.floor(MAX_BLOCK_SUBSIDY / 2 ** halvings / blossomDivisor)
}

export function computeLockboxZat(height: number, chain: ZcashChain = 'main'): number {
	const deferred = LOCKBOX_HEIGHT_RANGES[chain].some(([start, end]) => height >= start && height < end)
	if (!deferred) return 0
	return Math.floor((computeBlockSubsidy(height, chain) * LOCKBOX_NUMERATOR) / FUNDING_STREAM_DENOMINATOR)
}

function isCoinbaseTx(tx: FeeTx): boolean {
	return tx.vin?.[0]?.['coinbase'] != null
}

function zatFrom(zat: number | undefined, zec: number | undefined): number {
	if (typeof zat === 'number' && Number.isFinite(zat)) return zat
	if (typeof zec === 'number' && Number.isFinite(zec)) return Math.round(zec * 1e8)
	return 0
}

function sumVoutZat(tx: FeeTx): number {
	let sum = 0
	for (const out of tx.vout ?? []) {
		sum += zatFrom(out.valueZat, out.value)
	}
	return sum
}

function sproutNetZat(tx: FeeTx): number {
	let net = 0
	for (const js of tx.vjoinsplit ?? []) {
		net += zatFrom(js.vpub_oldZat, js.vpub_old) - zatFrom(js.vpub_newZat, js.vpub_new)
	}
	return net
}

function poolBalanceZat(pool: FeeTx['orchard']): number {
	if (!pool) return 0
	return zatFrom(pool.valueBalanceZat, pool.valueBalance)
}

function coinbaseCreatedZat(tx: FeeTx): number {
	return (
		sumVoutZat(tx) -
		zatFrom(tx.valueBalanceZat, tx.valueBalance) -
		poolBalanceZat(tx.orchard) -
		poolBalanceZat(tx.ironwood) +
		sproutNetZat(tx)
	)
}

export function blockFeesZat(coinbase: FeeTx | undefined, subsidyZat: number, lockboxZat = 0): number {
	if (!coinbase?.vout?.length) return 0
	return Math.max(0, coinbaseCreatedZat(coinbase) - (subsidyZat - lockboxZat))
}

function logicalActions(tx: FeeTx): number {
	const nIn = (tx.vin ?? []).filter((vin) => vin['coinbase'] == null).length
	const nOut = tx.vout?.length ?? 0
	const transparent = Math.max(nIn, nOut)
	const sprout = 2 * (tx.vjoinsplit?.length ?? 0)
	const sapling = Math.max(tx.vShieldedSpend?.length ?? 0, tx.vShieldedOutput?.length ?? 0)
	const orchard = tx.orchard?.actions?.length ?? 0
	const ironwood = tx.ironwood?.actions?.length ?? 0
	return transparent + sprout + sapling + orchard + ironwood
}

export function conventionalFeeZat(tx: FeeTx): number {
	return ZIP317_MARGINAL_FEE * Math.max(ZIP317_GRACE_ACTIONS, logicalActions(tx))
}

export function tryActualFeeZat(tx: FeeTx): number | null {
	if (isCoinbaseTx(tx)) return 0

	let transparentIn = 0
	let sawTransparentIn = false
	for (const vin of tx.vin ?? []) {
		if (vin['coinbase'] != null) return 0
		const zat = vin['valueSat']
		const zec = vin['value']
		if (typeof zat === 'number' && Number.isFinite(zat)) {
			transparentIn += zat
			sawTransparentIn = true
			continue
		}
		if (typeof zec === 'number' && Number.isFinite(zec)) {
			transparentIn += Math.round(zec * 1e8)
			sawTransparentIn = true
			continue
		}
		return null
	}

	const sapling = zatFrom(tx.valueBalanceZat, tx.valueBalance)
	const orchard = poolBalanceZat(tx.orchard)
	const ironwood = poolBalanceZat(tx.ironwood)
	const sprout = sproutNetZat(tx)
	const hasShieldedBalance =
		tx.valueBalanceZat != null ||
		tx.valueBalance != null ||
		tx.orchard?.valueBalanceZat != null ||
		tx.orchard?.valueBalance != null ||
		tx.ironwood?.valueBalanceZat != null ||
		tx.ironwood?.valueBalance != null ||
		(tx.vjoinsplit?.length ?? 0) > 0

	if (!sawTransparentIn && !hasShieldedBalance) return null

	return transparentIn - sumVoutZat(tx) + sapling + orchard + ironwood + sprout
}

export function txFeeSamplesZat(txs: FeeTx[]): number[] {
	const samples: number[] = []
	for (const tx of txs.slice(1)) {
		if (isCoinbaseTx(tx)) continue
		samples.push(tryActualFeeZat(tx) ?? conventionalFeeZat(tx))
	}
	return samples
}

export function percentiles(values: number[]): {p10: number; p50: number; p90: number} {
	if (values.length === 0) return {p10: 0, p50: 0, p90: 0}
	const sorted = [...values].sort((a, b) => a - b)
	const pick = (p: number) => sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)]
	return {p10: pick(10), p50: pick(50), p90: pick(90)}
}
