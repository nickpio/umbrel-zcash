import {rpcClient} from '../bitcoind/rpc-client.js'

import {ipToLatLng} from './ip-to-location.js'

import type {PeerInfo, PeerCount, PeerLocation, PeerLocationsResponse} from '#types'

function inferNetwork(peer: {network?: string; addr?: string}): string {
	if (peer.network) return peer.network
	const addr = peer.addr ?? ''
	if (addr.includes('.onion')) return 'onion'
	if (addr.startsWith('[') || (addr.match(/:/g) ?? []).length > 1) return 'ipv6'
	return 'ipv4'
}

function normalizePeer(p: Record<string, unknown>, index: number): PeerInfo {
	const addr = String(p['addr'] ?? '')
	return {
		id: typeof p['id'] === 'number' ? p['id'] : index,
		addr,
		addrlocal: typeof p['addrlocal'] === 'string' ? p['addrlocal'] : undefined,
		network: inferNetwork({network: typeof p['network'] === 'string' ? p['network'] : undefined, addr}),
		relaytxes: typeof p['relaytxes'] === 'boolean' ? p['relaytxes'] : true,
		lastsend: Number(p['lastsend'] ?? 0),
		lastrecv: Number(p['lastrecv'] ?? 0),
		bytessent: Number(p['bytessent'] ?? 0),
		bytesrecv: Number(p['bytesrecv'] ?? 0),
		conntime: Number(p['conntime'] ?? 0),
		pingtime: Number(p['pingtime'] ?? 0),
		pingwait: Number(p['pingwait'] ?? 0),
		version: Number(p['version'] ?? 0),
		subver: String(p['subver'] ?? ''),
		inbound: Boolean(p['inbound']),
	}
}

const getPeerInfoRPC = async (): Promise<PeerInfo[]> => {
	const raw = await rpcClient.command<Record<string, unknown>[]>('getpeerinfo')
	return (raw ?? []).map((peer, index) => normalizePeer(peer, index))
}

export async function peerInfo(): Promise<PeerInfo[]> {
	return getPeerInfoRPC()
}

export async function peerCount(): Promise<PeerCount> {
	const peers = await getPeerInfoRPC()
	const summary: PeerCount = {total: peers.length, byNetwork: {}}

	for (const p of peers) {
		const bucket = (summary.byNetwork[p.network] ??= {inbound: 0, outbound: 0, total: 0})
		if (p.inbound) bucket.inbound++
		else bucket.outbound++
		bucket.total++
	}

	return summary
}

function hostFromAddr(addr: string): string {
	return addr.replace(/^\[?([^\]]+?)]?:\d+$/, '$1')
}

export async function peerLocations(): Promise<PeerLocationsResponse> {
	const peersInfo = await getPeerInfoRPC()

	const peers: PeerLocation[] = peersInfo.map((p) => {
		const host = hostFromAddr(p.addr)
		return {
			addr: host,
			network: p.network,
			location: ipToLatLng(host, p.network),
		}
	})

	const hostTally = new Map<string, number>()
	for (const peer of peersInfo) {
		const {addrlocal, network} = peer
		if (!addrlocal) continue
		if (network !== 'ipv4' && network !== 'ipv6') continue
		const host = hostFromAddr(addrlocal)
		hostTally.set(host, (hostTally.get(host) ?? 0) + 1)
	}

	let topHost = ''
	let topCount = 0
	for (const [host, count] of hostTally) {
		if (count > topCount) {
			topHost = host
			topCount = count
		}
	}

	const userLocation: [number, number] = topHost ? ipToLatLng(topHost, 'ipv4') : [-15.7942, -47.8822]

	return {userLocation, peers}
}
