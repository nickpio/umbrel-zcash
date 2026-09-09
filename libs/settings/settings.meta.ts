// Single source of truth for node settings: validation schema, defaults, and the Settings UI.

export type NodeImplementation = 'zebra' | 'zakura'

// Releases bundled in the app image, newest first. "Latest" resolves to the first
// entry; the second is offered as a pinned preset so users can roll back one release.
// The Dockerfile must ship a binary for every entry listed here.
export const NODE_RELEASES = {
	zebra: ['zebra-v6.3.0', 'zebra-v6.2.3'],
	zakura: ['zakura-v1.3.2', 'zakura-v1.3.1'],
} as const satisfies Record<NodeImplementation, readonly [string, string]>

export const AVAILABLE_BITCOIN_CORE_VERSIONS = [...NODE_RELEASES.zebra, ...NODE_RELEASES.zakura] as const
export type BitcoinCoreVersion = (typeof AVAILABLE_BITCOIN_CORE_VERSIONS)[number]

export const LATEST_VERSIONS = {zebra: 'zebra-latest', zakura: 'zakura-latest'} as const

export const DEFAULT_SELECTED_VERSION = LATEST_VERSIONS.zebra

export const VERSION_CHOICES = [
	LATEST_VERSIONS.zebra,
	NODE_RELEASES.zebra[1],
	LATEST_VERSIONS.zakura,
	NODE_RELEASES.zakura[1],
] as const
export type SelectedVersion = (typeof VERSION_CHOICES)[number]

const LEGACY_VERSIONS: Record<string, SelectedVersion> = {
	latest: LATEST_VERSIONS.zebra,
	'v6.3.0': LATEST_VERSIONS.zebra,
	zebra: LATEST_VERSIONS.zebra,
	zakura: LATEST_VERSIONS.zakura,
}

export function normalizeSelectedVersion(raw: unknown): SelectedVersion {
	if (typeof raw !== 'string') return DEFAULT_SELECTED_VERSION
	if ((VERSION_CHOICES as readonly string[]).includes(raw)) return raw as SelectedVersion
	if (raw in LEGACY_VERSIONS) return LEGACY_VERSIONS[raw]
	// A pinned release we no longer ship (or the latest release pinned by name)
	// falls back to that implementation's Latest instead of resetting to Zebra.
	if (raw.startsWith('zakura-')) return LATEST_VERSIONS.zakura
	if (raw.startsWith('zebra-')) return LATEST_VERSIONS.zebra
	return DEFAULT_SELECTED_VERSION
}

export function implementationForVersion(version: BitcoinCoreVersion | SelectedVersion): NodeImplementation {
	return version.startsWith('zakura-') ? 'zakura' : 'zebra'
}

export function implementationLabel(version: BitcoinCoreVersion | SelectedVersion): string {
	return implementationForVersion(version) === 'zakura' ? 'Zakura' : 'Zebra'
}

/** `zebra-v6.3.0` -> `6.3.0` */
export function releaseNumber(version: BitcoinCoreVersion): string {
	return version.replace(/^(zebra|zakura)-v/, '')
}

function versionOptionLabel(choice: SelectedVersion): string {
	const resolved = resolveVersion(choice)
	const name = `${implementationLabel(resolved)} ${releaseNumber(resolved)}`
	return (Object.values(LATEST_VERSIONS) as readonly string[]).includes(choice) ? `Latest (${name})` : name
}

export type Tab = 'peers' | 'network' | 'advanced'

interface BaseOption {
	tab: Tab
	label: string
	bitcoinLabel: string
	description: string
	subDescription?: string
}

interface NumberOption extends BaseOption {
	kind: 'number'
	min?: number
	max?: number
	step?: number
	default: number
	unit?: string
}

interface BooleanOption extends BaseOption {
	kind: 'toggle'
	default: boolean
	disabledWhen?: Record<string, (v: unknown) => boolean>
	disabledMessage?: string
}

interface SelectOption extends BaseOption {
	kind: 'select'
	options: {value: string; label: string}[]
	default: string
}

interface MultiOption extends BaseOption {
	kind: 'multi'
	options: {value: string; label: string}[]
	default: string[]
	requireAtLeastOne: boolean
}

export type Option = NumberOption | BooleanOption | SelectOption | MultiOption

type VersionOverrides = Partial<{
	default: unknown
	min: number
	max: number
	step: number
	unit: string
	options: {value: string; label: string}[]
	requireAtLeastOne: boolean
	disabledWhen: Record<string, (v: unknown) => boolean>
	disabledMessage: string
}>

export type VersionedOption = Option & {
	introducedIn?: BitcoinCoreVersion
	removedIn?: BitcoinCoreVersion
	versionOverrides?: Partial<Record<BitcoinCoreVersion, VersionOverrides>>
}

export const settingsMetadata = {
	version: {
		tab: 'network',
		kind: 'select',
		label: 'Node Implementation',
		bitcoinLabel: 'version',
		description:
			'Choose which Zcash node to run. Only one chain is kept on disk: switching deletes the other implementation’s chain to free space, then syncs from scratch. The node and lightwalletd restart when you save.',
		subDescription:
			'“Latest” follows the newest release bundled with the app. The pinned entries stay one release behind so you can roll back without resyncing.',
		options: VERSION_CHOICES.map((value) => ({value, label: versionOptionLabel(value)})),
		default: DEFAULT_SELECTED_VERSION,
	},

	listen: {
		tab: 'peers',
		kind: 'toggle',
		label: 'Incoming Peer Connections',
		bitcoinLabel: 'network.listen_addr',
		description:
			'Allow other Zcash nodes to connect to yours. You may need to forward port 8233 (mainnet) on your router for clearnet peers. Local apps can still reach this node either way.',
		default: true,
	},

	peerset_initial_target: {
		tab: 'peers',
		kind: 'number',
		label: 'Target Peer Count',
		bitcoinLabel: 'network.peerset_initial_target_size',
		description: 'How many outbound peers the node tries to keep. Higher values use more bandwidth and memory.',
		min: 1,
		max: 200,
		step: 1,
		default: 25,
		unit: 'peers',
	},

	max_connections_per_ip: {
		tab: 'peers',
		kind: 'number',
		label: 'Max Connections per IP',
		bitcoinLabel: 'network.max_connections_per_ip',
		description: 'Limit how many peers from the same IP address the node will accept. Helps against sybil-style flooding.',
		min: 1,
		max: 50,
		step: 1,
		default: 1,
		unit: 'connections',
	},

	chain: {
		tab: 'network',
		kind: 'select',
		label: 'Zcash Network',
		bitcoinLabel: 'network.network',
		description:
			'Choose which Zcash chain this node follows. Switching networks uses a separate chain state directory and will restart the node and lightwalletd. Connected wallets must be pointed at the matching network.',
		options: [
			{value: 'Mainnet', label: 'Mainnet'},
			{value: 'Testnet', label: 'Testnet'},
		],
		default: 'Mainnet',
	},
} satisfies Record<string, VersionedOption>

export function resolveVersion(desired: SelectedVersion): BitcoinCoreVersion {
	const normalized = normalizeSelectedVersion(desired)
	if (normalized === LATEST_VERSIONS.zebra) return NODE_RELEASES.zebra[0]
	if (normalized === LATEST_VERSIONS.zakura) return NODE_RELEASES.zakura[0]
	return normalized
}

export function settingsMetadataForVersion(version: BitcoinCoreVersion) {
	const metadata: Record<string, Option> = {}
	const versionIdx = AVAILABLE_BITCOIN_CORE_VERSIONS.indexOf(version)

	for (const [key, value] of Object.entries(settingsMetadata) as Array<[string, VersionedOption]>) {
		if (value.introducedIn && versionIdx > AVAILABLE_BITCOIN_CORE_VERSIONS.indexOf(value.introducedIn)) continue
		if (value.removedIn && versionIdx <= AVAILABLE_BITCOIN_CORE_VERSIONS.indexOf(value.removedIn)) continue

		const merged = {
			...value,
			...(value.versionOverrides?.[version] ?? {}),
		} as Record<string, unknown>

		delete merged['introducedIn']
		delete merged['removedIn']
		delete merged['versionOverrides']

		metadata[key] = merged as unknown as Option
	}

	return metadata
}

export function DefaultValuesForVersion(version: BitcoinCoreVersion) {
	const metadata = settingsMetadataForVersion(version)
	const defaults = {} as Record<string, unknown>
	for (const key in metadata) defaults[key] = (metadata as Record<string, {default: unknown}>)[key].default
	return defaults
}
