import {rpcClient} from '../bitcoind/rpc-client.js'
import {lightwalletd} from '../bitcoind/bitcoind.js'

import type {SyncStatus} from '#types'

export async function syncStatus(): Promise<SyncStatus> {
	const info = await rpcClient.command<{
		verificationprogress: number
		initialblockdownload: boolean
		blocks: number
		headers: number
		estimatedheight?: number
	}>('getblockchaininfo')

	const estimatedHeight = info.estimatedheight ?? Math.max(info.headers, info.blocks)
	const behindTip = estimatedHeight > 0 && info.blocks < estimatedHeight

	return {
		syncProgress: info.verificationprogress,
		// Zebra omits Bitcoin's initialblockdownload flag; treat "below estimated tip" as IBD.
		isInitialBlockDownload: info.initialblockdownload ?? behindTip,
		blockHeight: info.blocks,
		validatedHeaderHeight: info.headers || estimatedHeight,
		estimatedHeight,
		walletReady: lightwalletd.status().running,
	}
}
