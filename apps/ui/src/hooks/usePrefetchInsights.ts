import {useEffect} from 'react'
import {useQueryClient} from '@tanstack/react-query'

import type {Block, Stats} from '#types'
import type {PeerInfo} from '#types'

import {api} from '@/lib/api'
import {syncStage} from '@/lib/sync-progress'
import {useSyncStatus} from '@/hooks/useSyncStatus'

const NUM_BLOCKS = 200

export function usePrefetchInsights() {
	const queryClient = useQueryClient()
	const {data: syncStatus} = useSyncStatus()
	const stage = syncStage(syncStatus)

	useEffect(() => {
		const prefetch = () => {
			queryClient.prefetchQuery({
				queryKey: ['rpc', 'stats'],
				queryFn: () => api<Stats>('/rpc/stats'),
			})
			// 200 full blocks during Zebra IBD saturates RPC and makes sync look stuck.
			if (stage === 'synced') {
				queryClient.prefetchQuery({
					queryKey: ['rpc', 'blocks', NUM_BLOCKS],
					queryFn: () => api<Block[]>(`/rpc/blocks?limit=${NUM_BLOCKS}`),
				})
			}
			queryClient.prefetchQuery({
				queryKey: ['rpc', 'peers', 'info'],
				queryFn: () => api<PeerInfo[]>('/rpc/peers/info'),
			})
		}

		// We could also use requestIdleCallback, but it's not supported in all browsers and won't work in React's Strict mode during dev.
		// requestAnimationFrame fires on the next frame after the first paint, so it never delays
		// a page's render or its own fetches; all network requests run in parallel.
		const id = requestAnimationFrame(prefetch)

		// Cleanup on unmount
		return () => cancelAnimationFrame(id)
	}, [queryClient, stage])
}
