import {spawn, ChildProcessWithoutNullStreams, execFileSync} from 'node:child_process'
import {EventEmitter} from 'node:events'

import type {ExitInfo} from '#types'
import {
	implementationForVersion,
	implementationLabel,
	normalizeSelectedVersion,
	resolveVersion,
	type SettingsSchema,
} from '#settings'
import {onLine} from '../../lib/on-line.js'
import {ZEBRAD_BIN, ZAKURAD_BIN, ZEBRAD_TOML} from '../../lib/paths.js'

type ZebradManagerOptions = {
	binary?: string
	configPath?: string
	extraArgs?: string[]
}

// zakurad/zebrad map PREFIX_field env vars onto config. Path vars used by this
// process (`ZAKURA_DIR`, `ZEBRA_DIR`) would become unknown field `dir`.
function envForNodeSpawn(): NodeJS.ProcessEnv {
	const env = {...process.env}
	delete env['ZAKURA_DIR']
	delete env['ZEBRA_DIR']
	return env
}

export class ZebradManager {
	private child: ChildProcessWithoutNullStreams | null = null
	private bin: string
	private readonly configPath: string
	private extraArgs: string[]
	private implLabel = 'Zebra'
	public versionInfo: {implementation: string; version: string}
	private startedAt: number | null = null
	private lastError: Error | null = null
	public exitInfo: ExitInfo | null = null

	private readonly logRing: string[] = []
	private readonly RING_MAX = 200
	private recordLine = (line: string) => {
		if (this.logRing.push(line) > this.RING_MAX) this.logRing.shift()
	}

	private handleLine(line: string, isStderr: boolean) {
		const prefix = `[${this.implLabel.toLowerCase()}]`
		void (isStderr ? console.error(prefix, line) : console.log(prefix, line))
		this.recordLine(line)
	}

	public readonly events = new EventEmitter()
	private expectingExit = false

	constructor({binary = ZEBRAD_BIN, configPath = ZEBRAD_TOML, extraArgs = []}: ZebradManagerOptions = {}) {
		this.bin = binary
		this.configPath = configPath
		this.extraArgs = extraArgs
		this.versionInfo = this.getBinaryVersionInfo()
	}

	configure(settings: SettingsSchema) {
		const version = resolveVersion(normalizeSelectedVersion((settings as {version?: unknown}).version))
		const impl = implementationForVersion(version)
		this.implLabel = implementationLabel(version)
		this.bin = impl === 'zakura' ? ZAKURAD_BIN : ZEBRAD_BIN

		const envKey = impl === 'zakura' ? 'ZAKURAD_EXTRA_ARGS' : 'ZEBRAD_EXTRA_ARGS'
		const envArgs = (process.env[envKey] ?? '')
			.trim()
			.split(',')
			.map((arg) => arg.trim())
			.filter(Boolean)

		this.extraArgs = envArgs
		this.versionInfo = this.getBinaryVersionInfo()
	}

	setLastError(err: Error): void {
		this.lastError = err
	}

	private getBinaryVersionInfo(binary = this.bin) {
		try {
			const firstLine = execFileSync(binary, ['--version']).toString().split('\n')[0]
			const version = (firstLine.match(/v?\d+\.\d+\.\d+[\w.-]*/) ?? ['unknown'])[0]
			return {implementation: this.implLabel, version: version.startsWith('v') ? version : `v${version}`}
		} catch {
			return {implementation: this.implLabel, version: 'unknown'}
		}
	}

	start() {
		if (this.child) return

		this.logRing.length = 0
		this.startedAt = Date.now()
		this.versionInfo = this.getBinaryVersionInfo()

		this.child = spawn(this.bin, ['--config', this.configPath, 'start', ...this.extraArgs], {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: envForNodeSpawn(),
		}) as ChildProcessWithoutNullStreams

		this.lastError = null
		console.log(`[${this.implLabel.toLowerCase()}-manager] spawned PID`, this.child.pid)

		this.events.emit('start')

		onLine(this.child.stdout, (line) => this.handleLine(line, false), `${this.implLabel.toLowerCase()}-manager`)
		onLine(this.child.stderr, (line) => this.handleLine(line, true), `${this.implLabel.toLowerCase()}-manager`)

		this.child.on('exit', (code, sig) => {
			console.error(`[${this.implLabel.toLowerCase()}] exited (code=${code}, sig=${sig})`)

			if (this.expectingExit) {
				this.child = null
				return
			}

			this.exitInfo = {
				code,
				sig,
				logTail: [...this.logRing],
				message: `${this.implLabel} stopped (code ${code ?? 'null'})`,
			}

			this.events.emit('exit', this.exitInfo)
			this.child = null
		})

		this.child.on('error', (err) => {
			console.error(`[${this.implLabel.toLowerCase()}-manager] failed to spawn:`, err)
			this.lastError = err
			this.exitInfo = {
				code: null,
				sig: null,
				logTail: [err.message],
				message: `Failed to start ${this.implLabel}: ${err.message}`,
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

	async restart() {
		await this.stop()
		this.start()
	}

	status() {
		return {running: !!this.child, startedAt: this.startedAt, error: this.lastError, pid: this.child?.pid ?? null}
	}
}
