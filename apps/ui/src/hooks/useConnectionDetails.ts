import {useQuery} from '@tanstack/react-query'

import {api} from '@/lib/api'

import type {ConnectionDetails} from '#types'

// TODO: decide on cache times
export function useConnectionDetails() {
	return useQuery({
		queryKey: ['connect', 'details'],
		queryFn: () => api<ConnectionDetails>('/connect/details'),
		staleTime: 2_000,
		refetchInterval: (query) => {
			const state = query.state.data?.vizorHttps?.state
			if (state === 'starting' || state === 'needs_login' || state === 'issuing_cert') return 2_000
			return 60_000
		},
	})
}
