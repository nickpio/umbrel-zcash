import type {ConnectionDetails} from '#types'

export async function getConnectionDetails(): Promise<ConnectionDetails> {
	const localHost = process.env['DEVICE_DOMAIN_NAME'] ?? '127.0.0.1'

	const p2pPort = process.env['P2P_PORT'] ?? '8233'
	const p2pTorHost = process.env['P2P_HIDDEN_SERVICE'] ?? 'somehiddenservice.onion'

	const rpcPort = process.env['RPC_PORT'] ?? '8232'
	const rpcTorHost = process.env['RPC_HIDDEN_SERVICE'] ?? 'someotherhiddenservice.onion'
	const rpcUser = process.env['RPC_USER'] ?? ''
	const rpcPassword = process.env['RPC_PASS'] ?? ''

	const walletPort = process.env['WALLET_PORT'] ?? '9067'
	const walletTorHost = process.env['WALLET_HIDDEN_SERVICE'] ?? 'wallethidden.onion'

	return {
		wallet: {
			tor: {
				host: walletTorHost,
				port: walletPort,
				uri: `http://${walletTorHost}:${walletPort}`,
			},
			local: {
				host: localHost,
				port: walletPort,
				uri: `http://${localHost}:${walletPort}`,
			},
		},
		p2p: {
			tor: {
				host: p2pTorHost,
				port: p2pPort,
				uri: `${p2pTorHost}:${p2pPort}`,
			},
			local: {
				host: localHost,
				port: p2pPort,
				uri: `${localHost}:${p2pPort}`,
			},
		},
		rpc: {
			tor: {
				host: rpcTorHost,
				port: rpcPort,
				username: rpcUser,
				password: rpcPassword,
				uri: `http://${rpcTorHost}:${rpcPort}`,
			},
			local: {
				host: localHost,
				port: rpcPort,
				username: rpcUser,
				password: rpcPassword,
				uri: `http://${localHost}:${rpcPort}`,
			},
		},
	}
}
