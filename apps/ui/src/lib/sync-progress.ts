import type {SyncStatus} from '#types'

export function calcSyncPercent(syncStatus?: SyncStatus): number {
	if (!syncStatus) return 0

	const {blockHeight, estimatedHeight, syncProgress, isInitialBlockDownload} = syncStatus
	if (blockHeight > 0 && !isInitialBlockDownload) return 100
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
	if (isInitialBlockDownload) return 'IBD'
	return 'synced'
}
