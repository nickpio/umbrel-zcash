import {spawn, ChildProcessWithoutNullStreams} from 'node:child_process'
import {EventEmitter} from 'node:events'

import type {ExitInfo} from '#types'
import {onLine} from '../../lib/on-line.js'
import {LIGHTWALLETD_BIN, LIGHTWALLETD_DIR, ZCASH_CONF} from '../../lib/paths.js'

type LightwalletdManagerOptions = {
	binary?: string
	dataDir?: string
	zcashConf?: string
}

export class LightwalletdManager {
	private child: ChildProcessWithoutNullStreams | null = null
	private readonly bin: string
	private readonly dataDir: string
	private readonly zcashConf: string
	private startedAt: number | null = null
	private lastError: Error | null = null
	public exitInfo: ExitInfo | null = null

	private readonly logRing: string[] = []
	private readonly RING_MAX = 200

	public readonly events = new EventEmitter()
	private expectingExit = false

	constructor({
		binary = LIGHTWALLETD_BIN,
		dataDir = LIGHTWALLETD_DIR,
		zcashConf = ZCASH_CONF,
	}: LightwalletdManagerOptions = {}) {
		this.bin = binary
		this.dataDir = dataDir
		this.zcashConf = zcashConf
	}

	private handleLine(line: string, isStderr: boolean) {
		const prefix = '[lightwalletd]'
		void (isStderr ? console.error(prefix, line) : console.log(prefix, line))
		if (this.logRing.push(line) > this.RING_MAX) this.logRing.shift()
	}

	start() {
		if (this.child) return

		const grpcPort = process.env['WALLET_PORT'] || '9067'
		const rpcHost = process.env['ZEBRAD_RPC_HOST'] || '127.0.0.1'
		const rpcPort = process.env['RPC_PORT'] || '8232'
		this.logRing.length = 0
		this.startedAt = Date.now()

		this.child = spawn(
			this.bin,
			[
				'--grpc-bind-addr',
				`0.0.0.0:${grpcPort}`,
				'--no-tls-very-insecure',
				'--grpc-logging-insecure',
				'--zcash-conf-path',
				this.zcashConf,
				'--data-dir',
				this.dataDir,
				'--log-file',
				`${this.dataDir}/lightwalletd.log`,
				'--rpchost',
				rpcHost,
				'--rpcport',
				rpcPort,
			],
			{stdio: ['pipe', 'pipe', 'pipe']},
		) as ChildProcessWithoutNullStreams

		this.lastError = null
		console.log('[lightwalletd-manager] spawned PID', this.child.pid)
		this.events.emit('start')

		onLine(this.child.stdout, (line) => this.handleLine(line, false), 'lightwalletd-manager')
		onLine(this.child.stderr, (line) => this.handleLine(line, true), 'lightwalletd-manager')

		this.child.on('exit', (code, sig) => {
			console.error(`[lightwalletd] exited (code=${code}, sig=${sig})`)
			if (this.expectingExit) {
				this.child = null
				return
			}
			this.exitInfo = {
				code,
				sig,
				logTail: [...this.logRing],
				message: `lightwalletd stopped (code ${code ?? 'null'})`,
			}
			this.events.emit('exit', this.exitInfo)
			this.child = null
		})

		this.child.on('error', (err) => {
			console.error('[lightwalletd-manager] failed to spawn:', err)
			this.lastError = err
			this.exitInfo = {
				code: null,
				sig: null,
				logTail: [err.message],
				message: `Failed to start lightwalletd: ${err.message}`,
			}
			this.events.emit('exit', this.exitInfo)
		})
	}

	async stop() {
		if (!this.child) return
		this.events.emit('stop')
		this.expectingExit = true
		this.child.kill('SIGTERM')
		await new Promise((res) => this.child?.once('exit', res))
		this.expectingExit = false
		this.child = null
		this.startedAt = null
	}

	status() {
		return {running: !!this.child, startedAt: this.startedAt, error: this.lastError, pid: this.child?.pid ?? null}
	}
}
