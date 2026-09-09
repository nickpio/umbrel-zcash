import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {resolveDataDirs} from './paths.ts'

describe('resolveDataDirs', () => {
	it('keeps repo-relative defaults when DATA_ROOT is unset', () => {
		const dirs = resolveDataDirs({}, '/repo')
		assert.equal(dirs.dataRoot, path.join('/repo', 'data'))
		assert.equal(dirs.zebraDir, path.join('/repo', 'data', 'zebra'))
		assert.equal(dirs.zakuraDir, path.join('/repo', 'data', 'zakura'))
		assert.equal(dirs.appStateDir, path.join('/repo', 'data', 'app'))
		assert.equal(dirs.lightwalletdDir, path.join('/repo', 'data', 'lightwalletd'))
	})

	it('nests default dirs under DATA_ROOT when per-dir env vars are unset', () => {
		const dirs = resolveDataDirs({DATA_ROOT: '/var/lib/zcash-node'}, '/repo')
		assert.equal(dirs.dataRoot, '/var/lib/zcash-node')
		assert.equal(dirs.zebraDir, path.join('/var/lib/zcash-node', 'zebra'))
		assert.equal(dirs.zakuraDir, path.join('/var/lib/zcash-node', 'zakura'))
		assert.equal(dirs.appStateDir, path.join('/var/lib/zcash-node', 'app'))
		assert.equal(dirs.lightwalletdDir, path.join('/var/lib/zcash-node', 'lightwalletd'))
	})

	it('lets explicit dir env vars win over DATA_ROOT', () => {
		const dirs = resolveDataDirs(
			{
				DATA_ROOT: '/var/lib/zcash-node',
				CHAIN_STATE_DIR: '/mnt/zebra',
				ZAKURA_DIR: '/mnt/zakura',
				APP_STATE_DIR: '/mnt/app',
				LIGHTWALLETD_DIR: '/mnt/lwd',
			},
			'/repo',
		)
		assert.equal(dirs.zebraDir, '/mnt/zebra')
		assert.equal(dirs.zakuraDir, '/mnt/zakura')
		assert.equal(dirs.appStateDir, '/mnt/app')
		assert.equal(dirs.lightwalletdDir, '/mnt/lwd')
	})

	it('prefers CHAIN_STATE_DIR over ZEBRA_DIR', () => {
		const dirs = resolveDataDirs({CHAIN_STATE_DIR: '/chain', ZEBRA_DIR: '/ignored'}, '/repo')
		assert.equal(dirs.zebraDir, '/chain')
	})
})
