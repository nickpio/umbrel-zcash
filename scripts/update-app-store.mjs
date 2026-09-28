#!/usr/bin/env node
// Points the Umbrel app store listing at a newly published app image.
//
// Usage: node scripts/update-app-store.mjs <app-dir> <version> <image@sha256:digest> <release notes>
//   e.g. node scripts/update-app-store.mjs store/personal-zcash-node 0.1.16 \
//          ghcr.io/nickpio/umbrel-zcash:v0.1.16@sha256:... "Bump Zebra to 6.4.2."
//
// Edits umbrel-app.yml (version, icon cache-buster, releaseNotes) and the app
// image in docker-compose.yml in place, leaving the rest of the files untouched.

import fs from 'node:fs'
import path from 'node:path'

const [dir, version, image, notes] = process.argv.slice(2)
if (!dir || !version || !image || !notes) {
	console.error('usage: update-app-store.mjs <app-dir> <version> <image@digest> <release notes>')
	process.exit(1)
}
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Bad version: ${version}`)
if (!/^ghcr\.io\/nickpio\/umbrel-zcash:v[\d.]+@sha256:[0-9a-f]{64}$/.test(image)) throw new Error(`Bad image: ${image}`)

function edit(file, replacements) {
	const p = path.join(dir, file)
	let src = fs.readFileSync(p, 'utf8')
	for (const [pattern, replacement] of replacements) {
		const next = src.replace(pattern, replacement)
		if (next === src) throw new Error(`${file}: no match for ${pattern}`)
		src = next
	}
	fs.writeFileSync(p, src)
}

// Folded block, wrapped at ~80 columns like the rest of the manifest.
function foldedBlock(text) {
	const lines = []
	let line = ''
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (line && line.length + word.length + 1 > 78) {
			lines.push(line)
			line = word
		} else {
			line = line ? `${line} ${word}` : word
		}
	}
	if (line) lines.push(line)
	return lines.map((l) => `  ${l}\n`).join('')
}

edit('umbrel-app.yml', [
	[/^version: .*$/m, `version: "${version}"`],
	[/(^icon: .*\?v=)[\d.]+$/m, `$1${version}`],
	// The block runs until the next top-level key.
	[/^releaseNotes: >-\n(?:(?: .*)?\n)*?(?=\S)/m, () => `releaseNotes: >-\n${foldedBlock(notes)}`],
])

edit('docker-compose.yml', [[/(^\s*image: )ghcr\.io\/nickpio\/umbrel-zcash:\S+$/m, `$1${image}`]])

console.log(`Updated ${dir} to ${version} (${image})`)
