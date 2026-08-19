import {EventEmitter} from 'node:events'

import {rpcClient} from '../bitcoind/rpc-client.js'
import {bitcoind} from '../bitcoind/bitcoind.js'

export const transactionStream = new EventEmitter()

let timer: ReturnType<typeof setInterval> | null = null
let lastSize = 0
let primed = false

async function tick() {
	try {
		const info = await rpcClient.command<{size?: number}>('getmempoolinfo')
		const size = info.size ?? 0
		if (primed && size > lastSize) {
			const delta = Math.min(size - lastSize, 30)
			for (let i = 0; i < delta; i++) transactionStream.emit('hashtx')
		}
		lastSize = size
		primed = true
	} catch {
		// RPC not ready
	}
}

function startTxPoller() {
	if (timer) return
	primed = false
	lastSize = 0
	timer = setInterval(() => {
		void tick()
	}, 3_000)
	void tick()
}

function stopTxPoller() {
	if (timer) clearInterval(timer)
	timer = null
	primed = false
	lastSize = 0
}

bitcoind.events.on('stop', stopTxPoller)
bitcoind.events.on('exit', stopTxPoller)
bitcoind.events.on('start', startTxPoller)
startTxPoller()
