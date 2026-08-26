import path from 'node:path'
import {fileURLToPath} from 'node:url'
import fse from 'fs-extra'

export const ZEBRAD_BIN = process.env['ZEBRAD_BIN'] || 'zebrad'
export const ZAKURAD_BIN = process.env['ZAKURAD_BIN'] || 'zakurad'
export const LIGHTWALLETD_BIN = process.env['LIGHTWALLETD_BIN'] || 'lightwalletd'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../')

export function resolveDataDirs(env: NodeJS.ProcessEnv, repoRoot: string) {
	const dataRoot = env['DATA_ROOT'] || path.join(repoRoot, 'data')
	return {
		dataRoot,
		zebraDir: env['CHAIN_STATE_DIR'] || env['ZEBRA_DIR'] || path.join(dataRoot, 'zebra'),
		zakuraDir: env['ZAKURA_DIR'] || path.join(dataRoot, 'zakura'),
		appStateDir: env['APP_STATE_DIR'] || path.join(dataRoot, 'app'),
		lightwalletdDir: env['LIGHTWALLETD_DIR'] || path.join(dataRoot, 'lightwalletd'),
	}
}

const dataDirs = resolveDataDirs(process.env, REPO_ROOT)

export const ZEBRA_DIR = dataDirs.zebraDir
export const ZAKURA_DIR = dataDirs.zakuraDir
export const APP_STATE_DIR = dataDirs.appStateDir
export const LIGHTWALLETD_DIR = dataDirs.lightwalletdDir

export const SETTINGS_JSON = path.join(APP_STATE_DIR, 'settings.json')
export const ZEBRAD_TOML = path.join(APP_STATE_DIR, 'zebrad.toml')
export const CUSTOM_TOML = path.join(APP_STATE_DIR, 'custom.toml')
export const ZCASH_CONF = path.join(APP_STATE_DIR, 'zcash.conf')

export async function ensureDirs() {
	await Promise.all([fse.ensureDir(APP_STATE_DIR), fse.ensureDir(LIGHTWALLETD_DIR)])
}
