import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const updaterSource = await readFile(new URL('./update-node-releases.mjs', import.meta.url), 'utf8')

const ZEBRA_RELEASES = 'https://api.github.com/repos/ZcashFoundation/zebra/releases'
const ZAKURA_RELEASES = 'https://api.github.com/repos/zakura-core/zakura/releases'
const ZEBRA_DOCKER = 'https://hub.docker.com/v2/repositories/zfnd/zebra/tags'
const ZAKURA_DOCKER = 'https://hub.docker.com/v2/repositories/zakuracore/zakura/tags'
const APP_STORE_MANIFEST =
	'https://raw.githubusercontent.com/nickpio/umbrel-app-store/main/personal-zcash-node/umbrel-app.yml'

function release(tag, {prerelease = false, draft = false} = {}) {
	return {
		tag_name: tag,
		prerelease,
		draft,
		html_url: `https://github.com/example/releases/tag/${tag}`,
	}
}

function jsonResponse(json, status = 200, statusText = 'OK') {
	return {json, status, statusText}
}

function dockerResponse(architectures = ['amd64']) {
	return jsonResponse({images: architectures.map((architecture) => ({os: 'linux', architecture}))})
}

function currentZakuraResponses() {
	return {
		[`${ZAKURA_RELEASES}/latest`]: jsonResponse(release('v1.5.0')),
		[`${ZAKURA_DOCKER}/1.5.0`]: dockerResponse(),
	}
}

function parseGitHubOutput(source) {
	const values = {}
	const lines = source.split('\n')
	for (let i = 0; i < lines.length; i++) {
		const header = /^([^<]+)<<(.+)$/.exec(lines[i])
		if (!header) continue
		const [, name, delimiter] = header
		const end = lines.indexOf(delimiter, i + 1)
		assert.notEqual(end, -1, `missing delimiter for ${name}`)
		values[name] = lines.slice(i + 1, end).join('\n')
		i = end
	}
	return values
}

async function createFixture(t) {
	const root = await mkdtemp(path.join(tmpdir(), 'umbrel-zcash-release-test-'))
	t.after(() => rm(root, {recursive: true, force: true}))

	await Promise.all([
		mkdir(path.join(root, 'scripts'), {recursive: true}),
		mkdir(path.join(root, 'libs/settings'), {recursive: true}),
		mkdir(path.join(root, 'apps/backend'), {recursive: true}),
	])

	const packageJson = {
		name: 'zcash-node-gui',
		version: '0.1.16',
		private: true,
		type: 'module',
	}
	const packageLock = {
		name: 'zcash-node-gui',
		version: '0.1.16',
		lockfileVersion: 3,
		requires: true,
		packages: {'': {name: 'zcash-node-gui', version: '0.1.16'}},
	}
	const settings = [
		'export const NODE_RELEASES = {',
		"\tzebra: ['zebra-v6.4.2', 'zebra-v6.3.0'],",
		"\tzakura: ['zakura-v1.5.0', 'zakura-v1.3.2'],",
		'}',
		'',
	].join('\n')
	const dockerfile = [
		'FROM zfnd/zebra:6.4.2 AS zebra',
		'FROM zfnd/zebra:6.3.0 AS zebra-previous',
		'FROM zakuracore/zakura:1.5.0 AS zakura',
		'FROM zakuracore/zakura:1.3.2 AS zakura-previous',
		'COPY --from=zebra /usr/local/bin/zebrad /usr/local/bin/zebrad-6.4.2',
		'COPY --from=zebra-previous /usr/local/bin/zebrad /usr/local/bin/zebrad-6.3.0',
		'',
	].join('\n')
	const fetchInterceptor = `
		import fs from 'node:fs'

		const responses = JSON.parse(fs.readFileSync(process.env.RELEASE_TEST_RESPONSES, 'utf8'))
		globalThis.fetch = async (input) => {
			const url = String(input)
			fs.appendFileSync(process.env.RELEASE_TEST_REQUESTS, url + '\\n')
			const response = responses[url]
			if (!response) return new Response('No mock response for ' + url, {status: 500, statusText: 'Unmocked URL'})
			const body = Object.hasOwn(response, 'json') ? JSON.stringify(response.json) : (response.text ?? '')
			return new Response(body, {
				status: response.status,
				statusText: response.statusText,
				headers: {'Content-Type': Object.hasOwn(response, 'json') ? 'application/json' : 'text/plain'},
			})
		}
	`

	await Promise.all([
		writeFile(path.join(root, 'scripts/update-node-releases.mjs'), updaterSource),
		writeFile(path.join(root, 'scripts/intercept-fetch.mjs'), fetchInterceptor),
		writeFile(path.join(root, 'libs/settings/settings.meta.ts'), settings),
		writeFile(path.join(root, 'apps/backend/Dockerfile'), dockerfile),
		writeFile(path.join(root, 'package.json'), `${JSON.stringify(packageJson, null, '\t')}\n`),
		writeFile(path.join(root, 'package-lock.json'), `${JSON.stringify(packageLock, null, '\t')}\n`),
	])

	return root
}

async function runUpdater(t, responses, args = []) {
	const root = await createFixture(t)
	const responseFile = path.join(root, 'responses.json')
	const requestFile = path.join(root, 'requests.log')
	const outputFile = path.join(root, 'github-output.txt')
	await Promise.all([
		writeFile(responseFile, JSON.stringify(responses)),
		writeFile(requestFile, ''),
		writeFile(outputFile, ''),
	])

	let result
	try {
		const output = await execFileAsync(
			process.execPath,
			[
				'--import',
				path.join(root, 'scripts/intercept-fetch.mjs'),
				path.join(root, 'scripts/update-node-releases.mjs'),
				...args,
			],
			{
				cwd: root,
				env: {
					...process.env,
					GITHUB_OUTPUT: outputFile,
					GITHUB_TOKEN: '',
					RELEASE_TEST_RESPONSES: responseFile,
					RELEASE_TEST_REQUESTS: requestFile,
				},
			},
		)
		result = {code: 0, ...output}
	} catch (error) {
		result = {code: error.code, stdout: error.stdout, stderr: error.stderr}
	}

	return {
		root,
		result,
		requests: (await readFile(requestFile, 'utf8')).trim().split('\n').filter(Boolean),
		output: parseGitHubOutput(await readFile(outputFile, 'utf8')),
	}
}

test('finds a stable release behind invalid latest releases and bumps it', async (t) => {
	const firstPage = Array.from({length: 100}, (_, index) =>
		index % 2 === 0 ? release(`v8.0.${index}`, {prerelease: true}) : release(`v8.0.${index}`, {draft: true}),
	)
	const responses = {
		[`${ZEBRA_RELEASES}/latest`]: jsonResponse(release('v7.0.0-rc.0')),
		[`${ZEBRA_RELEASES}?per_page=100&page=1`]: jsonResponse(firstPage),
		[`${ZEBRA_RELEASES}?per_page=100&page=2`]: jsonResponse([release('v6.5.0')]),
		[`${ZEBRA_DOCKER}/6.5.0`]: dockerResponse(),
		...currentZakuraResponses(),
		[APP_STORE_MANIFEST]: {text: 'version: "0.1.20"\n', status: 200, statusText: 'OK'},
	}

	const {root, result, requests, output} = await runUpdater(t, responses)

	assert.equal(result.code, 0, result.stderr)
	assert.deepEqual(requests, [
		`${ZEBRA_RELEASES}/latest`,
		`${ZEBRA_RELEASES}?per_page=100&page=1`,
		`${ZEBRA_RELEASES}?per_page=100&page=2`,
		`${ZEBRA_DOCKER}/6.5.0`,
		`${ZAKURA_RELEASES}/latest`,
		`${ZAKURA_DOCKER}/1.5.0`,
		APP_STORE_MANIFEST,
	])
	assert.equal(output.changed, 'true')
	assert.equal(output.version, '0.1.21')
	assert.equal(output.title, 'Bump Zebra to 6.5.0')
	assert.match(output.body, /\| Zebra \| 6\.4\.2 → \*\*6\.5\.0\*\* \| 6\.3\.0 → 6\.4\.2 \|/)

	const settings = await readFile(path.join(root, 'libs/settings/settings.meta.ts'), 'utf8')
	assert.match(settings, /zebra: \['zebra-v6\.5\.0', 'zebra-v6\.4\.2'\]/)
	const dockerfile = await readFile(path.join(root, 'apps/backend/Dockerfile'), 'utf8')
	assert.match(dockerfile, /^FROM zfnd\/zebra:6\.5\.0 AS zebra$/m)
	assert.match(dockerfile, /^FROM zfnd\/zebra:6\.4\.2 AS zebra-previous$/m)
	assert.match(dockerfile, /zebrad-6\.5\.0$/m)
	assert.match(dockerfile, /zebrad-6\.4\.2$/m)
	assert.equal(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version, '0.1.21')
	const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
	assert.equal(lock.version, '0.1.21')
	assert.equal(lock.packages[''].version, '0.1.21')
})

test('skips a release without a linux amd64 Docker image', async (t) => {
	const responses = {
		[`${ZEBRA_RELEASES}/latest`]: jsonResponse(release('v6.5.0')),
		[`${ZEBRA_DOCKER}/6.5.0`]: dockerResponse(['arm64']),
		...currentZakuraResponses(),
	}

	const {root, result, requests, output} = await runUpdater(t, responses)

	assert.equal(result.code, 0, result.stderr)
	assert.equal(output.changed, 'false')
	assert.equal(requests.some((url) => url.includes('?per_page=')), false)
	assert.equal(requests.includes(APP_STORE_MANIFEST), false)
	const settings = await readFile(path.join(root, 'libs/settings/settings.meta.ts'), 'utf8')
	assert.match(settings, /zebra: \['zebra-v6\.4\.2', 'zebra-v6\.3\.0'\]/)
})

test('reports a GitHub release-list failure', async (t) => {
	const listUrl = `${ZEBRA_RELEASES}?per_page=100&page=1`
	const responses = {
		[`${ZEBRA_RELEASES}/latest`]: jsonResponse(release('v7.0.0-rc.0')),
		[listUrl]: jsonResponse({message: 'unavailable'}, 503, 'Service Unavailable'),
	}

	const {result, requests} = await runUpdater(t, responses)

	assert.equal(result.code, 1)
	assert.match(result.stderr, new RegExp(`GET ${listUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} -> 503 Service Unavailable`))
	assert.deepEqual(requests, [`${ZEBRA_RELEASES}/latest`, listUrl])
})

test('reports when no stable release is available', async (t) => {
	const listUrl = `${ZEBRA_RELEASES}?per_page=100&page=1`
	const responses = {
		[`${ZEBRA_RELEASES}/latest`]: jsonResponse(release('v7.0.0-rc.0')),
		[listUrl]: jsonResponse([release('v7.0.0-rc.0')]),
	}

	const {result, requests} = await runUpdater(t, responses)

	assert.equal(result.code, 1)
	assert.match(result.stderr, /No stable plain semver release found for ZcashFoundation\/zebra/)
	assert.deepEqual(requests, [`${ZEBRA_RELEASES}/latest`, listUrl])
})
