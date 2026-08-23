import {useState} from 'react'
import copy from 'copy-to-clipboard'
import {Copy, ExternalLink, LoaderCircle, ShieldCheck, TriangleAlert} from 'lucide-react'
import {useMutation, useQueryClient} from '@tanstack/react-query'

import {Alert, AlertDescription} from '@/components/ui/alert'
import {Button} from '@/components/ui/button'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {api} from '@/lib/api'
import type {ConnectionDetails, VizorHttpsStatus} from '#types'

function useSetVizorHttps() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (enabled: boolean) => api<ConnectionDetails>('/connect/vizor-https', {method: 'POST', body: {enabled}}),
		onSuccess: (data) => {
			qc.setQueryData(['connect', 'details'], data)
		},
	})
}

function CopyRow({label, value}: {label: string; value?: string}) {
	const blank = !value
	const [open, setOpen] = useState(false)
	return (
		<div className='h-[42px] grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 text-sm'>
			<span className='shrink-0 text-white'>{label}</span>
			<div className='flex min-w-0 items-center justify-end gap-2'>
				<span className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-normal text-white/60' title={value}>
					{value}
				</span>
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							disabled={blank}
							onClick={() => {
								if (blank) return
								copy(value)
								setOpen(true)
								setTimeout(() => setOpen(false), 600)
							}}
							className='h-4 w-4 shrink-0 p-0 hover:bg-transparent'
						>
							<Copy className='scale-75 text-white/70' />
						</Button>
					</PopoverTrigger>
					<PopoverContent
						side='top'
						align='center'
						className='w-auto rounded-md border border-white/20 bg-black/90 px-2 py-1 text-[12px] text-white'
					>
						Copied!
					</PopoverContent>
				</Popover>
			</div>
		</div>
	)
}

export function VizorHttpsCard({status, chainName}: {status?: VizorHttpsStatus; chainName: string}) {
	const toggle = useSetVizorHttps()
	const enabled = Boolean(status?.enabled)
	const state = status?.state ?? 'off'

	return (
		<div className='rounded-xl bg-white/6 px-4 py-4 space-y-3'>
			<div className='flex items-start justify-between gap-3'>
				<div>
					<h5 className='text-white/90 text-[14px] font-[500]'>Vizor HTTPS</h5>
					<p className='text-white/60 text-[13px] mt-1'>
						Release Vizor only accepts HTTPS with a public certificate (Mozilla webpki). Enable this to mint a Let’s
						Encrypt cert via Tailscale and put it in front of lightwalletd.
					</p>
				</div>
				<Button type='button' size='sm' disabled={toggle.isPending} onClick={() => toggle.mutate(!enabled)} className='shrink-0'>
					{toggle.isPending ? <LoaderCircle className='h-4 w-4 animate-spin' /> : null}
					{enabled ? 'Disable' : 'Enable'}
				</Button>
			</div>

			{state === 'needs_login' ? (
				<Alert className='bg-[#00BFA317] text-[#00BFA3] border-none'>
					<ExternalLink className='h-4 w-4' />
					<AlertDescription className='text-[#00BFA3]'>
						{status?.loginUrl ? (
							<>
								<a href={status.loginUrl} target='_blank' rel='noreferrer' className='underline underline-offset-2'>
									Log in to Tailscale
								</a>{' '}
								to issue the certificate. Keep this dialog open; the paste URL appears when login finishes.
							</>
						) : (
							'Waiting for a Tailscale login URL…'
						)}
					</AlertDescription>
				</Alert>
			) : null}

			{(state === 'starting' || state === 'issuing_cert') && (
				<p className='text-white/60 text-[13px]'>
					{state === 'issuing_cert' ? 'Issuing a Let’s Encrypt certificate…' : 'Starting Tailscale…'}
				</p>
			)}

			{state === 'ready' && status?.hostPort ? (
				<div className='space-y-2'>
					<Alert className='bg-[#00BFA317] text-[#00BFA3] border-none'>
						<ShieldCheck className='h-4 w-4' />
						<AlertDescription className='text-[#00BFA3]'>
							Paste this into Vizor as a custom lightwalletd endpoint. Set Vizor to {chainName}.
							{status.exposure === 'tailnet'
								? ' This URL is on your Tailnet — install Tailscale on the phone too, or enable Funnel in the Tailscale admin console.'
								: ' Funnel is on, so Vizor can reach this URL from the public internet.'}
						</AlertDescription>
					</Alert>
					<div className='divide-y divide-white/6 overflow-hidden rounded-xl bg-gradient-to-b from-[#1C1C1C] to-[#0D0D0D]'>
						<CopyRow label='Paste into Vizor' value={status.hostPort} />
						<CopyRow label='URI' value={status.uri} />
					</div>
				</div>
			) : null}

			{state === 'error' && status?.error ? (
				<Alert className='bg-[#EDCE0017] text-[#EDCE00] border-none'>
					<TriangleAlert className='h-4 w-4' />
					<AlertDescription className='text-[#EDCE00]'>{status.error}</AlertDescription>
				</Alert>
			) : null}

			{toggle.error ? <p className='text-red-400 text-[13px]'>{toggle.error.message}</p> : null}
		</div>
	)
}
