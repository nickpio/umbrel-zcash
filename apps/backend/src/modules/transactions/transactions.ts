import type WebSocket from 'ws'
import {transactionStream} from './zmq-subscriber.js'

// Track connected clients
const clients = new Set<WebSocket>()

// Each mempool poll emits how many transactions arrived since the last one.
transactionStream.on('txs', (count: number) => {
	const msg = JSON.stringify({type: 'txPing', count})
	for (const ws of clients) {
		if (ws.readyState === ws.OPEN) ws.send(msg)
	}
})

// WebSocket push for new clients
export function wsStream(socket: WebSocket) {
	clients.add(socket)
	socket.on('close', () => clients.delete(socket))
}
