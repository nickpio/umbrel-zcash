import {peerCount} from '../peers/peers.js'
import {rpcClient} from '../bitcoind/rpc-client.js'
import {bitcoind} from '../bitcoind/bitcoind.js'
import type {Stats} from '#types'

export async function summary(): Promise<Stats> {
	const [peerSum, mempool, chainInfo] = await Promise.all([
		peerCount(),
		rpcClient.command<{usage?: number; bytes?: number}>('getmempoolinfo').catch(() => ({usage: 0, bytes: 0})),
		rpcClient.command<{size_on_disk?: number; blocks?: number}>('getblockchaininfo'),
	])

	const {startedAt, running} = bitcoind.status()

	return {
		peers: peerSum.total,
		mempoolBytes: mempool.usage ?? mempool.bytes ?? 0,
		chainBytes: chainInfo.size_on_disk ?? 0,
		uptimeSec: running && startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
		blockHeight: chainInfo.blocks ?? 0,
	}
}
