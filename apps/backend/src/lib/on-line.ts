import {Readable} from 'node:stream'
import readline from 'node:readline'

export function onLine(src: Readable, callback: (line: string) => void, label = 'process') {
	src.on('error', (err) => console.error(`[${label}] stream error:`, err))

	const rl = readline.createInterface({input: src})
	rl.on('error', (err) => console.error(`[${label}] readline error:`, err))
	rl.on('line', (raw) => {
		try {
			const line = raw.trim()
			if (line) callback(line)
		} catch (err) {
			console.error(`[${label}] onLine callback error:`, err)
		}
	})
}
