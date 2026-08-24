import {execFileSync} from 'node:child_process'
import path from 'node:path'
import fse from 'fs-extra'

import {LIGHTWALLETD_DIR} from '../../lib/paths.js'

const DAY_SECONDS = 86400

export type LightwalletdTlsPaths = {
	certPath: string
	keyPath: string
}

/** True when cert exists, is readable, and is valid for at least `minSeconds` more. */
export function isCertValidFor(certPath: string, minSeconds = DAY_SECONDS): boolean {
	if (!fse.existsSync(certPath)) return false
	try {
		execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-checkend', String(minSeconds)], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		return true
	} catch {
		return false
	}
}

/** Whole days until notAfter (floored). Null if unreadable. */
export function certDaysRemaining(certPath: string): number | null {
	if (!fse.existsSync(certPath)) return null
	try {
		const endDate = execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-enddate'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim()
		const raw = endDate.replace(/^notAfter=/, '')
		const expiresAt = Date.parse(raw)
		if (Number.isNaN(expiresAt)) return null
		return Math.floor((expiresAt - Date.now()) / (DAY_SECONDS * 1000))
	} catch {
		return null
	}
}

function pairIfPresent(certPath: string | undefined, keyPath: string | undefined): LightwalletdTlsPaths | null {
	const cert = certPath?.trim()
	const key = keyPath?.trim()
	if (!cert || !key) return null
	if (!fse.existsSync(cert) || !fse.existsSync(key)) {
		console.error('[lightwalletd-manager] TLS cert or key path is set but the file is missing; serving plaintext')
		return null
	}
	if (!isCertValidFor(cert, DAY_SECONDS)) {
		console.warn('[lightwalletd-manager] TLS cert expires within 24h or is invalid; serving plaintext')
		return null
	}
	return {certPath: cert, keyPath: key}
}

// Vizor (and Zashi) verify TLS with Mozilla webpki roots, not the OS trust
// store. A device-generated cert will always fail. Only use TLS when the
// operator supplies a publicly trusted certificate (Let's Encrypt, Tailscale
// HTTPS, etc.). Otherwise lightwalletd stays plaintext so a TLS terminator
// can sit in front.
export function lightwalletdTlsFiles(): LightwalletdTlsPaths | null {
	const fromEnv = pairIfPresent(process.env['LIGHTWALLETD_TLS_CERT'], process.env['LIGHTWALLETD_TLS_KEY'])
	if (fromEnv) return fromEnv

	// Umbrel exports.sh may have fetched a Tailscale Let's Encrypt pair.
	const fromTailscale = pairIfPresent(
		path.join(LIGHTWALLETD_DIR, 'tls', 'tailscale.crt'),
		path.join(LIGHTWALLETD_DIR, 'tls', 'tailscale.key'),
	)
	if (fromTailscale) {
		console.log('[lightwalletd-manager] using Tailscale TLS cert', fromTailscale.certPath)
		return fromTailscale
	}

	return null
}

export function walletUriScheme(): 'http' | 'https' {
	return lightwalletdTlsFiles() ? 'https' : 'http'
}

export function tailscaleTlsActive(): boolean {
	const certPath = path.join(LIGHTWALLETD_DIR, 'tls', 'tailscale.crt')
	const keyPath = path.join(LIGHTWALLETD_DIR, 'tls', 'tailscale.key')
	return fse.existsSync(keyPath) && isCertValidFor(certPath)
}
