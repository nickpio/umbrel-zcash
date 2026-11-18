import path from 'node:path'

import type {ConnectionDetails} from '#types'
import {LIGHTWALLETD_DIR} from '../../lib/paths.js'
import {certDaysRemaining, tailscaleTlsActive, walletUriScheme} from '../lightwalletd/tls.js'

export async function getConnectionDetails(): Promise<ConnectionDetails> {
	const localHost = process.env['DEVICE_DOMAIN_NAME'] ?? '127.0.0.1'
	const walletScheme = walletUriScheme()

	const p2pPort = process.env['P2P_PORT'] ?? '8233'

	const rpcPort = process.env['RPC_PORT'] ?? '8232'

	const walletPort = process.env['WALLET_PORT'] ?? '9067'
	const tailscaleHost = process.env['TAILSCALE_HOSTNAME']?.trim().replace(/\.$/, '') || undefined
	const usingTailscaleTls = tailscaleTlsActive()
	const tailscaleCertPath = path.join(LIGHTWALLETD_DIR, 'tls', 'tailscale.crt')

	const details: ConnectionDetails = {
		wallet: {
			local: {
				host: localHost,
				port: walletPort,
				uri: `${walletScheme}://${localHost}:${walletPort}`,
			},
		},
		tailscaleTls: usingTailscaleTls,
		tailscaleCertDaysRemaining: usingTailscaleTls ? certDaysRemaining(tailscaleCertPath) : null,
		p2p: {
			local: {
				host: localHost,
				port: p2pPort,
				uri: `${localHost}:${p2pPort}`,
			},
		},
		rpc: {
			local: {
				host: localHost,
				port: rpcPort,
				uri: `http://${localHost}:${rpcPort}`,
			},
		},
	}

	if (tailscaleHost && usingTailscaleTls) {
		details.wallet.tailscale = {
			host: tailscaleHost,
			port: walletPort,
			uri: `https://${tailscaleHost}:${walletPort}`,
		}
	}

	return details
}
