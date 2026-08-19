// Shared type declarations from the backend and ui

export type BitcoindVersion = {
	implementation: string
	version: string
}

export type BitcoindStatus = {
	running: boolean
	startedAt: number | null
	error: Error | null
	pid: number | null
	lightwalletdRunning: boolean
}

type BitcoindLifecycleResult = 'started' | 'stopped' | 'no_op'

export type BitcoindLifecycleResponse = {
	running: boolean
	pid: number | null
	result: BitcoindLifecycleResult
}

export type ExitInfo = {
	code: number | null
	sig: NodeJS.Signals | null
	logTail: string[]
	message: string
}

export type PeerCount = {
	total: number
	byNetwork: Record<string, {inbound: number; outbound: number; total: number}>
}

export type PeerInfo = {
	id: number
	addr: string
	addrlocal?: string
	network: string
	relaytxes: boolean
	lastsend: number
	lastrecv: number
	bytessent: number
	bytesrecv: number
	conntime: number
	pingtime: number
	pingwait: number
	version: number
	subver: string
	inbound: boolean
}

export type PeerLocation = {
	addr: string
	network: string
	location: [number, number]
}

export type PeerLocationsResponse = {
	userLocation: [number, number]
	peers: PeerLocation[]
}

export type RawTransaction = {
	txid: string
	fee?: number
	vsize: number
	weight: number
}

export type RawBlock = {
	hash: string
	height: number
	time: number
	nTx: number
	size: number
	weight: number
	tx: RawTransaction[]
}

export type Block = {
	hash: string
	height: number
	time: number
	size: number
	weight: number
	txCount: number
	subsidySat: number
	feesSat: number
	feeRates: {p10: number; p50: number; p90: number}
	transactionGrid: {size: number; numberOfBlocks: number}[]
}

export type SummaryResponse = {
	networkInfo: unknown
	blockchainInfo: unknown
	peerInfo: unknown
}

export type StatusResponse = {
	running: boolean
	pid: number
}

export type SyncStatus = {
	syncProgress: number
	isInitialBlockDownload: boolean
	blockHeight: number
	validatedHeaderHeight: number
	estimatedHeight: number
	walletReady: boolean
}

export type Stats = {
	peers: number
	mempoolBytes: number
	chainBytes: number
	uptimeSec: number
	blockHeight: number
}

export type EndpointDetails = {
	host: string
	port: string
	uri: string
}

export type RpcEndpointDetails = EndpointDetails & {
	username: string
	password: string
}

export type ConnectionDetails = {
	wallet: {
		tor: EndpointDetails
		local: EndpointDetails
	}
	p2p: {
		tor: EndpointDetails
		local: EndpointDetails
	}
	rpc: {
		tor: RpcEndpointDetails
		local: RpcEndpointDetails
	}
}
