// Mirrors Vizor release URL rules in
// lib/src/core/config/rpc_endpoint_config.dart (normalizeRpcEndpointUrl).
// Release builds require https:// and Mozilla webpki; http:// is only for
// localhost in debug builds.

const LOCAL_HOSTS = new Set(['localhost', '::1', '10.0.2.2'])

export function isLocalHost(host: string): boolean {
	const lower = host.toLowerCase()
	return LOCAL_HOSTS.has(lower) || lower.startsWith('127.')
}

export function normalizeVizorEndpoint(raw: string, opts: {debug?: boolean} = {}): string {
	const trimmed = raw.trim()
	if (!trimmed) throw new Error('Enter an endpoint.')
	if (/\s/.test(trimmed)) throw new Error('Endpoint cannot contain spaces.')

	const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`
	let uri: URL
	try {
		uri = new URL(candidate)
	} catch {
		throw new Error('Enter a valid hostname and port.')
	}
	if (!uri.hostname) throw new Error('Enter a valid hostname and port.')
	if (uri.protocol !== 'https:' && uri.protocol !== 'http:') {
		throw new Error('Use an https:// endpoint.')
	}
	if (uri.protocol === 'http:' && !(opts.debug && isLocalHost(uri.hostname))) {
		throw new Error('Use an https:// endpoint.')
	}

	const port = uri.port ? Number(uri.port) : uri.protocol === 'https:' ? 443 : 80
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		throw new Error('Include a valid port, for example us.zec.stardust.rest:443.')
	}

	return `${uri.protocol}//${formatHost(uri.hostname)}:${port}`
}

export function vizorHostPort(url: string): string {
	const uri = new URL(normalizeVizorEndpoint(url))
	const port = uri.port || (uri.protocol === 'https:' ? '443' : '80')
	return `${formatHost(uri.hostname)}:${port}`
}

function formatHost(host: string): string {
	if (host.includes(':') && !host.startsWith('[')) return `[${host}]`
	return host
}
