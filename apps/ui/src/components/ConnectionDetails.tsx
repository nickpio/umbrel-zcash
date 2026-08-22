import {useState} from 'react'
import QrSvg from '@wojtekmaj/react-qr-svg'
import copy from 'copy-to-clipboard'
import {Copy, TriangleAlert, LockKeyhole, X as XIcon} from 'lucide-react'
import {motion, AnimatePresence} from 'framer-motion'

import UmbrelLogo from '@/assets/umbrel-logo.svg?react'

import {Alert, AlertDescription} from '@/components/ui/alert'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import {Tabs, TabsList, TabsTrigger, TabsContent} from '@/components/ui/tabs'
import {Button} from '@/components/ui/button'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'

import WalletIcon from '@/assets/wallet.svg?react'
import {GradientBorderFromTop} from '@/components/shared/GradientBorders'
import FadeScrollArea from '@/components/shared/FadeScrollArea'

import type {ConnectionDetails as ConnectionDetailsType} from '#types'
import {useConnectionDetails} from '@/hooks/useConnectionDetails'

type TabId = 'wallet' | 'rpc' | 'p2p'

export default function ConnectionDetails() {
	const {data} = useConnectionDetails()

	const [tab, setTab] = useState<TabId>('wallet')
	const [net, setNet] = useState<'tor' | 'local'>('tor')

	const details = data?.[tab]?.[net] ?? {}
	const conn = details as Partial<ConnectionDetailsType['rpc']['tor']>

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button className='cursor-pointer rounded-full bg-button-gradient backdrop-blur-xl'>
					<GradientBorderFromTop />
					<WalletIcon className='w-5 h-5 text-[#969696]' />
					<span className='text-[13px] text-white/80 font-[500]'>Connect</span>
				</Button>
			</DialogTrigger>
			<DialogContent
				className='bg-card-gradient backdrop-blur-2xl border-white/10 border-[0.5px] rounded-2xl max-h-[90vh] flex flex-col sm:max-w-[768px]'
				showCloseButton={false}
			>
				<GradientBorderFromTop />
				<DialogClose asChild>
					<button className='absolute top-4 right-4 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors'>
						<XIcon className='w-3 h-3 text-white/70' />
					</button>
				</DialogClose>
				<DialogHeader>
					<DialogTitle className='font-outfit text-white text-[20px] font-[400] text-left'>
						<div className='flex items-center gap-2'>
							<WalletIcon className='w-5 h-5 text-white' />
							Connect to Zcash Node
						</div>
					</DialogTitle>
					<DialogDescription className='text-white/60 text-left text-[13px]'>
						Point a shielded wallet at this node’s lightwalletd server—the same idea as connecting a Bitcoin wallet to
						Electrum, or a Monero wallet to your own daemon.
					</DialogDescription>
				</DialogHeader>

				<Tabs value={tab} onValueChange={(v: string) => setTab(v as TabId)}>
					<div className='relative w-full after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-white/20'>
						<TabsList className='relative flex bg-transparent rounded-none h-auto p-0 gap-1 z-10 w-max'>
							<TabsTrigger
								value='wallet'
								className='relative text-[12px] bg-transparent border-none data-[state=active]:text-white data-[state=active]:bg-transparent data-[state=inactive]:text-white/60 focus-visible:outline-none focus:outline-none focus:ring-0 rounded-none hover:text-white/80 transition-none pb-3 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-transparent data-[state=active]:after:bg-white'
							>
								Wallet
							</TabsTrigger>
							<TabsTrigger
								value='rpc'
								className='relative text-[12px] bg-transparent border-none data-[state=active]:text-white data-[state=active]:bg-transparent data-[state=inactive]:text-white/60 focus-visible:outline-none focus:outline-none focus:ring-0 rounded-none hover:text-white/80 transition-none pb-3 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-transparent data-[state=active]:after:bg-white'
							>
								RPC Details
							</TabsTrigger>
							<TabsTrigger
								value='p2p'
								className='relative text-[12px] bg-transparent border-none data-[state=active]:text-white data-[state=active]:bg-transparent data-[state=inactive]:text-white/60 focus-visible:outline-none focus:outline-none focus:ring-0 rounded-none hover:text-white/80 transition-none pb-3 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-transparent data-[state=active]:after:bg-white'
							>
								P2P Details
							</TabsTrigger>
						</TabsList>
					</div>

					<FadeScrollArea className='h-[min(480px,calc(90vh-200px))]'>
						<div className='space-y-4 mt-4 flex'>
							<TabsContent value='wallet' className='mt-0 min-h-[360px]'>
								<div className='flex flex-col sm:flex-row gap-4'>
									<ConnectionTypeAndQrCard net={net} setNet={setNet} conn={conn} />
									<div className='divide-y divide-white/6 overflow-hidden rounded-xl w-full h-fit bg-gradient-to-b from-[#1C1C1C] to-[#0D0D0D]'>
										<Field label='Host' value={conn.host} />
										<Field label='Port' value={conn.port?.toString()} />
										<Field label='URI' value={conn.uri} />
									</div>
								</div>
								<div className='mt-4 space-y-3'>
									<Alert className='bg-[#EDCE0017] text-[#EDCE00] border-none'>
										<TriangleAlert className='h-4 w-4' />
										<AlertDescription className='text-[#EDCE00]'>
											lightwalletd is served without TLS on your LAN and Tor hidden service. That is the usual setup for a
											self-hosted node. Prefer the Tor address when you are off your home network.
										</AlertDescription>
									</Alert>
									<div className='divide-y divide-white/6 overflow-hidden rounded-xl bg-white/6 px-4 py-4 space-y-3'>
										<h5 className='text-white/80 text-[14px] font-[500]'>Wallet setup</h5>
										<ol className='text-white/70 text-[13px] font-[400] space-y-2 list-decimal list-inside'>
											<li>
												<span className='text-white/90'>Zodl:</span> Settings → Connect to a server → custom, then enter
												the host and port above.
											</li>
											<li>
												<span className='text-white/90'>Ywallet:</span> Settings → lightwalletd server, then paste the
												URI.
											</li>
											<li>
												<span className='text-white/90'>Zingo:</span>{' '}
												<code className='text-white/80'>zingo-cli --server {conn.uri || 'http://host:9067'}</code>
											</li>
										</ol>
										<p className='text-white/60 text-[13px]'>
											Wait until this node has finished syncing and lightwalletd has ingested the chain before connecting
											a wallet.
										</p>
									</div>
								</div>
							</TabsContent>

							<TabsContent value='rpc' className='mt-0 min-h-[360px]'>
								<div className='flex flex-col sm:flex-row gap-4'>
									<ConnectionTypeAndQrCard net={net} setNet={setNet} conn={conn} />
									<div className='divide-y divide-white/6 overflow-hidden rounded-xl w-full h-fit bg-gradient-to-b from-[#1C1C1C] to-[#0D0D0D]'>
										<Field label='Host' value={conn.host} />
										<Field label='Port' value={conn.port?.toString()} />
										<Field label='URI' value={conn.uri} />
									</div>
								</div>
								{net === 'local' && (
									<div className='mt-4'>
										<LocalRPCAlert net={net} />
									</div>
								)}
							</TabsContent>

							<TabsContent value='p2p' className='mt-0 min-h-[360px]'>
								<div className='flex flex-col sm:flex-row gap-4'>
									<ConnectionTypeAndQrCard net={net} setNet={setNet} conn={conn} />
									<div className='divide-y divide-white/6 overflow-hidden rounded-xl w-full h-fit bg-gradient-to-b from-[#1C1C1C] to-[#0D0D0D]'>
										<Field label='Host' value={conn.host} />
										<Field label='Port' value={conn.port?.toString()} />
									</div>
								</div>
							</TabsContent>
						</div>
					</FadeScrollArea>
				</Tabs>
			</DialogContent>
		</Dialog>
	)
}

function Field({label, value}: {label: string; value?: string}) {
	const blank = !value
	const [open, setOpen] = useState(false)

	const handleCopy = () => {
		if (blank) return
		copy(value!)
		setOpen(true)
		setTimeout(() => setOpen(false), 600)
	}

	return (
		<div className='h-[42px] grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 text-sm'>
			<span className='shrink-0 text-white'>{label}</span>

			<div className='flex min-w-0 items-center justify-end gap-2'>
				<span
					className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-normal text-white/60'
					title={value}
				>
					{value}
				</span>

				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							onClick={handleCopy}
							disabled={blank}
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

function QR({value}: {value?: string}) {
	if (!value) {
		return <div className='flex h-[196px] w-[196px] m-auto mb-4 items-center rounded-md bg-white/5' />
	}

	return (
		<div className='relative flex justify-center'>
			<div className='p-2 rounded-md'>
				<QrSvg
					value={value}
					width={200}
					height={200}
					level='Q'
					fgColor='#B8860B'
					bgColor='transparent'
					cellClassPrefix='qrPx'
					style={{display: 'block', shapeRendering: 'crispEdges'}}
				/>
			</div>

			<div className='absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 p-2 shadow-md pointer-events-none select-none bg-[#1C1C1C]'>
				<div className='w-full h-full flex items-center justify-center bg-white/10 rounded-md p-1.5'>
					<UmbrelLogo className='w-full h-full text-white' />
				</div>
			</div>

			<style>{`
        .qrPx-filled {
          stroke: #F4B728 !important;
          stroke-width: 0.5px !important;
          stroke-linejoin: miter;
          vector-effect: non-scaling-stroke;
        }
      `}</style>
		</div>
	)
}

function ConnectionTypeAndQrCard({
	net,
	setNet,
	conn,
}: {
	net: string
	setNet: (v: 'tor' | 'local') => void
	conn: Partial<ConnectionDetailsType['rpc']['tor']>
}) {
	return (
		<div className='bg-gradient-to-b from-[#1C1C1C] to-[#0D0D0D] p-5 rounded-xl'>
			<h3 className='text-white/60 text-[12px] font-[400] mb-2 text-center'>Connection Type</h3>
			<Tabs value={net} onValueChange={(v: string) => setNet(v as 'tor' | 'local')} className='w-[200px] mx-auto mb-3'>
				<TabsList className='relative flex w-full rounded-md bg-[#121212] backdrop-blur-xl p-1 ring-white/10'>
					<GradientBorderFromTop />

					<TabsTrigger
						value='local'
						className='relative cursor-pointer rounded-md py-2 px-4 text-[12px] font-[400] text-white/60 data-[state=active]:text-white transition-colors data-[state=active]:bg-transparent'
					>
						{net === 'local' && (
							<motion.span
								layoutId='connection-pill'
								className='absolute inset-0 -z-10 rounded-sm bg-[#252525]'
								transition={{type: 'tween', ease: 'easeInOut', duration: 0.2}}
							>
								<GradientBorderFromTop />
							</motion.span>
						)}
						Local
					</TabsTrigger>

					<TabsTrigger
						value='tor'
						className='relative cursor-pointer rounded-md py-2 px-4 text-[12px] font-[400] text-white/60 data-[state=active]:text-white transition-colors data-[state=active]:bg-transparent'
					>
						{net === 'tor' && (
							<motion.span
								layoutId='connection-pill'
								className='absolute inset-0 -z-10 rounded-sm bg-[#252525]'
								transition={{type: 'tween', ease: 'easeInOut', duration: 0.2}}
							>
								<GradientBorderFromTop />
							</motion.span>
						)}
						Tor
					</TabsTrigger>
				</TabsList>
			</Tabs>
			<QR value={conn.uri} />
		</div>
	)
}

function LocalRPCAlert({net}: {net: string}) {
	return (
		<AnimatePresence>
			{net === 'local' && (
				<motion.div
					initial={{opacity: 0, y: 10}}
					animate={{opacity: 1, y: 0}}
					exit={{opacity: 0, y: -10}}
					transition={{duration: 0.25}}
					className='flex flex-col gap-3'
				>
					<Alert className='bg-[#EDCE0017] text-[#EDCE00] border-none'>
						<TriangleAlert className='h-4 w-4' />
						<AlertDescription className='text-[#EDCE00]'>
							Zebra’s JSON-RPC has cookie auth disabled so lightwalletd can connect. Do not expose port 8232 to the
							public internet.
						</AlertDescription>
					</Alert>

					<Alert className='bg-[#00BFA317] text-[#00BFA3] border-none'>
						<LockKeyhole className='h-4 w-4' />
						<AlertDescription className='text-[#00BFA3]'>
							Apps on the same Umbrel device stay on the local Docker network and never leave the machine.
						</AlertDescription>
					</Alert>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
