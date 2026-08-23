import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process'
import {once} from 'node:events'
import path from 'node:path'

import fse from 'fs-extra'

import type {VizorHttpsStatus, VizorHttpsState} from '#types'
import {onLine} from '../../lib/on-line.js'
import {APP_STATE_DIR, VIZOR_HTTPS_DIR} from '../../lib/paths.js'
import {renderCaddyfile} from './caddyfile.js'
import {normalizeVizorEndpoint, vizorHostPort} from './vizor-url.js'

const STATE_FILE = path.join(APP_STATE_DIR, 'vizor-https.json')
const SOCKET = path.join(VIZOR_HTTPS_DIR, 'tailscaled.sock')
const TS_STATE_DIR = path.join(VIZOR_HTTPS_DIR, 'tailscale')
const CERT_FILE = path.join(VIZOR_HTTPS_DIR, 'cert.pem')
const KEY_FILE = path.join(VIZOR_HTTPS_DIR, 'key.pem')
const CADDYFILE = path.join(VIZOR_HTTPS_DIR, 'Caddyfile')
const LISTEN_PORT = process.env['CADDY_HTTPS_PORT'] || '9443'
const CADDY_BIN = process.env['CADDY_BIN'] || 'caddy'
const TAILSCALE_BIN = process.env['TAILSCALE_BIN'] || 'tailscale'
const TAILSCALED_BIN = process.env['TAILSCALED_BIN'] || 'tailscaled'

type Persist = {enabled: boolean}

type TsStatus = {
	BackendState?: string
	AuthURL?: string
	Self?: {DNSName?: string}
}

function childEnv(): NodeJS.ProcessEnv {
	return {
		...process.env,
		HOME: VIZOR_HTTPS_DIR,
		PATH: `/usr/local/bin:/home/ubuntu/bin:${process.env['PATH'] ?? '/usr/bin'}`,
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripDot(name: string): string {
	return name.endsWith('.') ? name.slice(0, -1) : name
}

function loginUrlFromText(text: string): string | undefined {
	return text.match(/https:\/\/login\.tailscale\.com\/[^\s]+/)?.[0]
}

export class VizorHttpsManager {
	private enabled = false
	private state: VizorHttpsState = 'off'
	private loginUrl?: string
	private host?: string
	private error?: string
	private exposure?: 'funnel' | 'tailnet'
	private tailscaled: ChildProcessWithoutNullStreams | null = null
	private caddy: ChildProcessWithoutNullStreams | null = null
	private upChild: ChildProcessWithoutNullStreams | null = null
	private pump: NodeJS.Timeout | null = null
	private ticking = false
	private lastProxyKey = ''
	private lastServeKey = ''
	private lastCertKey = ''

	status(): VizorHttpsStatus {
		const port = '443'
		const uri = this.host ? `https://${this.host}:${port}` : undefined
		return {
			enabled: this.enabled,
			state: this.state,
			loginUrl: this.loginUrl,
			host: this.host,
			port: this.host ? port : undefined,
			uri,
			hostPort: uri ? vizorHostPort(uri) : undefined,
			exposure: this.exposure,
			error: this.error,
		}
	}

	async restore(): Promise<void> {
		await fse.ensureDir(VIZOR_HTTPS_DIR)
		const persist = await this.readPersist()
		if (persist.enabled) await this.setEnabled(true)
	}

	async setEnabled(enabled: boolean): Promise<VizorHttpsStatus> {
		this.enabled = enabled
		await this.writePersist({enabled})
		if (!enabled) {
			await this.shutdownProcesses()
			this.resetRuntime()
			this.state = 'off'
			return this.status()
		}
		this.state = 'starting'
		this.error = undefined
		this.ensurePump()
		void this.tick().catch((err) => this.fail(err))
		return this.status()
	}

	async stop(): Promise<void> {
		this.enabled = false
		await this.shutdownProcesses()
		this.resetRuntime()
		this.state = 'off'
	}

	private resetRuntime(): void {
		this.loginUrl = undefined
		this.host = undefined
		this.error = undefined
		this.exposure = undefined
		this.lastProxyKey = ''
		this.lastServeKey = ''
		this.lastCertKey = ''
	}

	private fail(err: unknown): void {
		const message = err instanceof Error ? err.message : String(err)
		console.error('[vizor-https]', message)
		this.state = 'error'
		this.error = message
	}

	private async readPersist(): Promise<Persist> {
		try {
			const raw = (await fse.readJson(STATE_FILE)) as Persist
			return {enabled: Boolean(raw.enabled)}
		} catch {
			return {enabled: false}
		}
	}

	private async writePersist(persist: Persist): Promise<void> {
		await fse.ensureDir(APP_STATE_DIR)
		await fse.writeJson(STATE_FILE, persist)
	}

	private ensurePump(): void {
		if (this.pump) return
		this.pump = setInterval(() => {
			void this.tick().catch((err) => this.fail(err))
		}, 2_000)
	}

	private stopPump(): void {
		if (this.pump) clearInterval(this.pump)
		this.pump = null
	}

	private async tick(): Promise<void> {
		if (!this.enabled || this.ticking) return
		this.ticking = true
		try {
			await fse.ensureDir(TS_STATE_DIR)
			await this.ensureTailscaled()

			let ts = await this.tsStatus()
			if (ts.AuthURL) this.loginUrl = ts.AuthURL
			if ((ts.BackendState ?? '') !== 'Running') this.ensureUp()
			ts = await this.tsStatus()
			if (ts.AuthURL) this.loginUrl = ts.AuthURL
			const backend = ts.BackendState ?? ''

			if (backend === 'NeedsLogin' || backend === 'NoState' || backend === '') {
				this.state = 'needs_login'
				return
			}
			if (backend !== 'Running') {
				this.state = 'starting'
				return
			}

			const dns = stripDot(ts.Self?.DNSName ?? '')
			if (!dns) {
				this.state = 'starting'
				return
			}

			if (this.state === 'ready' && this.lastServeKey === dns && this.caddy && this.tailscaled) {
				return
			}

			this.host = dns
			this.loginUrl = undefined
			await this.ensureCert(dns)
			await this.ensureCaddy()
			await this.ensureServe(dns)
			normalizeVizorEndpoint(`${dns}:443`)
			this.state = 'ready'
			this.error = undefined
		} finally {
			this.ticking = false
		}
	}

	private async ensureTailscaled(): Promise<void> {
		if (this.tailscaled) return
		await fse.ensureDir(TS_STATE_DIR)
		await fse.remove(SOCKET).catch(() => undefined)
		console.log('[vizor-https] starting tailscaled (userspace)')
		this.tailscaled = spawn(
			TAILSCALED_BIN,
			['--tun=userspace-networking', `--statedir=${TS_STATE_DIR}`, `--socket=${SOCKET}`, '--verbose=1'],
			{env: childEnv(), stdio: ['pipe', 'pipe', 'pipe']},
		) as ChildProcessWithoutNullStreams
		onLine(this.tailscaled.stdout, (line) => console.log('[tailscaled]', line), 'tailscaled')
		onLine(this.tailscaled.stderr, (line) => console.error('[tailscaled]', line), 'tailscaled')
		this.tailscaled.on('exit', (code, sig) => {
			console.error(`[tailscaled] exited code=${code} sig=${sig}`)
			this.tailscaled = null
			if (this.enabled) this.state = 'starting'
		})
		this.tailscaled.on('error', (err) => {
			const code = (err as NodeJS.ErrnoException).code
			this.fail(
				code === 'ENOENT'
					? new Error('tailscaled is not installed. Rebuild the app image; it now includes Tailscale and Caddy.')
					: err,
			)
		})
		const start = Date.now()
		while (Date.now() - start < 10_000) {
			if (await fse.pathExists(SOCKET)) return
			await sleep(100)
		}
		throw new Error('tailscaled did not create its socket. Is the Tailscale binary installed?')
	}

	private ensureUp(): void {
		if (this.upChild) return
		const args = ['--socket', SOCKET, 'up', '--reset', '--accept-dns=false', `--hostname=${this.hostname()}`]
		const auth = process.env['TS_AUTHKEY']?.trim()
		if (auth) args.push('--auth-key', auth)
		this.upChild = spawn(TAILSCALE_BIN, args, {env: childEnv(), stdio: ['pipe', 'pipe', 'pipe']}) as ChildProcessWithoutNullStreams
		const collect = (line: string) => {
			console.log('[tailscale-up]', line)
			const url = loginUrlFromText(line)
			if (url) this.loginUrl = url
		}
		onLine(this.upChild.stdout, collect, 'tailscale-up')
		onLine(this.upChild.stderr, collect, 'tailscale-up')
		this.upChild.on('exit', () => {
			this.upChild = null
		})
		this.upChild.on('error', (err) => this.fail(err))
	}

	private hostname(): string {
		const raw = process.env['VIZOR_TAILSCALE_HOSTNAME'] || process.env['DEVICE_DOMAIN_NAME'] || 'zcash-node'
		return raw.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'zcash-node'
	}

	private async tsStatus(): Promise<TsStatus> {
		const result = await this.ts(['status', '--json'])
		if (result.code !== 0) {
			const url = loginUrlFromText(`${result.stdout}\n${result.stderr}`)
			if (url) this.loginUrl = url
			return {BackendState: 'NeedsLogin', AuthURL: url}
		}
		try {
			return JSON.parse(result.stdout) as TsStatus
		} catch {
			return {BackendState: 'NoState'}
		}
	}

	private async ensureCert(domain: string): Promise<void> {
		if (this.lastCertKey === domain && (await fse.pathExists(CERT_FILE)) && (await fse.pathExists(KEY_FILE))) {
			return
		}
		this.state = 'issuing_cert'
		const result = await this.ts(['cert', '--cert-file', CERT_FILE, '--key-file', KEY_FILE, domain], 60_000)
		if (result.code !== 0) {
			throw new Error(
				result.stderr.trim() ||
					result.stdout.trim() ||
					'Tailscale HTTPS certificates are not available. Enable HTTPS Certificates in the Tailscale admin console.',
			)
		}
		this.lastCertKey = domain
	}

	private async ensureCaddy(): Promise<void> {
		const lwdPort = process.env['WALLET_PORT'] || '9067'
		const key = `${CERT_FILE}:${lwdPort}:${LISTEN_PORT}`
		if (this.caddy && this.lastProxyKey === key) return
		await this.stopCaddy()
		await fse.writeFile(
			CADDYFILE,
			renderCaddyfile({listenPort: LISTEN_PORT, certPath: CERT_FILE, keyPath: KEY_FILE, lwdPort}),
		)
		console.log(`[vizor-https] starting caddy on 127.0.0.1:${LISTEN_PORT}`)
		this.caddy = spawn(CADDY_BIN, ['run', '--config', CADDYFILE, '--adapter', 'caddyfile'], {
			env: childEnv(),
			stdio: ['pipe', 'pipe', 'pipe'],
		}) as ChildProcessWithoutNullStreams
		onLine(this.caddy.stdout, (line) => console.log('[caddy]', line), 'caddy')
		onLine(this.caddy.stderr, (line) => console.error('[caddy]', line), 'caddy')
		this.caddy.on('exit', (code, sig) => {
			console.error(`[caddy] exited code=${code} sig=${sig}`)
			this.caddy = null
			this.lastProxyKey = ''
		})
		this.caddy.on('error', (err) => {
			const code = (err as NodeJS.ErrnoException).code
			this.fail(
				code === 'ENOENT'
					? new Error('caddy is not installed. Rebuild the app image; it now includes Tailscale and Caddy.')
					: err,
			)
		})
		this.lastProxyKey = key
		await sleep(400)
	}

	private async ensureServe(domain: string): Promise<void> {
		if (this.lastServeKey === domain) return
		const target = `tcp://127.0.0.1:${LISTEN_PORT}`
		await this.ts(['serve', 'reset', '--yes']).catch(() => undefined)
		const funnel = await this.ts(['funnel', '--bg', '--yes', '--tcp', '443', target])
		if (funnel.code === 0) {
			this.exposure = 'funnel'
			this.lastServeKey = domain
			return
		}
		const serve = await this.ts(['serve', '--bg', '--yes', '--tcp', '443', target])
		if (serve.code !== 0) {
			throw new Error(
				funnel.stderr.trim() ||
					serve.stderr.trim() ||
					'Could not publish port 443 on Tailscale. Enable Funnel or Serve in the Tailscale admin console.',
			)
		}
		this.exposure = 'tailnet'
		this.lastServeKey = domain
	}

	private async ts(args: string[], timeoutMs = 20_000): Promise<{stdout: string; stderr: string; code: number}> {
		return new Promise((resolve) => {
			const child = spawn(TAILSCALE_BIN, ['--socket', SOCKET, ...args], {
				env: childEnv(),
				stdio: ['ignore', 'pipe', 'pipe'],
			})
			let stdout = ''
			let stderr = ''
			child.stdout?.on('data', (chunk: Buffer) => {
				stdout += chunk.toString()
			})
			child.stderr?.on('data', (chunk: Buffer) => {
				stderr += chunk.toString()
			})
			const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
			child.on('close', (code) => {
				clearTimeout(timer)
				resolve({stdout, stderr, code: code ?? 1})
			})
			child.on('error', (err) => {
				clearTimeout(timer)
				resolve({stdout, stderr: err.message, code: 1})
			})
		})
	}

	private async stopCaddy(): Promise<void> {
		if (!this.caddy) return
		const child = this.caddy
		this.caddy = null
		child.kill('SIGTERM')
		await Promise.race([once(child, 'exit'), sleep(3000)])
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
	}

	private async shutdownProcesses(): Promise<void> {
		this.stopPump()
		await this.stopCaddy()
		if (this.upChild) {
			this.upChild.kill('SIGTERM')
			this.upChild = null
		}
		if (this.tailscaled) {
			const child = this.tailscaled
			this.tailscaled = null
			child.kill('SIGTERM')
			await Promise.race([once(child, 'exit'), sleep(3000)])
			if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
		}
	}
}

export const vizorHttps = new VizorHttpsManager()
