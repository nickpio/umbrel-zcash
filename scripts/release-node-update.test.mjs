import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'
import test from 'node:test'

const workflow = await readFile(new URL('../.github/workflows/release-node-update.yml', import.meta.url), 'utf8')

test('release workflow publishes artifacts without updating the app-store repository', () => {
	assert.doesNotMatch(workflow, /APP_STORE_TOKEN|update-app-store|repository: nickpio\/umbrel-app-store/)
	assert.doesNotMatch(workflow, /^  app-store:/m)
	assert.match(workflow, /uses: \.\/.github\/workflows\/on-tag\.yml/)
})

// Execute the actual github-script body, not a copy of the release logic.
function releaseScript() {
	const match = /^          script: \|\n((?:            .*\n|\n)+)/m.exec(workflow)
	assert.ok(match, 'release workflow must publish a GitHub Release with github-script')
	return new (Object.getPrototypeOf(async function () {}).constructor)(
		'github',
		'context',
		'core',
		'process',
		match[1].replace(/^            /gm, ''),
	)
}

function fixture(existing = null) {
	let stored = existing
	const calls = []
	const release = {
		id: 42,
		tag_name: 'v0.1.18',
		draft: false,
		prerelease: false,
		html_url: 'https://example.com/release/42',
	}
	const github = {
		rest: {
			repos: {
				async getReleaseByTag(args) {
					calls.push(['get', args])
					if (!stored) throw Object.assign(new Error('Not Found'), {status: 404})
					return {data: stored}
				},
				async createRelease(args) {
					calls.push(['create', args])
					stored = {...release, ...args}
					return {data: stored}
				},
				async updateRelease(args) {
					calls.push(['update', args])
					assert.equal(args.release_id, stored.id)
					stored = {...stored, ...args}
					return {data: stored}
				},
			},
		},
	}
	const context = {repo: {owner: 'nickpio', repo: 'umbrel-zcash'}}
	const core = {info() {}}
	const process = {
		env: {
			TAG: 'v0.1.18',
			TITLE: 'Bump Zebra to 7.0.0 and Zakura to 1.7.0',
			IMAGE: `ghcr.io/nickpio/umbrel-zcash:v0.1.18@sha256:${'a'.repeat(64)}`,
			PR_URL: 'https://github.com/nickpio/umbrel-zcash/pull/30',
		},
	}
	return {github, context, core, process, calls, release}
}

async function publish(f) {
	await releaseScript()(f.github, f.context, f.core, f.process)
}

test('publishes a stable GitHub Release with the exact built image and reads it back', async () => {
	const f = fixture()
	await publish(f)
	assert.deepEqual(
		f.calls.map(([method]) => method),
		['get', 'create', 'get'],
	)
	const args = f.calls[1][1]
	assert.equal(args.owner, 'nickpio')
	assert.equal(args.repo, 'umbrel-zcash')
	assert.equal(args.tag_name, f.process.env.TAG)
	assert.equal(args.name, `${f.process.env.TAG}: ${f.process.env.TITLE}`)
	assert.equal(args.draft, false)
	assert.equal(args.prerelease, false)
	assert.equal(args.generate_release_notes, true)
	assert.ok(args.body.includes(f.process.env.IMAGE))
	assert.ok(args.body.includes(f.process.env.PR_URL))
})

test('reuses an already published release on retry', async () => {
	const f = fixture()
	await publish(f)
	f.calls.length = 0
	await publish(f)
	assert.deepEqual(
		f.calls.map(([method]) => method),
		['get', 'get'],
	)
})

test('reconciles a rebuilt image on retry without replacing generated release notes', async () => {
	const previousImage = `ghcr.io/nickpio/umbrel-zcash:v0.1.18@sha256:${'b'.repeat(64)}`
	const body = `Node update details\n\nContainer image: \`${previousImage}\`\n\n## What's Changed\n* Preserve this generated note by @contributor in #30\n`
	const f = fixture({id: 42, tag_name: 'v0.1.18', draft: false, prerelease: false, body})
	await publish(f)
	assert.deepEqual(
		f.calls.map(([method]) => method),
		['get', 'update', 'get'],
	)
	assert.deepEqual(f.calls[1][1], {
		...f.context.repo,
		release_id: 42,
		body: body.replace(previousImage, f.process.env.IMAGE),
	})
	assert.deepEqual(f.calls[2][1], {...f.context.repo, tag: f.process.env.TAG})
})

test('rejects a reconciliation if the reread release still records the previous image', async () => {
	const body = 'Generated release notes\n\nContainer image: `previous-image`'
	const f = fixture({id: 42, tag_name: 'v0.1.18', draft: false, prerelease: false, body})
	f.github.rest.repos.updateRelease = async (args) => {
		f.calls.push(['update', args])
		return {data: {...f.release, ...args}}
	}
	await assert.rejects(publish(f), /does not reference the current container image/)
	assert.deepEqual(
		f.calls.map(([method]) => method),
		['get', 'update', 'get'],
	)
	assert.deepEqual(f.calls[2][1], {...f.context.repo, tag: f.process.env.TAG})
})

test('does not treat GitHub permission or server failures as a missing release', async () => {
	for (const status of [403, 500]) {
		const f = fixture()
		f.github.rest.repos.getReleaseByTag = async () => {
			throw Object.assign(new Error('GitHub unavailable'), {status})
		}
		await assert.rejects(publish(f), /GitHub unavailable/)
		assert.equal(f.calls.length, 0)
	}
})

test('rejects a draft or prerelease as an incomplete app release', async () => {
	for (const flags of [{draft: true}, {prerelease: true}]) {
		const f = fixture({id: 42, tag_name: 'v0.1.18', draft: false, prerelease: false, ...flags})
		await assert.rejects(publish(f), /not a published stable release/)
		assert.equal(
			f.calls.some(([method]) => method === 'create' || method === 'update'),
			false,
		)
	}
})

test('tagging can be retried, but never overwrites a tag on another commit', async (t) => {
	const exec = promisify(execFile)
	const root = await mkdtemp(path.join(tmpdir(), 'umbrel-release-tag-'))
	t.after(() => rm(root, {recursive: true, force: true}))
	const remote = path.join(root, 'origin.git')
	const git = (...args) => exec('git', args, {cwd: root})
	await git('init', '--bare', remote)
	await git('init')
	await git('config', 'user.name', 'Release Test')
	await git('config', 'user.email', 'release@example.com')
	await git('remote', 'add', 'origin', remote)
	await git('commit', '--allow-empty', '-m', 'Node update')
	const match = /      - name: Push tag\n[\s\S]*?        run: \|\n((?:          .*\n|\n)+)/.exec(workflow)
	assert.ok(match, 'missing tag step')
	const script = match[1].replace(/^          /gm, '')
	const pushTag = () =>
		exec('bash', ['-e', '-o', 'pipefail', '-c', script], {
			cwd: root,
			env: {...process.env, TAG: 'v0.1.18'},
		})
	await pushTag()
	await pushTag()
	const original = (await git('rev-parse', 'HEAD')).stdout.trim()
	await git('commit', '--allow-empty', '-m', 'Another update')
	await assert.rejects(pushTag(), /already exists on a different commit/)
	assert.equal((await git('--git-dir', remote, 'rev-parse', 'refs/tags/v0.1.18')).stdout.trim(), original)
})
