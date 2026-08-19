import {EventEmitter} from 'node:events'

import {rpcClient} from '../bitcoind/rpc-client.js'
import {bitcoind} from '../bitcoind/bitcoind.js'

export const blockStream = new EventEmitter()

let timer: ReturnType<typeof setInterval> | null = null
let lastHash = ''

async function tick() {
	try {
		const hash = await rpcClient.command<string>('getbestblockhash')
		if (hash && hash !== lastHash) {
			lastHash = hash
			blockStream.emit('block', hash)
		}
	} catch {
		// RPC not ready
	}
}

function startBlockPoller() {
	if (timer) return
	timer = setInterval(() => {
		void tick()
	}, 5_000)
	void tick()
}

function stopBlockPoller() {
	if (timer) clearInterval(timer)
	timer = null
	lastHash = ''
}

bitcoind.events.on('stop', stopBlockPoller)
bitcoind.events.on('exit', stopBlockPoller)
bitcoind.events.on('start', startBlockPoller)
startBlockPoller()
