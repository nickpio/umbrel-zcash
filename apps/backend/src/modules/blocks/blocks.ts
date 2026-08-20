import {setTimeout} from 'timers/promises'
import {EventEmitter} from 'node:events'

import type WebSocket from 'ws'
import PQueue from 'p-queue'

import {rpcClient} from '../bitcoind/rpc-client.js'
import {bitcoind} from '../bitcoind/bitcoind.js'
import {blockStream} from './zmq-subscriber.js'

import type {Block, RawBlock, RawTransaction} from '#types'

const rpcQueue = new PQueue({concurrency: 10})

type ChainTipInfo = {
	blocks: number
	headers?: number
	estimatedheight?: number
}

// Zebra reports blocks == headers during checkpoint sync. The real tip is estimatedheight.
function networkTip(info: ChainTipInfo): number {
	return info.estimatedheight || Math.max(info.headers ?? 0, info.blocks)
}

function isAtNetworkTip(info: ChainTipInfo): boolean {
	const tip = networkTip(info)
	return info.blocks > 0 && tip > 0 && info.blocks >= tip
}

function computeSubsidy(height: number): number {
	const slowStart = 20_000
	const initial = 12.5e8
	const halvingInterval = 840_000
	if (height < slowStart) return Math.floor((initial * height) / slowStart)
	const halvings = Math.floor(height / halvingInterval)
	if (halvings >= 64) return 0
	return Math.floor(initial / 2 ** halvings)
}

function computeFeeRatePercentiles(txs: RawTransaction[]): {p10: number; p50: number; p90: number} {
	const feeRates = txs
		.filter((tx) => tx.fee != null && tx.vsize > 0)
		.map((tx) => Math.round((tx.fee! * 1e8) / tx.vsize))
		.sort((a, b) => a - b)

	if (feeRates.length === 0) return {p10: 0, p50: 0, p90: 0}

	const pick = (p: number) => feeRates[Math.min(Math.floor((p / 100) * feeRates.length), feeRates.length - 1)]
	return {p10: pick(10), p50: pick(50), p90: pick(90)}
}

function transactionGrid(transactions: RawTransaction[], gridSize: number) {
	const TOTAL_BLOCK_SIZE = 2_000_000

	const squareSizes = Array.from({length: gridSize}, (_, i) => i + 1).map((size) => ({
		size,
		totalWeight: 0,
		numberOfBlocks: 0,
	}))

	for (const transaction of transactions) {
		const weight = transaction.weight || transaction.vsize || 0
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

type BlockStats = {
	height: number
	time: number
	blockhash: string
	total_size: number
	total_weight: number
	txs: number
	subsidy: number
	totalfee: number
	feerate_percentiles: [number, number, number, number, number]
}

function statsToBlock(stats: BlockStats): Block {
	const [p10, , p50, , p90] = stats.feerate_percentiles ?? [0, 0, 0, 0, 0]
	return {
		hash: stats.blockhash,
		height: stats.height,
		time: stats.time,
		size: stats.total_size,
		weight: stats.total_weight,
		txCount: stats.txs,
		subsidySat: stats.subsidy,
		feesSat: stats.totalfee,
		feeRates: {p10, p50, p90},
		transactionGrid: [],
	}
}

function rawToBlock(raw: RawBlock): Block {
	const feesSat = Math.round(raw.tx.reduce((sum: number, tx) => sum + (tx.fee ?? 0), 0) * 1e8)

	return {
		hash: raw.hash,
		height: raw.height,
		time: raw.time,
		size: raw.size,
		weight: raw.weight || raw.size,
		txCount: raw.nTx,
		subsidySat: computeSubsidy(raw.height),
		feesSat,
		feeRates: computeFeeRatePercentiles(raw.tx),
		transactionGrid: transactionGrid(raw.tx, 20),
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
				const tx = item as Record<string, unknown>
				txs.push({
					txid: String(tx['txid'] ?? ''),
					fee: typeof tx['fee'] === 'number' ? tx['fee'] : undefined,
					vsize: Number(tx['vsize'] ?? tx['size'] ?? 0),
					weight: Number(tx['weight'] ?? tx['size'] ?? 0),
				})
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

function evictOldEntries() {
	if (blockCache.size <= CACHE_DEPTH) return
	const sortedKeys = Array.from(blockCache.keys()).sort((a, b) => a - b)
	const keysToDelete = sortedKeys.slice(0, blockCache.size - CACHE_DEPTH)
	keysToDelete.forEach((key) => blockCache.delete(key))
}

async function getBlockFull(height: number): Promise<Block> {
	const cached = blockCache.get(height)
	if (cached && cached.transactionGrid.length > 0) return cached

	const blockHash = await rpcClient.command<string>('getblockhash', height)
	let raw: RawBlock
	try {
		raw = normalizeBlock(await rpcClient.command<Record<string, unknown>>('getblock', blockHash, 2))
	} catch {
		raw = normalizeBlock(await rpcClient.command<Record<string, unknown>>('getblock', blockHash, 1))
	}
	const block = rawToBlock(raw)
	blockCache.set(height, block)
	evictOldEntries()
	return block
}

async function getBlockLight(height: number): Promise<Block> {
	const cached = blockCache.get(height)
	if (cached) return cached

	try {
		const stats = await rpcClient.command<BlockStats>('getblockstats', height)
		const block = statsToBlock(stats)
		blockCache.set(height, block)
		evictOldEntries()
		return block
	} catch {
		// Zebra has no getblockstats. Verbosity 2 walks every tx and stalls IBD.
		const blockHash = await rpcClient.command<string>('getblockhash', height)
		const raw = normalizeBlock(await rpcClient.command<Record<string, unknown>>('getblock', blockHash, 1))
		const block = rawToBlock(raw)
		blockCache.set(height, block)
		evictOldEntries()
		return block
	}
}

export async function list(limit = 200): Promise<Block[]> {
	const info = await rpcClient.command<ChainTipInfo>('getblockchaininfo')
	const tipHeight = info.blocks
	const requested = isAtNetworkTip(info) ? limit : Math.min(limit, 5)
	const count = Math.min(requested, tipHeight + 1)
	const fetchFn = limit <= 5 ? getBlockFull : getBlockLight

	const blocks = (await Promise.all(Array.from({length: count}, (_, i) => rpcQueue.add(() => fetchFn(tipHeight - i))))) as Block[]

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

		const raw = normalizeBlock(await rpcClient.command<Record<string, unknown>>('getblock', hash, 1))
		const block = rawToBlock(raw)
		blockCache.set(block.height, block)
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
