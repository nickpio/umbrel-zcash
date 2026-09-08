import {useQuery} from '@tanstack/react-query'
import {api} from '@/lib/api'

export function useWebSocketToken() {
	return useQuery({
		queryKey: ['ws-token'],
		queryFn: () => api<{token: string}>('/ws/token'),
	})
}
