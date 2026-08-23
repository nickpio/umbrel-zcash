import assert from 'node:assert/strict'
import test from 'node:test'

import {normalizeVizorEndpoint, vizorHostPort} from './vizor-url.js'
import {renderCaddyfile} from './caddyfile.js'

test('release Vizor accepts a Tailscale HTTPS host:port', () => {
	const uri = normalizeVizorEndpoint('umbrel-zcash.tail-xxxx.ts.net:443')
	assert.equal(uri, 'https://umbrel-zcash.tail-xxxx.ts.net:443')
	assert.equal(vizorHostPort(uri), 'umbrel-zcash.tail-xxxx.ts.net:443')
})

test('release Vizor prefixes a bare hostname with https:// and port 443', () => {
	assert.equal(normalizeVizorEndpoint('umbrel-zcash.tail-xxxx.ts.net'), 'https://umbrel-zcash.tail-xxxx.ts.net:443')
})

test('release Vizor rejects plaintext LAN and onion URLs', () => {
	assert.throws(() => normalizeVizorEndpoint('http://192.168.1.2:9067'), /https/)
	assert.throws(() => normalizeVizorEndpoint('http://127.0.0.1:9067'), /https/)
	assert.throws(() => normalizeVizorEndpoint('http://wallethidden.onion:9067'), /https/)
})

test('debug Vizor allows http:// only on localhost', () => {
	assert.equal(normalizeVizorEndpoint('http://127.0.0.1:9067', {debug: true}), 'http://127.0.0.1:9067')
	assert.throws(() => normalizeVizorEndpoint('http://192.168.1.2:9067', {debug: true}), /https/)
})

test('Caddyfile terminates TLS and proxies h2c to lightwalletd', () => {
	const file = renderCaddyfile({
		listenPort: '9443',
		certPath: '/data/app/vizor-https/cert.pem',
		keyPath: '/data/app/vizor-https/key.pem',
		lwdPort: '9067',
	})
	assert.match(file, /auto_https off/)
	assert.match(file, /bind 127\.0\.0\.1/)
	assert.match(file, /tls \/data\/app\/vizor-https\/cert\.pem \/data\/app\/vizor-https\/key\.pem/)
	assert.match(file, /reverse_proxy h2c:\/\/127\.0\.0\.1:9067/)
	assert.match(file, /versions h2c 2/)
})
