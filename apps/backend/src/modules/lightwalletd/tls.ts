import {execFileSync} from 'node:child_process'
import {isIP} from 'node:net'
import path from 'node:path'
import fse from 'fs-extra'

const HOST_PATTERN = /^[A-Za-z0-9._:[\]-]+$/

export type LightwalletdTlsPaths = {
	certPath: string
	keyPath: string
}

type TlsHostsState = {
	hosts: string[]
}

function tlsDir(dataDir: string) {
	return path.join(dataDir, 'tls')
}

function sanitizeHosts(hosts: Array<string | undefined>): string[] {
	const seen = new Set<string>()
	const cleaned: string[] = []
	for (const raw of hosts) {
		const host = raw?.trim().replace(/^\[|\]$/g, '')
		if (!host || !HOST_PATTERN.test(host) || seen.has(host)) continue
		seen.add(host)
		cleaned.push(host)
	}
	return cleaned
}

function opensslConfig(hosts: string[]): string {
	const cn = hosts.find((host) => !isIP(host)) ?? hosts[0] ?? 'localhost'
	const dns: string[] = []
	const ips: string[] = []
	for (const host of hosts) {
		if (isIP(host)) ips.push(host)
		else dns.push(host)
	}

	const altNames = [
		...dns.map((name, i) => `DNS.${i + 1} = ${name}`),
		...ips.map((ip, i) => `IP.${i + 1} = ${ip}`),
	]

	return [
		'[req]',
		'distinguished_name = req_distinguished_name',
		'x509_extensions = v3_req',
		'prompt = no',
		'',
		'[req_distinguished_name]',
		`CN = ${cn}`,
		'',
		'[v3_req]',
		'subjectAltName = @alt_names',
		'keyUsage = digitalSignature, keyEncipherment',
		'extendedKeyUsage = serverAuth',
		'basicConstraints = CA:FALSE',
		'',
		'[alt_names]',
		...altNames,
		'',
	].join('\n')
}

function readHostsState(statePath: string): string[] | null {
	try {
		const state = fse.readJsonSync(statePath) as TlsHostsState
		return Array.isArray(state.hosts) ? state.hosts : null
	} catch {
		return null
	}
}

function hostsMatch(current: string[], previous: string[] | null): boolean {
	if (!previous) return false
	if (current.length !== previous.length) return false
	const expected = [...previous].sort()
	return [...current].sort().every((host, i) => host === expected[i])
}

export function ensureLightwalletdTls(dataDir: string, hosts: Array<string | undefined>): LightwalletdTlsPaths {
	const dir = tlsDir(dataDir)
	const certPath = path.join(dir, 'cert.pem')
	const keyPath = path.join(dir, 'key.pem')
	const statePath = path.join(dir, 'hosts.json')
	const configPath = path.join(dir, 'openssl.cnf')
	const sanHosts = sanitizeHosts(['localhost', '127.0.0.1', '::1', ...hosts])

	fse.ensureDirSync(dir)

	const haveFiles = fse.existsSync(certPath) && fse.existsSync(keyPath)
	if (haveFiles && hostsMatch(sanHosts, readHostsState(statePath))) {
		return {certPath, keyPath}
	}

	fse.writeFileSync(configPath, opensslConfig(sanHosts))

	try {
		execFileSync(
			'openssl',
			[
				'req',
				'-x509',
				'-nodes',
				'-newkey',
				'rsa:2048',
				'-sha256',
				'-days',
				'3650',
				'-keyout',
				keyPath,
				'-out',
				certPath,
				'-config',
				configPath,
			],
			{encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
		)
	} catch (error) {
		const err = error as {stderr?: string; message: string}
		throw new Error(`Failed to create lightwalletd TLS certificate: ${err.stderr?.trim() || err.message}`)
	}

	fse.chmodSync(keyPath, 0o600)
	fse.writeJsonSync(statePath, {hosts: sanHosts} satisfies TlsHostsState)
	console.log('[lightwalletd-manager] wrote TLS cert for', sanHosts.join(', '))
	return {certPath, keyPath}
}
