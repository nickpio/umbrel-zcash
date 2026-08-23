export function renderCaddyfile(opts: {listenPort: string; certPath: string; keyPath: string; lwdPort: string}): string {
	return `{
	admin off
	auto_https off
}

https://:${opts.listenPort} {
	bind 127.0.0.1
	tls ${opts.certPath} ${opts.keyPath}
	reverse_proxy h2c://127.0.0.1:${opts.lwdPort} {
		flush_interval -1
		transport http {
			versions h2c 2
		}
	}
}
`
}
