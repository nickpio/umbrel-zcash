import {setTimeout} from 'timers/promises'
import {EventEmitter} from 'node:events'

import type WebSocket from 'ws'
import PQueue from 'p-queue'

import {rpcClient} from '../bitcoind/rpc-client.js'
import {bitcoind} from '../bitcoind/bitcoind.js'
import {NEAR_TIP_BLOCKS} from '../sync/sync.js'
import {blockStream} from './zmq-subscriber.js'

import type {Block, RawBlock, RawTransaction} from '#types'
import {
	blockFeesZat,
	chainFromRpc,
	computeBlockSubsidy,
	computeLockboxZat,
	percentiles,
	txFeeSamplesZat,
	type ZcashChain,
} from './zcash-economics.js'

const rpcQueue = new PQueue({concurrency: 10})

type ChainTipInfo = {
	blocks: number
	headers?: number
	estimatedheight?: number
	chain?: string
}

// Zebra reports blocks == headers during checkpoint sync. The real tip is estimatedheight.
function networkTip(info: ChainTipInfo): number {
	return info.estimatedheight || Math.max(info.headers ?? 0, info.blocks)
}

function isAtNetworkTip(info: ChainTipInfo): boolean {
	const tip = networkTip(info)
	return info.blocks > 0 && tip > 0 && tip - info.blocks <= NEAR_TIP_BLOCKS
}

function transactionGrid(transactions: RawTransaction[], gridSize: number) {
	const TOTAL_BLOCK_SIZE = 2_000_000

	const squareSizes = Array.from({length: gridSize}, (_, i) => i + 1).map((size) => ({
		size,
		totalWeight: 0,
		numberOfBlocks: 0,
	}))

	for (const transaction of transactions) {
		const weight = transaction.size || transaction.weight || transaction.vsize || 0
		const txPercentageOfBlock = weight / TOTAL_BLOCK_SIZE
		for (const chunk of squareSizes) {
			const chunkPercentageOfGrid = Math.pow(chunk.size / gridSize, 2)
			if (txPercentageOfBlock < chunkPercentageOfGrid) {
				chunk.totalWeight += weight
				break
			}
		}
	}

	for (const chunk of squareSizes) {
		const chunkPercentageOfGrid = Math.pow(chunk.size / gridSize, 2)
		const chunkPercentageOfBlock = chunk.totalWeight / TOTAL_BLOCK_SIZE
		chunk.numberOfBlocks = Math.round(chunkPercentageOfBlock / chunkPercentageOfGrid)
	}

	return squareSizes
		.filter((chunk) => chunk.numberOfBlocks > 0)
		.map(({size, numberOfBlocks}) => ({size, numberOfBlocks}))
}

function rawToBlock(raw: RawBlock, chain: ZcashChain): Block {
	const subsidySat = computeBlockSubsidy(raw.height, chain)
	const size = raw.size || raw.tx.reduce((sum, tx) => sum + (tx.size || tx.vsize || 0), 0)

	return {
		hash: raw.hash,
		height: raw.height,
		time: raw.time,
		size,
		weight: raw.weight || size,
		txCount: raw.nTx || raw.tx.length,
		subsidySat,
		feesSat: blockFeesZat(raw.tx[0], subsidySat, computeLockboxZat(raw.height, chain)),
		feeRates: percentiles(txFeeSamplesZat(raw.tx)),
		transactionGrid: transactionGrid(raw.tx, 20),
	}
}

function asObjectArray(value: unknown): Array<Record<string, unknown>> | undefined {
	if (!Array.isArray(value)) return undefined
	return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

function asPool(value: unknown): RawTransaction['orchard'] {
	if (!value || typeof value !== 'object') return undefined
	const pool = value as Record<string, unknown>
	return {
		valueBalance: typeof pool['valueBalance'] === 'number' ? pool['valueBalance'] : undefined,
		valueBalanceZat: typeof pool['valueBalanceZat'] === 'number' ? pool['valueBalanceZat'] : undefined,
		actions: Array.isArray(pool['actions']) ? pool['actions'] : undefined,
	}
}

function normalizeTx(tx: Record<string, unknown>): RawTransaction {
	const size = Number(tx['size'] ?? tx['vsize'] ?? 0)
	const vout = asObjectArray(tx['vout'])?.map((out) => ({
		value: typeof out['value'] === 'number' ? out['value'] : undefined,
		valueZat: typeof out['valueZat'] === 'number' ? out['valueZat'] : undefined,
	}))
	const vjoinsplit = asObjectArray(tx['vjoinsplit'])?.map((js) => ({
		vpub_old: typeof js['vpub_old'] === 'number' ? js['vpub_old'] : undefined,
		vpub_oldZat: typeof js['vpub_oldZat'] === 'number' ? js['vpub_oldZat'] : undefined,
		vpub_new: typeof js['vpub_new'] === 'number' ? js['vpub_new'] : undefined,
		vpub_newZat: typeof js['vpub_newZat'] === 'number' ? js['vpub_newZat'] : undefined,
	}))

	return {
		txid: String(tx['txid'] ?? ''),
		vsize: size,
		weight: Number(tx['weight'] ?? size),
		size,
		vin: asObjectArray(tx['vin']),
		vout,
		valueBalance: typeof tx['valueBalance'] === 'number' ? tx['valueBalance'] : undefined,
		valueBalanceZat: typeof tx['valueBalanceZat'] === 'number' ? tx['valueBalanceZat'] : undefined,
		vShieldedSpend: Array.isArray(tx['vShieldedSpend']) ? tx['vShieldedSpend'] : undefined,
		vShieldedOutput: Array.isArray(tx['vShieldedOutput']) ? tx['vShieldedOutput'] : undefined,
		vjoinsplit,
		orchard: asPool(tx['orchard']),
		ironwood: asPool(tx['ironwood']),
	}
}

function normalizeBlock(raw: Record<string, unknown>): RawBlock {
	const txField = raw['tx']
	const txs: RawTransaction[] = []

	if (Array.isArray(txField)) {
		for (const item of txField) {
			if (typeof item === 'string') {
				txs.push({txid: item, vsize: 0, weight: 0})
			} else if (item && typeof item === 'object') {
				txs.push(normalizeTx(item as Record<string, unknown>))
			}
		}
	}

	return {
		hash: String(raw['hash'] ?? ''),
		height: Number(raw['height'] ?? 0),
		time: Number(raw['time'] ?? 0),
		nTx: Number(raw['nTx'] ?? txs.length),
		size: Number(raw['size'] ?? 0),
		weight: Number(raw['weight'] ?? raw['size'] ?? 0),
		tx: txs,
	}
}

const CACHE_DEPTH = 200
const blockCache = new Map<number, Block>()
const fullHeights = new Set<number>()

function evictOldEntries() {
	if (blockCache.size <= CACHE_DEPTH) return
	const sortedKeys = Array.from(blockCache.keys()).sort((a, b) => a - b)
	const keysToDelete = sortedKeys.slice(0, blockCache.size - CACHE_DEPTH)
	for (const key of keysToDelete) {
		blockCache.delete(key)
		fullHeights.delete(key)
	}
}

async function getBlockByRef(ref: string | number, verbosity: 1 | 2): Promise<RawBlock> {
	return normalizeBlock(await rpcClient.command<Record<string, unknown>>('getblock', String(ref), verbosity))
}

async function getBlockPreferVerbose(ref: string | number): Promise<{raw: RawBlock; full: boolean}> {
	try {
		return {raw: await getBlockByRef(ref, 2), full: true}
	} catch {
		// Verbosity 2 is heavier; fall back if the node rejects it or times out.
		return {raw: await getBlockByRef(ref, 1), full: false}
	}
}

async function fetchBlock(height: number, chain: ZcashChain, wantFull: boolean): Promise<Block> {
	const cached = blockCache.get(height)
	if (cached && (!wantFull || fullHeights.has(height))) return cached

	const {raw, full} = wantFull ? await getBlockPreferVerbose(height) : {raw: await getBlockByRef(height, 1), full: false}
	const block = rawToBlock(raw, chain)
	blockCache.set(height, block)
	if (full) fullHeights.add(height)
	evictOldEntries()
	return block
}

// Upper bound for a single list() call; anything larger would fan out one
// getblock RPC per block through the shared queue and starve every other caller.
export const MAX_LIST_LIMIT = CACHE_DEPTH

export function clampListLimit(limit: unknown): number {
	const parsed = Math.trunc(Number(limit))
	if (!Number.isFinite(parsed)) return MAX_LIST_LIMIT
	return Math.min(Math.max(parsed, 1), MAX_LIST_LIMIT)
}

export async function list(requestedLimit: unknown = MAX_LIST_LIMIT): Promise<Block[]> {
	const limit = clampListLimit(requestedLimit)
	const info = await rpcClient.command<ChainTipInfo>('getblockchaininfo')
	const chain = chainFromRpc(info.chain)
	const tipHeight = info.blocks
	const atTip = isAtNetworkTip(info)
	const requested = atTip ? limit : Math.min(limit, 5)
	const count = Math.min(requested, tipHeight + 1)
	const wantFull = atTip || limit <= 5

	const blocks = (await Promise.all(
		Array.from({length: count}, (_, i) => rpcQueue.add(() => fetchBlock(tipHeight - i, chain, wantFull))),
	)) as Block[]

	return blocks.reverse()
}

const newBlockEmitter = new EventEmitter()

let processing = false
let fullPrimeComplete = false

blockStream.on('block', async (hash: string) => {
	if (processing) return
	processing = true
	try {
		const info = await rpcClient.command<ChainTipInfo>('getblockchaininfo')
		if (!isAtNetworkTip(info)) return

		const {raw, full} = await getBlockPreferVerbose(hash)
		const block = rawToBlock(raw, chainFromRpc(info.chain))
		blockCache.set(block.height, block)
		if (full) fullHeights.add(block.height)
		evictOldEntries()
		newBlockEmitter.emit('block', block)

		if (!fullPrimeComplete) {
			fullPrimeComplete = true
			console.log('[blocks] at tip, priming full cache in background')
			list(CACHE_DEPTH).catch((err) => console.error('[blocks] background prime error:', err))
		}
	} catch (err) {
		console.error('[blocks] poll handler error:', err)
	} finally {
		processing = false
	}
})

export function wsStream(socket: WebSocket) {
	const send = (block: Block) => {
		try {
			socket.send(JSON.stringify(block))
		} catch {
			// Socket may have closed between emit and send
		}
	}
	newBlockEmitter.on('block', send)
	socket.on('close', () => newBlockEmitter.off('block', send))
}

let priming = false

async function prime() {
	if (priming) return
	priming = true
	try {
		await setTimeout(5000)
		const info = await rpcClient.command<ChainTipInfo>('getblockchaininfo')
		const atTip = isAtNetworkTip(info)
		if (!atTip) {
			console.log('[blocks] prime: skipped until Zebra reaches the estimated tip')
			return
		}
		fullPrimeComplete = true
		console.log(`[blocks] prime: ${CACHE_DEPTH} blocks (synced)`)
		await list(CACHE_DEPTH)
	} finally {
		priming = false
	}
}

function reset() {
	blockCache.clear()
	fullHeights.clear()
	fullPrimeComplete = false
	processing = false
	priming = false
}

bitcoind.events.on('stop', () => {
	console.log('[blocks] zebrad stopped, clearing cache')
	reset()
})

bitcoind.events.on('start', () => {
	console.log('[blocks] zebrad started, priming cache')
	prime().catch((err) => console.error('[blocks] prime error:', err))
})

prime().catch((err) => console.error('[blocks] init error:', err))
