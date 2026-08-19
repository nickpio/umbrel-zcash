const host = process.env['BITCOIND_IP'] || process.env['ZEBRAD_IP'] || '127.0.0.1'
const port = process.env['RPC_PORT'] || '8232'
const url = `http://${host}:${port}/`

let nextId = 0

export const rpcClient = {
	async command<T = unknown>(method: string, ...params: unknown[]): Promise<T> {
		const res = await fetch(url, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({jsonrpc: '1.0', method, params, id: nextId++}),
			signal: AbortSignal.timeout(30_000),
		})

		if (!res.ok && !res.headers.get('content-type')?.includes('application/json')) {
			const text = await res.text()
			throw new Error(`RPC ${method}: HTTP ${res.status} ${text}`.trim())
		}

		let json: {result: T; error: {code: number; message: string} | null}
		try {
			json = await res.json()
		} catch {
			throw new Error(`RPC ${method}: invalid JSON response (HTTP ${res.status})`)
		}

		if (json.error) {
			throw new Error(`RPC ${method}: ${json.error.message} (code ${json.error.code})`)
		}

		return json.result
	},
}

export async function waitForRpc(timeoutMs = 180_000, pollMs = 1_000): Promise<void> {
	const started = Date.now()
	while (Date.now() - started < timeoutMs) {
		try {
			await rpcClient.command('getblockchaininfo')
			return
		} catch {
			await new Promise((resolve) => setTimeout(resolve, pollMs))
		}
	}
	throw new Error(`Zebra RPC at ${url} did not become ready within ${timeoutMs}ms`)
}
