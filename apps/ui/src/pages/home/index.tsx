import {motion, AnimatePresence} from 'framer-motion'
import {Info as InfoIcon} from 'lucide-react'
import {formatUptimeMs} from '@/lib/formatUptime'
import {useState, useEffect} from 'react'

import {Card, CardContent} from '@/components/ui/card'
import {GradientBorderTopBottom, GradientBorderFromCorners} from '@/components/shared/GradientBorders'
import InfoDialog from '@/components/shared/InfoDialog'
import HorizontalFadeScroll from '@/components/shared/HorizontalFadeScroll'
import Globe from './Globe'
import PeersChart from './PeersChart'
import StatusDot from './StatusDot'
import Blocks from './Blocks'
import GlobeInfo from './GlobeInfo'

import {useBitcoindStatus} from '@/hooks/useBitcoind'
import {useSyncStatus} from '@/hooks/useSyncStatus'
import {calcSyncPercent, syncStage} from '@/lib/sync-progress'

export default function HomePage() {
	const {data: status, isError, isLoading: isStatusLoading} = useBitcoindStatus()
	const {data: syncStatus, isLoading} = useSyncStatus()

	// Responsive Globe sizing
	const [globeSize, setGlobeSize] = useState(650)

	useEffect(() => {
		const updateGlobeSize = () => {
			if (window.innerWidth >= 768) {
				// md tailwind breakpoint. This is is wehre the peers chart goes below the globe and we hide blocks.
				setGlobeSize(650)
			} else if (window.innerWidth >= 500) {
				// this is a bit of a weird view that most people won't ever see unless they are half screen on their laptop.
				setGlobeSize(1000)
			} else {
				// for mobile view
				setGlobeSize(700)
			}
		}

		updateGlobeSize() // Initial size
		window.addEventListener('resize', updateGlobeSize)
		return () => window.removeEventListener('resize', updateGlobeSize)
	}, [])

	const running = !isError && status?.running === true
	const uptime = running && status?.startedAt ? formatUptimeMs(Date.now() - new Date(status.startedAt).getTime()) : null

	const percentSynced = calcSyncPercent(syncStatus)
	const stage = syncStage(syncStatus)

	let syncSubtitle: React.ReactNode | null = null
	let dialogContent: {title: string; description: string} | null = null

	switch (stage) {
		case 'pre-headers':
			syncSubtitle = (
				<span className='relative inline-block select-none'>
					<span className=''>Starting checkpoint sync</span>
					<span aria-hidden className='absolute inset-0 animate-shimmer pointer-events-none'>
						Starting checkpoint sync
					</span>
				</span>
			)
			dialogContent = {
				title: 'Starting Checkpoint Sync',
				description:
					'Zebra is connecting to peers and preparing to download checkpointed block history. This first stage is usually quick.',
			}
			break
		case 'headers':
			syncSubtitle = `${syncStatus?.blockHeight} of ${syncStatus?.estimatedHeight || syncStatus?.validatedHeaderHeight} blocks`
			dialogContent = {
				title: 'Downloading Checkpoints',
				description:
					'Zebra is downloading and verifying checkpointed blocks in parallel. After this stage it continues with full consensus verification up to the tip.',
			}
			break
		default:
			syncSubtitle = `${syncStatus?.blockHeight} of ${syncStatus?.estimatedHeight || syncStatus?.validatedHeaderHeight} blocks`
			dialogContent = {
				title: 'Synchronizing Blocks',
				description:
					'Zebra is downloading blocks from peers and fully verifying each one against Zcash consensus rules. The percentage reflects verified work, not just the count of blocks on disk.',
			}
			break
	}

	return (
		<>
			<Card className='bg-card-gradient backdrop-blur-2xl border-none mb-5 pt-4 pb-0 md:pb-4 rounded-3xl'>
				<GradientBorderTopBottom depth='7%' />
				<CardContent className='flex flex-col md:flex-row px-4 items-center'>
					{/* Peers Globe + statuses */}
					<div className='relative w-full flex-none md:flex-1 h-64 md:h-[375px] rounded-2xl bg-neutral-900/20 border-white/10 border-[0.5px] overflow-hidden'>
						<div className='absolute top-[-50%] left-[-40%] w-[500%] h-[500%] rounded-full bg-black pointer-events-none' />
						<GradientBorderFromCorners />

						<div className='relative md:top-[-20%] md:right-[-5%] sm:top-[-40%] sm:right-[20%] top-[-25%] right-[40%]'>
							<Globe width={globeSize} height={globeSize} />
						</div>

						{/* Running status */}
						<AnimatePresence mode='wait'>
							{/* Only show status when we have data (not loading) */}
							{!isStatusLoading && (
								<motion.h3
									// the key prop tells Motion when state flips
									key={running ? 'running' : 'stopped'}
									initial={{opacity: 0}}
									animate={{opacity: 1}}
									exit={{opacity: 0}}
									transition={{duration: 0.25}}
									className='absolute top-[7%] left-[5%] flex items-center gap-1 justify-center pointer-events-none select-none'
								>
									<StatusDot running={running} />

									{running ? (
										<>
											<span className='text-[#0BC39E] text-[14px] font-[500] ml-1'>Running</span>
											{uptime && <span className='text-white/60 text-[14px] font-[400]'>for {uptime}</span>}
										</>
									) : (
										<span className='text-[#EF4444] text-[14px] font-[500] ml-1'>Not running</span>
									)}
								</motion.h3>
							)}
						</AnimatePresence>

						<div className='absolute top-3 right-3'>
							<GlobeInfo />
						</div>

						{/* Sync status */}
						<AnimatePresence mode='wait'>
							{/* We don't show if not running or isLoading */}
							{running && !isLoading && (
								<motion.h2
									key='sync-banner'
									initial={{opacity: 0}}
									animate={{opacity: 1}}
									exit={{opacity: 0}}
									transition={{duration: 0.25}}
									className='absolute top-[70%] md:top-[80%] left-[5%] text-[30px] pointer-events-none select-none'
								>
									{syncSubtitle && percentSynced < 100 ? (
										<div className='text-[14px] text-white/50 flex items-center gap-1'>
											<span>{syncSubtitle}</span>
											{dialogContent && (
												<InfoDialog
													// we still need pointer events for the dialog to work
													trigger={
														<InfoIcon className='w-3 h-3 text-white/50 hover:text-white/80 transition-colors pointer-events-auto' />
													}
													title={dialogContent.title}
													description={dialogContent.description}
												/>
											)}
										</div>
									) : (
										<div className='text-[14px] text-white/50 flex items-center gap-1'>
											<span>Blockchain</span>
										</div>
									)}
									<span className='bg-text-gradient bg-clip-text text-transparent font-[500]'>
										{percentSynced === 100 ? 'Synchronized' : 'Synchronizing'}&nbsp;
									</span>
									<span className='text-white/60'>{percentSynced}%</span>
									{percentSynced === 100 && syncStatus && !syncStatus.walletReady && (
										<div className='text-[14px] text-white/40 font-[400] mt-1'>Wallet server starting…</div>
									)}
								</motion.h2>
							)}
						</AnimatePresence>
					</div>

					{/* Peers chart- to the right on desktop and below on mobile */}
					<div className='w-full md:w-[215px] flex flex-col items-center mt-4 md:mt-0 pb-7 md:pb-0'>
						<PeersChart />
					</div>
				</CardContent>
			</Card>

			{/* Blocks — horizontally scrollable on mobile */}
			<div className='w-full mt-4'>
				<span className='text-white/50 text-[14px] font-[400] ml-4'>Latest Blocks</span>
				<HorizontalFadeScroll>
					<Blocks />
				</HorizontalFadeScroll>
			</div>
		</>
	)
}
