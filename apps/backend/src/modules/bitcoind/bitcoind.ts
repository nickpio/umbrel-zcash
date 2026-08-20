import {ZebradManager} from './manager.js'
import {LightwalletdManager} from '../lightwalletd/manager.js'
import {waitForRpc} from './rpc-client.js'
import {ensureConfig, getSettings} from '../config/config.js'

import type {BitcoindVersion, BitcoindStatus, BitcoindLifecycleResponse, ExitInfo} from '#types'
import type WebSocket from 'ws'

export const bitcoind = new ZebradManager()
export const lightwalletd = new LightwalletdManager()

async function startLightwalletdWhenReady(): Promise<void> {
	try {
		await waitForRpc()
		lightwalletd.start()
	} catch (error) {
		console.error('[boot] lightwalletd not started; node RPC never became ready:', error)
	}
}

export async function bootBitcoind(): Promise<void> {
	const settings = await ensureConfig()
	bitcoind.configure(settings)
	bitcoind.start()
	void startLightwalletdWhenReady()
}

export const version = (): BitcoindVersion => bitcoind.versionInfo

export const status = (): BitcoindStatus => ({
	...bitcoind.status(),
	lightwalletdRunning: lightwalletd.status().running,
})

export const start = async (): Promise<BitcoindLifecycleResponse> => {
	if (status().running) return {...status(), result: 'no_op'}
	bitcoind.configure(await getSettings())
	bitcoind.start()
	void startLightwalletdWhenReady()
	return {...status(), result: 'started'}
}

export const stop = async (): Promise<BitcoindLifecycleResponse> => {
	if (!status().running && !lightwalletd.status().running) return {...status(), result: 'no_op'}
	await lightwalletd.stop()
	await bitcoind.stop()
	return {...status(), result: 'stopped'}
}

export const restart = async (): Promise<BitcoindLifecycleResponse> => {
	await lightwalletd.stop()
	bitcoind.configure(await getSettings())
	await bitcoind.restart()
	void startLightwalletdWhenReady()
	return {...status(), result: 'started'}
}

export const exitInfo = (): ExitInfo | null => bitcoind.exitInfo ?? lightwalletd.exitInfo

export const events = () => bitcoind.events

export function wsExitStream(socket: WebSocket) {
	const send = (payload: unknown) => socket.send(JSON.stringify(payload))

	send({
		type: 'snapshot',
		running: bitcoind.status().running,
		exit: bitcoind.exitInfo,
	})

	const handler = (info: ExitInfo) => send({type: 'exit', ...info})

	bitcoind.events.on('exit', handler)
	lightwalletd.events.on('exit', handler)
	socket.on('close', () => {
		bitcoind.events.off('exit', handler)
		lightwalletd.events.off('exit', handler)
	})
}
