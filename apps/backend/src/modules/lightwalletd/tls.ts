import fse from 'fs-extra'

export type LightwalletdTlsPaths = {
	certPath: string
	keyPath: string
}

// Vizor (and Zashi) verify TLS with Mozilla webpki roots, not the OS trust
// store. A device-generated cert will always fail. Only use TLS when the
// operator supplies a publicly trusted certificate (Let's Encrypt, Tailscale
// HTTPS, etc.). Otherwise lightwalletd stays plaintext so a TLS terminator
// can sit in front.
export function lightwalletdTlsFiles(): LightwalletdTlsPaths | null {
	const certPath = process.env['LIGHTWALLETD_TLS_CERT']?.trim()
	const keyPath = process.env['LIGHTWALLETD_TLS_KEY']?.trim()
	if (!certPath || !keyPath) return null
	if (!fse.existsSync(certPath) || !fse.existsSync(keyPath)) {
		console.error('[lightwalletd-manager] LIGHTWALLETD_TLS_CERT or LIGHTWALLETD_TLS_KEY is set but the file is missing; serving plaintext')
		return null
	}
	return {certPath, keyPath}
}

export function walletUriScheme(): 'http' | 'https' {
	return lightwalletdTlsFiles() ? 'https' : 'http'
}
