import type {SyncStatus} from '#types'

export function calcSyncPercent(syncStatus?: SyncStatus): number {
	if (!syncStatus) return 0

	const {blockHeight, estimatedHeight, syncProgress} = syncStatus
	// Zebra reports blocks == headers during checkpoint sync; estimatedHeight is the network tip.
	if (estimatedHeight > 0 && blockHeight >= estimatedHeight) return 100

	return Math.floor((syncProgress || 0) * 10000) / 100
}

export type SyncStage =
	| 'pre-headers'
	| 'headers'
	| 'IBD'
	| 'synced'

export function syncStage(syncStatus?: SyncStatus): SyncStage {
	if (!syncStatus) return 'pre-headers'

	const {blockHeight, estimatedHeight, isInitialBlockDownload} = syncStatus
	const tip = estimatedHeight || 0

	if (tip === 0 && blockHeight === 0) return 'pre-headers'
	if (tip > 0 && blockHeight === 0) return 'headers'
	if (isInitialBlockDownload || (tip > 0 && blockHeight < tip)) return 'IBD'
	return 'synced'
}
