import {isIP} from 'node:net'
import geoip from 'geoip-lite'

type LatLng = [number, number]

export function isPublicIp(ip: string): boolean {
	const version = isIP(ip)
	if (version === 4) {
		const [a, b] = ip.split('.').map(Number)
		if (a === 0 || a === 10 || a === 127) return false
		if (a === 169 && b === 254) return false
		if (a === 192 && b === 168) return false
		if (a === 172 && b >= 16 && b <= 31) return false
		if (a === 100 && b >= 64 && b <= 127) return false
		return true
	}
	if (version === 6) {
		const lower = ip.toLowerCase()
		if (lower === '::1' || lower === '::') return false
		if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return false
		if (lower.startsWith('::ffff:')) return isPublicIp(ip.slice(ip.lastIndexOf(':') + 1))
		return true
	}
	return false
}

export function publicIpToLatLng(ip: string, network: string): LatLng | null {
	if ((network !== 'ipv4' && network !== 'ipv6') || !isPublicIp(ip)) return null
	const geo = geoip.lookup(ip)
	if (!geo?.ll) return null
	return [geo.ll[0], geo.ll[1]]
}
