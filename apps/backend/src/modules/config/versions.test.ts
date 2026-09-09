import {describe, it} from 'node:test'
import assert from 'node:assert/strict'

import {
	DEFAULT_SELECTED_VERSION,
	DefaultValuesForVersion,
	LATEST_VERSIONS,
	NODE_RELEASES,
	VERSION_CHOICES,
	normalizeSelectedVersion,
	resolveVersion,
	settingsMetadata,
	schemaForVersion,
	type NodeImplementation,
} from '#settings'

const IMPLEMENTATIONS = ['zebra', 'zakura'] as const satisfies readonly NodeImplementation[]

describe('node version choices', () => {
	for (const impl of IMPLEMENTATIONS) {
		it(`${impl}: offers Latest plus a pinned preset exactly one release behind`, () => {
			const [latest, previous] = NODE_RELEASES[impl]
			assert.ok(VERSION_CHOICES.includes(LATEST_VERSIONS[impl]))
			assert.ok(VERSION_CHOICES.includes(previous))
			assert.ok(!(VERSION_CHOICES as readonly string[]).includes(latest), 'latest release is only reachable via Latest')
			assert.equal(resolveVersion(LATEST_VERSIONS[impl]), latest)
			assert.equal(resolveVersion(previous), previous)
		})
	}

	it('labels every dropdown entry from the release list', () => {
		const labels = settingsMetadata.version.options.map((o) => o.label)
		assert.deepEqual(labels, ['Latest (Zebra 6.3.0)', 'Zebra 6.2.3', 'Latest (Zakura 1.3.2)', 'Zakura 1.3.1'])
	})

	it('defaults to Latest Zebra', () => {
		assert.equal(DEFAULT_SELECTED_VERSION, LATEST_VERSIONS.zebra)
		assert.equal(settingsMetadata.version.default, LATEST_VERSIONS.zebra)
	})
})

describe('normalizeSelectedVersion', () => {
	it('keeps valid choices', () => {
		for (const choice of VERSION_CHOICES) assert.equal(normalizeSelectedVersion(choice), choice)
	})

	it('maps the legacy bare "latest" to Latest Zebra', () => {
		assert.equal(normalizeSelectedVersion('latest'), LATEST_VERSIONS.zebra)
	})

	it('moves a pinned release that is no longer shipped to that implementation’s Latest', () => {
		assert.equal(normalizeSelectedVersion('zakura-v1.2.0'), LATEST_VERSIONS.zakura)
		assert.equal(normalizeSelectedVersion('zebra-v6.3.0'), LATEST_VERSIONS.zebra)
		assert.equal(normalizeSelectedVersion('zebra-v5.0.0'), LATEST_VERSIONS.zebra)
	})

	it('falls back to the default for unknown or missing values', () => {
		assert.equal(normalizeSelectedVersion(undefined), DEFAULT_SELECTED_VERSION)
		assert.equal(normalizeSelectedVersion(42), DEFAULT_SELECTED_VERSION)
		assert.equal(normalizeSelectedVersion('bitcoind'), DEFAULT_SELECTED_VERSION)
	})
})

describe('schemaForVersion', () => {
	it('accepts every selectable version', () => {
		for (const choice of VERSION_CHOICES) {
			const defaults = DefaultValuesForVersion(resolveVersion(choice))
			assert.doesNotThrow(() => schemaForVersion(choice).parse({...defaults, version: choice}))
		}
	})

	it('rejects a version string that is not selectable', () => {
		const defaults = DefaultValuesForVersion(resolveVersion(LATEST_VERSIONS.zebra))
		assert.throws(() => schemaForVersion(LATEST_VERSIONS.zebra).parse({...defaults, version: 'zebra-v6.3.0'}))
	})
})
