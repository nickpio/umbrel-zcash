#!/usr/bin/env node
// Bumps the bundled Zebra / Zakura releases to the newest upstream release.
//
// For each implementation, if GitHub's latest (non-prerelease) release is newer
// than NODE_RELEASES[impl][0] and its Docker Hub image tag is published, the
// release list becomes [upstream, currentLatest]: the old Latest turns into the
// pinned rollback preset. Every file that hardcodes the shipped versions is
// rewritten to match.
//
// Any bump also raises the app version (package.json) one patch past the version
// published in the Umbrel app store, so umbrelOS offers users the update once
// the release workflow ships it.
//
// Usage: node scripts/update-node-releases.mjs [--dry-run]
// Writes `changed`, `version`, `title` and `body` to $GITHUB_OUTPUT when set.

import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRY_RUN = process.argv.includes('--dry-run')

const IMPLEMENTATIONS = {
	zebra: {label: 'Zebra', githubRepo: 'ZcashFoundation/zebra', dockerRepo: 'zfnd/zebra'},
	zakura: {label: 'Zakura', githubRepo: 'zakura-core/zakura', dockerRepo: 'zakuracore/zakura'},
}

const SETTINGS_FILE = 'libs/settings/settings.meta.ts'
const APP_STORE_MANIFEST =
	'https://raw.githubusercontent.com/nickpio/umbrel-app-store/main/personal-zcash-node/umbrel-app.yml'

// Files that spell out the shipped versions. Only lines mentioning the
// implementation are touched, so unrelated `1.3.2`-style strings survive.
const VERSIONED_FILES = [
	'apps/backend/Dockerfile',
	'apps/backend/src/lib/paths.test.ts',
	'apps/backend/src/modules/config/versions.test.ts',
	'README.md',
	'AGENTS.md',
	'.cursor/install.sh',
]

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/

function parseSemver(v) {
	const m = SEMVER.exec(v)
	if (!m) throw new Error(`Not a plain semver release: ${v}`)
	return m.slice(1).map(Number)
}

function compareSemver(a, b) {
	const [pa, pb] = [parseSemver(a), parseSemver(b)]
	for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
	return 0
}

async function fetchJson(url, {allow404 = false} = {}) {
	const headers = {Accept: 'application/json', 'User-Agent': 'umbrel-zcash-release-bot'}
	if (url.startsWith('https://api.github.com/') && process.env.GITHUB_TOKEN) {
		headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
	}
	const res = await fetch(url, {headers})
	if (allow404 && res.status === 404) return null
	if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
	return res.json()
}

function readCurrentReleases() {
	const src = fs.readFileSync(path.join(ROOT, SETTINGS_FILE), 'utf8')
	const current = {}
	for (const impl of Object.keys(IMPLEMENTATIONS)) {
		const m = new RegExp(`^\\t${impl}: \\['${impl}-v([\\d.]+)', '${impl}-v([\\d.]+)'\\],$`, 'm').exec(src)
		if (!m) throw new Error(`Could not find NODE_RELEASES.${impl} in ${SETTINGS_FILE}`)
		current[impl] = {latest: m[1], previous: m[2]}
	}
	return current
}

async function upstreamRelease(impl) {
	const {githubRepo, dockerRepo} = IMPLEMENTATIONS[impl]
	const releasesUrl = `https://api.github.com/repos/${githubRepo}/releases`
	const isStable = (candidate) =>
		candidate.draft === false &&
		candidate.prerelease === false &&
		typeof candidate.tag_name === 'string' &&
		SEMVER.test(candidate.tag_name)
	let release = await fetchJson(`${releasesUrl}/latest`)
	if (!isStable(release)) {
		for (let page = 1; ; page++) {
			const releases = await fetchJson(`${releasesUrl}?per_page=100&page=${page}`)
			release = releases.find(isStable)
			if (release) break
			if (releases.length < 100) throw new Error(`No stable plain semver release found for ${githubRepo}`)
		}
	}
	const version = release.tag_name.replace(/^v/, '')
	parseSemver(version)
	// The Dockerfile copies the binary out of the upstream image, so a release
	// is only usable once its image tag exists.
	const tag = await fetchJson(`https://hub.docker.com/v2/repositories/${dockerRepo}/tags/${version}`, {allow404: true})
	const amd64 = tag?.images?.some((i) => i.os === 'linux' && i.architecture === 'amd64')
	return {version, url: release.html_url, imagePublished: Boolean(amd64)}
}

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Swap versions via placeholders so `previous <- oldLatest` and
// `oldLatest <- newLatest` don't clobber each other.
function rewriteLine(line, impl, mapping) {
	if (!line.toLowerCase().includes(impl)) return line
	let out = line
	mapping.forEach(([from], i) => {
		out = out.replace(new RegExp(`(?<![\\d.])${escapeRegExp(from)}(?![\\d.])`, 'g'), `\u0000${impl}${i}\u0000`)
	})
	mapping.forEach(([, to], i) => {
		out = out.replaceAll(`\u0000${impl}${i}\u0000`, to)
	})
	return out
}

function applyBump(impl, from, to) {
	const mapping = [
		[from.latest, to.latest],
		[from.previous, to.previous],
	]
	const touched = []

	for (const rel of VERSIONED_FILES) {
		const file = path.join(ROOT, rel)
		if (!fs.existsSync(file)) continue
		const before = fs.readFileSync(file, 'utf8')
		const after = before
			.split('\n')
			.map((line) => rewriteLine(line, impl, mapping))
			.join('\n')
		if (after !== before) {
			touched.push(rel)
			if (!DRY_RUN) fs.writeFileSync(file, after)
		}
	}

	// settings.meta.ts also carries legacy ids and doc examples that must not
	// move, so only the NODE_RELEASES entry is rewritten there.
	const settingsPath = path.join(ROOT, SETTINGS_FILE)
	const settings = fs.readFileSync(settingsPath, 'utf8')
	const entry = new RegExp(`^\\t${impl}: \\[.*\\],$`, 'm')
	const updated = settings.replace(entry, `\t${impl}: ['${impl}-v${to.latest}', '${impl}-v${to.previous}'],`)
	if (updated !== settings) {
		touched.push(SETTINGS_FILE)
		if (!DRY_RUN) fs.writeFileSync(settingsPath, updated)
	}
	return touched
}

async function publishedAppVersion() {
	const res = await fetch(APP_STORE_MANIFEST, {headers: {'User-Agent': 'umbrel-zcash-release-bot'}})
	if (!res.ok) throw new Error(`GET ${APP_STORE_MANIFEST} -> ${res.status} ${res.statusText}`)
	const m = /^version:\s*["']?([\d.]+)["']?\s*$/m.exec(await res.text())
	if (!m) throw new Error(`No version in ${APP_STORE_MANIFEST}`)
	return m[1]
}

// package.json can lag behind releases cut by hand, so bump from whichever of it
// and the app store listing is newer.
async function bumpAppVersion() {
	const pkgPath = path.join(ROOT, 'package.json')
	const lockPath = path.join(ROOT, 'package-lock.json')
	const pkg = fs.readFileSync(pkgPath, 'utf8')
	const current = JSON.parse(pkg).version
	const published = await publishedAppVersion()
	const base = compareSemver(current, published) >= 0 ? current : published
	const [major, minor, patch] = parseSemver(base)
	const next = `${major}.${minor}.${patch + 1}`

	if (!DRY_RUN) {
		// Only the root entries: the lockfile also lists dependencies that may
		// share the version string.
		fs.writeFileSync(pkgPath, pkg.replace(/^(\t"version": )"[^"]+"/m, `$1"${next}"`))
		const lock = fs.readFileSync(lockPath, 'utf8')
		fs.writeFileSync(
			lockPath,
			lock
				.replace(/^(\t"version": )"[^"]+"/m, `$1"${next}"`)
				.replace(/^(\t\t"": \{\n\t\t\t"name": "[^"]+",\n\t\t\t"version": )"[^"]+"/m, `$1"${next}"`),
		)
	}
	console.log(`App: ${base} -> ${next} (package.json ${current}, app store ${published})`)
	return next
}

function setOutput(name, value) {
	if (!process.env.GITHUB_OUTPUT) return
	const delim = `EOF_${Math.random().toString(36).slice(2)}`
	fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delim}\n${value}\n${delim}\n`)
}

const current = readCurrentReleases()
const bumps = []
const notes = []

for (const impl of Object.keys(IMPLEMENTATIONS)) {
	const {label} = IMPLEMENTATIONS[impl]
	const upstream = await upstreamRelease(impl)
	const cur = current[impl]

	if (compareSemver(upstream.version, cur.latest) <= 0) {
		console.log(`${label}: up to date (${cur.latest})`)
		continue
	}
	if (!upstream.imagePublished) {
		const msg = `${label} ${upstream.version} is released but ${IMPLEMENTATIONS[impl].dockerRepo}:${upstream.version} (linux/amd64) is not on Docker Hub yet; skipping`
		console.log(msg)
		notes.push(msg)
		continue
	}

	const next = {latest: upstream.version, previous: cur.latest}
	const files = applyBump(impl, cur, next)
	console.log(`${label}: ${cur.latest} -> ${next.latest} (rollback preset ${cur.previous} -> ${next.previous})`)
	for (const f of files) console.log(`  updated ${f}`)
	bumps.push({impl, label, from: cur, to: next, url: upstream.url})
}

const changed = bumps.length > 0 && !DRY_RUN
setOutput('changed', String(changed))

if (bumps.length) {
	const appVersion = await bumpAppVersion()
	const title = `Bump ${bumps.map((b) => `${b.label} to ${b.to.latest}`).join(' and ')}`
	const body = [
		'Automated update from the daily node release check.',
		'',
		`App version: **${appVersion}**. Merging this PR tags \`v${appVersion}\`, publishes the image, and updates the Umbrel app store listing so users are offered the update.`,
		'',
		'| Implementation | Latest | Rollback preset | Release notes |',
		'| --- | --- | --- | --- |',
		...bumps.map(
			(b) =>
				`| ${b.label} | ${b.from.latest} → **${b.to.latest}** | ${b.from.previous} → ${b.to.previous} | [${b.to.latest}](${b.url}) |`,
		),
		...(notes.length ? ['', ...notes.map((n) => `- ${n}`)] : []),
		'',
		'Users on **Latest** move to the new release on update; the previous Latest becomes the pinned rollback preset. Anyone pinned to the retired release is moved to that implementation’s Latest.',
		'',
		'Review the upstream release notes for config or database changes before merging.',
	].join('\n')
	setOutput('version', appVersion)
	setOutput('title', title)
	setOutput('body', body)
}
