import {describe, it} from 'node:test'
import assert from 'node:assert/strict'

import {
	AVAILABLE_BITCOIN_CORE_VERSIONS,
	filterMetadataForVersion,
	settingsMetadata,
	settingsMetadataForVersion,
	type VersionedOption,
} from './settings.meta.ts'

const [FIRST, SECOND] = AVAILABLE_BITCOIN_CORE_VERSIONS

const base = {
	tab: 'advanced',
	kind: 'toggle',
	label: 'Test',
	bitcoinLabel: 'test',
	description: '',
	default: true,
} satisfies VersionedOption

describe('filterMetadataForVersion', () => {
	it('shows an option from the version it was introduced in onwards', () => {
		const options = {added: {...base, introducedIn: SECOND}}

		assert.deepEqual(Object.keys(filterMetadataForVersion(options, FIRST)), [])
		assert.deepEqual(Object.keys(filterMetadataForVersion(options, SECOND)), ['added'])
	})

	it('keeps an option introduced in the first version for every later version', () => {
		const options = {legacy: {...base, introducedIn: FIRST}}

		for (const version of AVAILABLE_BITCOIN_CORE_VERSIONS) {
			assert.deepEqual(Object.keys(filterMetadataForVersion(options, version)), ['legacy'], version)
		}
	})

	it('hides an option from the version it was removed in onwards', () => {
		const options = {gone: {...base, removedIn: SECOND}}

		assert.deepEqual(Object.keys(filterMetadataForVersion(options, FIRST)), ['gone'])
		assert.deepEqual(Object.keys(filterMetadataForVersion(options, SECOND)), [])
	})

	it('handles introducedIn and removedIn together', () => {
		const options = {window: {...base, introducedIn: FIRST, removedIn: SECOND}}

		assert.deepEqual(Object.keys(filterMetadataForVersion(options, FIRST)), ['window'])
		assert.deepEqual(Object.keys(filterMetadataForVersion(options, SECOND)), [])
	})

	it('strips the version-gating fields and applies overrides', () => {
		const options = {
			opt: {...base, introducedIn: FIRST, versionOverrides: {[SECOND]: {default: false}}},
		}

		assert.deepEqual(filterMetadataForVersion(options, FIRST)['opt'], base)
		assert.deepEqual(filterMetadataForVersion(options, SECOND)['opt'], {...base, default: false})
	})
})

describe('settingsMetadataForVersion', () => {
	it('exposes every current option for every supported version', () => {
		for (const version of AVAILABLE_BITCOIN_CORE_VERSIONS) {
			assert.deepEqual(Object.keys(settingsMetadataForVersion(version)), Object.keys(settingsMetadata), version)
		}
	})
})
