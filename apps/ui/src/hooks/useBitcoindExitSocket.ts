// This hook sets up a WebSocket connection to the backend to listen for node / lightwalletd exit events
// It also shows a toast notification when one of them crashes

import {useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {useQueryClient} from '@tanstack/react-query'
import {toast} from 'sonner'

import {useWebSocketToken} from './useWebSocketToken'

import type {ExitInfo, ExitSnapshot, ExitSource} from '#types'

// Fixed ID for the toast notification so we can make sure not to show it multiple times
const TOAST_ID = 'bitcoind-exit'

export function useBitcoindExitSocket() {
	const qc = useQueryClient()
	const navigate = useNavigate()
	const {data} = useWebSocketToken()

	useEffect(() => {
		if (!data?.token) return
		const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/api/ws/bitcoind/exit?token=${data?.token}`)

		// Which managed processes are currently down. The node takes priority in the
		// toast, and a lightwalletd crash is only dismissed once lightwalletd is back.
		const down = new Map<ExitSource, ExitInfo>()

		const render = () => {
			const info = down.get('node') ?? down.get('lightwalletd') ?? null
			qc.setQueryData(['bitcoind', 'exit'], info)

			if (!info) {
				toast.dismiss(TOAST_ID)
				return
			}

			toast.error(`${info.label} stopped unexpectedly`, {
				id: TOAST_ID,
				duration: Infinity,
				closeButton: true,
				action: {
					label: 'View logs',
					onClick: () => navigate('/settings?tab=advanced&clearSearch=true'),
				},
			})
		}

		ws.onmessage = (event) => {
			const msg = JSON.parse(event.data)

			// The backend sends a snapshot immediately after the client connects,
			// covering both the node and lightwalletd.
			if (msg.type === 'snapshot') {
				const snapshot = msg as ExitSnapshot
				down.clear()
				if (!snapshot.running && snapshot.exit) down.set('node', snapshot.exit)
				if (!snapshot.lightwalletdRunning && snapshot.lightwalletdExit) {
					down.set('lightwalletd', snapshot.lightwalletdExit)
				}
				render()
				return
			}

			// Live "exit" event: a process just crashed while the socket is open
			if (msg.type === 'exit') {
				const info = msg as ExitInfo
				down.set(info.source, info)
				render()
				return
			}
		}

		return () => ws.close()
	}, [qc, navigate, data?.token])
}
