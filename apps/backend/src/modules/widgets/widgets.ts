import {syncStatus} from '../sync/sync.js'
import {summary} from '../stats/stats.js'
import prettyBytes from 'pretty-bytes'
import type {SyncStatus} from '#types'

function formatBytes(bytes: number): {value: string; unit: string} {
	const [value, unit] = prettyBytes(bytes, {space: true}).split(' ')
	return {value, unit}
}

function calcSyncPercent(status: SyncStatus | undefined): number {
	if (!status) return 0

	const {blockHeight, estimatedHeight, syncProgress} = status

	if (estimatedHeight > 0 && blockHeight >= estimatedHeight) return 100
	return Math.floor((syncProgress || 0) * 10000) / 100
}

export async function stats() {
	const statsData = await summary()

	const mempoolFormatted = formatBytes(statsData.mempoolBytes)
	const chainFormatted = formatBytes(statsData.chainBytes)

	return {
		type: 'four-stats',
		refresh: '5s',
		link: '',
		items: [
			{title: 'Connections', text: statsData.peers.toString(), subtext: 'peers'},
			{title: 'Mempool', text: mempoolFormatted.value, subtext: mempoolFormatted.unit},
			{title: 'Height', text: statsData.blockHeight.toString(), subtext: 'blocks'},
			{title: 'Blockchain size', text: chainFormatted.value, subtext: chainFormatted.unit},
		],
	}
}

export async function sync() {
	const status = await syncStatus()
	const syncPercent = calcSyncPercent(status)

	return {
		type: 'text-with-progress',
		refresh: '2s',
		link: '',
		title: 'Blockchain sync',
		text: `${syncPercent}%`,
		progressLabel: syncPercent === 100 ? 'Synced' : 'In progress',
		progress: syncPercent / 100,
	}
}
