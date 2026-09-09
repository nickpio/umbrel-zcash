import {app, BrowserWindow} from 'electron'
import {spawn, type ChildProcess} from 'node:child_process'
import {createServer} from 'node:net'
import path from 'node:path'
import os from 'node:os'

const HEADLESS = process.argv.includes('--headless')
const STOP_TIMEOUT_MS = 10 * 60 * 1000
const READY_TIMEOUT_MS = 60_000

if (HEADLESS) {
	app.commandLine.appendSwitch('headless')
	app.commandLine.appendSwitch('ozone-platform', 'headless')
	app.disableHardwareAcceleration()
}

let mainWindow: BrowserWindow | null = null
let backend: ChildProcess | null = null
let stopping = false

function packagedResource(...parts: string[]) {
	return path.join(process.resourcesPath, ...parts)
}

function dataRoot() {
	return process.env['ZCASH_NODE_DATA'] || path.join(os.homedir(), '.local/share/zcash-node')
}

function findFreePort(preferred: number): Promise<number> {
	return new Promise((resolve, reject) => {
		const tryPort = (port: number) => {
			const server = createServer()
			server.unref()
			server.once('error', (error: NodeJS.ErrnoException) => {
				if (error.code === 'EADDRINUSE' && port < preferred + 100) {
					tryPort(port + 1)
					return
				}
				reject(error)
			})
			server.listen(port, '127.0.0.1', () => {
				const address = server.address()
				server.close((closeError) => {
					if (closeError) {
						reject(closeError)
						return
					}
					if (!address || typeof address === 'string') {
						reject(new Error('Could not determine a free HTTP port'))
						return
					}
					resolve(address.port)
				})
			})
		}
		tryPort(preferred)
	})
}

async function waitForHttp(url: string, timeoutMs: number) {
	const started = Date.now()
	let lastError: unknown
	while (Date.now() - started < timeoutMs) {
		try {
			const response = await fetch(url)
			if (response.ok || response.status === 404) return
			lastError = new Error(`HTTP ${response.status}`)
		} catch (error) {
			lastError = error
		}
		await new Promise((resolve) => setTimeout(resolve, 200))
	}
	throw new Error(`Backend did not become ready at ${url}: ${String(lastError)}`)
}

function spawnBackend(port: number) {
	const runtimeDir = packagedResource('app-runtime')
	const binDir = packagedResource('bin')
	const serverJs = path.join(runtimeDir, 'dist', 'server.js')

	const child = spawn(process.execPath, [serverJs], {
		cwd: runtimeDir,
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: '1',
			NODE_ENV: 'production',
			HTTP_HOST: '127.0.0.1',
			HTTP_PORT: String(port),
			DATA_ROOT: dataRoot(),
			ZEBRAD_BIN: path.join(binDir, 'zebrad'),
			ZAKURAD_BIN: path.join(binDir, 'zakurad'),
			LIGHTWALLETD_BIN: path.join(binDir, 'lightwalletd'),
			DEVICE_DOMAIN_NAME: process.env['DEVICE_DOMAIN_NAME'] || '127.0.0.1',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	})

	child.stdout?.pipe(process.stdout)
	child.stderr?.pipe(process.stderr)

	child.once('exit', (code, signal) => {
		if (stopping) return
		console.error(`Backend exited unexpectedly (code=${code} signal=${signal})`)
		app.exit(code ?? 1)
	})

	return child
}

function waitForExit(child: ChildProcess, timeoutMs: number) {
	return new Promise<void>((resolve) => {
		if (child.exitCode !== null || child.signalCode) {
			resolve()
			return
		}
		const timer = setTimeout(() => resolve(), timeoutMs)
		child.once('exit', () => {
			clearTimeout(timer)
			resolve()
		})
	})
}

async function stopBackend() {
	if (stopping || !backend) return
	stopping = true
	const child = backend
	if (child.exitCode === null && !child.signalCode) {
		child.kill('SIGTERM')
		await waitForExit(child, STOP_TIMEOUT_MS)
		if (child.exitCode === null && !child.signalCode) {
			console.error('Backend did not exit after SIGTERM; sending SIGKILL')
			child.kill('SIGKILL')
			await waitForExit(child, 5_000)
		}
	}
}

function createWindow(port: number) {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 900,
		minHeight: 600,
		title: 'Zcash Node',
		autoHideMenuBar: true,
		icon: app.isPackaged
			? path.join(process.resourcesPath, 'icon.png')
			: path.join(__dirname, '..', 'resources', 'icon.png'),
		webPreferences: {
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
	})
	mainWindow.on('closed', () => {
		mainWindow = null
	})
	void mainWindow.loadURL(`http://127.0.0.1:${port}/`)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
	app.quit()
} else {
	app.on('second-instance', () => {
		if (!mainWindow) return
		if (mainWindow.isMinimized()) mainWindow.restore()
		mainWindow.focus()
	})

	app.on('window-all-closed', () => {
		if (!HEADLESS) app.quit()
	})

	app.on('before-quit', (event) => {
		if (!backend || stopping) return
		event.preventDefault()
		void stopBackend().finally(() => app.quit())
	})

	void app
		.whenReady()
		.then(async () => {
			if (!app.isPackaged) {
				if (HEADLESS) {
					console.log('Dev --headless has no packaged backend; start npm run dev instead')
					app.quit()
					return
				}
				createWindow(5173)
				return
			}

			const port = await findFreePort(Number(process.env['HTTP_PORT'] || 3000))
			backend = spawnBackend(port)
			const url = `http://127.0.0.1:${port}/api/bitcoind/status`
			await waitForHttp(url, READY_TIMEOUT_MS)
			console.log(`Zcash Node backend is ready at http://127.0.0.1:${port}/`)
			if (!HEADLESS) createWindow(port)
		})
		.catch((error) => {
			console.error(error)
			app.exit(1)
		})
}
