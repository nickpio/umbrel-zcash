import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'

import {ZebradManager} from './manager.ts'
import {LightwalletdManager} from '../lightwalletd/manager.ts'

const MISSING_BIN = '/nonexistent/definitely-not-a-real-binary'

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timer: NodeJS.Timeout
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms)
	})
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

for (const [name, create] of [
	['ZebradManager', () => new ZebradManager({binary: MISSING_BIN, configPath: '/nonexistent/zebrad.toml'})],
	['LightwalletdManager', () => new LightwalletdManager({binary: MISSING_BIN, dataDir: '/nonexistent/lwd'})],
] as const) {
	describe(`${name} with a binary that fails to spawn`, () => {
		it('reports running:false and records exit info once the spawn error fires', async () => {
			const manager = create()
			const exited = once(manager.events, 'exit')
			manager.start()
			const [info] = await withTimeout(exited, 2000, 'exit event')

			assert.equal(manager.status().running, false)
			assert.equal(manager.status().pid, null)
			assert.equal(manager.status().startedAt, null)
			assert.match((info as {message: string}).message, /Failed to start/)
			assert.equal(manager.exitInfo, info)
		})

		it('stop() resolves after a failed spawn instead of hanging', async () => {
			const manager = create()
			manager.start()
			await once(manager.events, 'exit')

			await withTimeout(manager.stop(), 2000, 'stop() after spawn failure')
		})

		it('stop() resolves even when called before the spawn error has fired', async () => {
			const manager = create()
			manager.start()

			await withTimeout(manager.stop(), 2000, 'stop() during spawn failure')
			assert.equal(manager.status().running, false)
		})

		it('can retry start() after a failed spawn', async () => {
			const manager = create()
			manager.start()
			await once(manager.events, 'exit')

			let starts = 0
			manager.events.on('start', () => (starts += 1))
			manager.start()
			await once(manager.events, 'exit')

			assert.equal(starts, 1)
		})
	})
}
