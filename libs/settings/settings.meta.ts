// Single source of truth for Zebra settings: validation schema, defaults, and the Settings UI.

export const AVAILABLE_BITCOIN_CORE_VERSIONS = ['v6.3.0'] as const

export const DEFAULT_BITCOIN_CORE_VERSION = AVAILABLE_BITCOIN_CORE_VERSIONS[0]
export type BitcoinCoreVersion = (typeof AVAILABLE_BITCOIN_CORE_VERSIONS)[number]

export const LATEST = 'latest' as const
export const VERSION_CHOICES = [LATEST, ...AVAILABLE_BITCOIN_CORE_VERSIONS] as const
export type SelectedVersion = (typeof VERSION_CHOICES)[number]

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
		description: 'How many outbound peers Zebra tries to keep. Higher values use more bandwidth and memory.',
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
		description: 'Limit how many peers from the same IP address Zebra will accept. Helps against sybil-style flooding.',
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
			'Choose which Zcash chain this node follows. Switching networks uses a separate chain state directory and will restart Zebra and lightwalletd. Connected wallets must be pointed at the matching network.',
		options: [
			{value: 'Mainnet', label: 'Mainnet'},
			{value: 'Testnet', label: 'Testnet'},
		],
		default: 'Mainnet',
	},
} satisfies Record<string, VersionedOption>

export function resolveVersion(desired: SelectedVersion): BitcoinCoreVersion {
	return desired === LATEST ? DEFAULT_BITCOIN_CORE_VERSION : desired
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
