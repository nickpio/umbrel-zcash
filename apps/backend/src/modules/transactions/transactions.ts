import type WebSocket from 'ws'
import {transactionStream} from './zmq-subscriber.js'
import {createPingThrottle} from './ping-throttle.js'

// Throttle strategy: we queue every tx immediately, but emit at most
// one WebSocket frame every 33 ms (~30 frames per second). That frame includes
// `count`, telling the UI how many transactions arrived in the slice,
// so bursts can be represented faithfully while network & render load
// stay capped at ≤30 messages per second. Transactions that land inside a
// window are flushed when it closes, even if no further transaction arrives.
const MIN_INTERVAL_MS = 33

// Track connected clients
const clients = new Set<WebSocket>()

function broadcastPing(count: number) {
	const msg = JSON.stringify({type: 'txPing', count})
	for (const ws of clients) {
		if (ws.readyState === ws.OPEN) ws.send(msg)
	}
}

transactionStream.on('hashtx', createPingThrottle(broadcastPing, MIN_INTERVAL_MS))

// WebSocket push for new clients
export function wsStream(socket: WebSocket) {
	clients.add(socket)
	socket.on('close', () => clients.delete(socket))
}
