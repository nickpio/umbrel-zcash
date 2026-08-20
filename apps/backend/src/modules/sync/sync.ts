import {rpcClient} from '../bitcoind/rpc-client.js'
import {lightwalletd} from '../bitcoind/bitcoind.js'

import type {SyncStatus} from '#types'

// ~30 minutes of Zcash blocks. A new block makes estimatedheight jump first;
// that live catch-up is not IBD.
export const NEAR_TIP_BLOCKS = 24

export async function syncStatus(): Promise<SyncStatus> {
	const info = await rpcClient.command<{
		verificationprogress: number
		initialblockdownload: boolean
		blocks: number
		headers: number
		estimatedheight?: number
	}>('getblockchaininfo')

	const estimatedHeight = info.estimatedheight ?? 0
	const displayTip = estimatedHeight || Math.max(info.headers, info.blocks)
	const behindBy = estimatedHeight > 0 ? Math.max(0, estimatedHeight - info.blocks) : 0
	const progress = info.verificationprogress ?? 0

	return {
		syncProgress: progress,
		isInitialBlockDownload:
			info.initialblockdownload ??
			(behindBy > NEAR_TIP_BLOCKS || (estimatedHeight === 0 && progress > 0 && progress < 0.995)),
		blockHeight: info.blocks,
		validatedHeaderHeight: info.headers || displayTip,
		estimatedHeight: displayTip,
		walletReady: lightwalletd.status().running,
	}
}
