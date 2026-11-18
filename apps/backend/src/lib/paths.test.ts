import {describe, it, before, after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// paths.ts reads its env at import time, so point the binaries at a temp dir
// before the module is loaded.
const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcash-node-bins-'))
process.env['ZEBRAD_BIN'] = path.join(binDir, 'zebrad')
process.env['ZAKURAD_BIN'] = path.join(binDir, 'zakurad')

const {nodeBinaryFor} = await import('./paths.ts')

describe('nodeBinaryFor', () => {
	before(() => {
		for (const name of ['zebrad', 'zebrad-7.0.0', 'zakurad', 'zakurad-1.8.9']) {
			fs.writeFileSync(path.join(binDir, name), '', {mode: 0o755})
		}
	})
	after(() => fs.rmSync(binDir, {recursive: true, force: true}))

	it('picks the versioned binary when the image ships it', () => {
		assert.equal(nodeBinaryFor('zebra-v7.0.0'), path.join(binDir, 'zebrad-7.0.0'))
		assert.equal(nodeBinaryFor('zakura-v1.8.9'), path.join(binDir, 'zakurad-1.8.9'))
	})

	it('falls back to the unversioned binary when the versioned one is missing', () => {
		assert.equal(nodeBinaryFor('zebra-v7.1.0'), path.join(binDir, 'zebrad'))
		assert.equal(nodeBinaryFor('zakura-v1.8.6'), path.join(binDir, 'zakurad'))
	})
})
