import path from 'node:path'
import {fileURLToPath} from 'node:url'
import fse from 'fs-extra'

export const ZEBRAD_BIN = process.env['ZEBRAD_BIN'] || 'zebrad'
export const ZAKURAD_BIN = process.env['ZAKURAD_BIN'] || 'zakurad'
export const LIGHTWALLETD_BIN = process.env['LIGHTWALLETD_BIN'] || 'lightwalletd'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../')

export const ZEBRA_DIR = process.env['CHAIN_STATE_DIR'] || process.env['ZEBRA_DIR'] || path.join(REPO_ROOT, 'data', 'zebra')
export const ZAKURA_DIR = process.env['ZAKURA_DIR'] || path.join(REPO_ROOT, 'data', 'zakura')
export const APP_STATE_DIR = process.env['APP_STATE_DIR'] || path.join(REPO_ROOT, 'data', 'app')
export const LIGHTWALLETD_DIR = process.env['LIGHTWALLETD_DIR'] || path.join(REPO_ROOT, 'data', 'lightwalletd')

export const SETTINGS_JSON = path.join(APP_STATE_DIR, 'settings.json')
export const ZEBRAD_TOML = path.join(APP_STATE_DIR, 'zebrad.toml')
export const CUSTOM_TOML = path.join(APP_STATE_DIR, 'custom.toml')
export const ZCASH_CONF = path.join(APP_STATE_DIR, 'zcash.conf')

export async function ensureDirs() {
	await Promise.all([fse.ensureDir(APP_STATE_DIR), fse.ensureDir(LIGHTWALLETD_DIR)])
}
