import {useDeferredValue, useId} from 'react'
import {AreaChart, CartesianGrid, XAxis, YAxis, Area} from 'recharts'
import {formatDistanceStrict} from 'date-fns'

import {ChartContainer, ChartTooltip} from '@/components/ui/chart'

import {ChartCard, DEFAULT_CHART_MARGIN, DEFAULT_GRID_PROPS, makeXAxis, makeYAxis} from './ChartDefaults'
import {
	sliceLast24h,
	findClosestDataPoint,
	calculateHoursAgo,
	hoursToMs,
	hoursAxisFromData,
	formatLastHoursLabel,
} from '@/lib/chartHelpers'

import {useBlocks} from '@/hooks/useBlocks'
import {useSyncStatus} from '@/hooks/useSyncStatus'
import {syncStage} from '@/lib/sync-progress'

const SERIES = {
	p50: {label: '50th-percentile', color: 'hsl(42 90% 55%)'},
} as const

export default function FeeRateChart() {
	// IDs for the data series gradients
	const fillId = useId()
	const strokeId = useId()

	// Deterine if we're still in IBD (we won't query for data in IBD)
	const {data: syncStatus} = useSyncStatus()
	const stage = syncStage(syncStatus)
	const inIBD = stage !== 'synced' // 'pre-headers' | 'headers' | 'IBD'

	// Zcash targets ~75s blocks, so 200 blocks is ~4.2 hours. The x-axis follows that span.
	const {data: raw = [], isLoading} = useBlocks({limit: 200, stage})

	const {slice} = sliceLast24h(raw)

	const chartData = slice.map((p) => ({
		block: p.height,
		hoursAgo: calculateHoursAgo(p.time),
		p50: p.feeRates.p50,
	}))

	// Defer the data to avoid blocking the main thread and allow the chart to render immediately and the dock tab to animate smoothly
	const deferredData = useDeferredValue(chartData)
	const hoursAxis = hoursAxisFromData(deferredData.map((d) => d.hoursAgo))
	const title = deferredData.length ? `Median Fee · ${formatLastHoursLabel(hoursAxis.domainMax)}` : 'Median Fee'

	return (
		<ChartCard title={title} loading={isLoading} syncing={inIBD}>
			<ChartContainer config={SERIES}>
				<AreaChart data={deferredData} margin={DEFAULT_CHART_MARGIN}>
					{/* Gradient definitions */}
					<defs>
						{/* Gradient under the curve */}
						<linearGradient id={fillId} x1='0' y1='0' x2='0' y2='1'>
							<stop offset='0%' stopColor='hsla(42,90%,56%,0.30)' />
							<stop offset='100%' stopColor='hsla(42,90%,56%,0.02)' />
						</linearGradient>

						{/* Stroke gradient for the line: white at the top of the chart, gold lower down */}
						<linearGradient id={strokeId} gradientUnits='userSpaceOnUse' x1='0' x2='0' y1='100%' y2='0'>
							<stop offset='0%' stopColor='hsla(42, 90%, 56%, 0.3)' />
							<stop offset='70%' stopColor='hsla(42, 90%, 56%, 1)' />
							<stop offset='100%' stopColor='hsla(0, 0%, 100%, 1)' />
						</linearGradient>
					</defs>

					{/* TODO: modularize this tooltip */}
					<ChartTooltip
						cursor={false}
						wrapperStyle={{outline: 'none'}} // remove default focus ring
						content={({active, payload}) => {
							if (!active || !payload?.length) return null

							const d = payload[0].payload
							const ageMs = hoursToMs(d.hoursAgo)

							return (
								<div className='rounded-md border border-white/10 bg-black/90 p-2 text-[12px] text-white'>
									{/* Tooltip header*/}
									<div className='border-b border-white/10 pb-1 mb-1'>
										{/* Block height*/}
										<div className='flex items-center gap-2 '>
											<span className='text-white/60'>Block</span>
											<span className='ml-auto font-mono tabular-nums'>{d.block}</span>
										</div>

										{/* Age (hours ago) */}
										<div className='flex items-center gap-2'>
											<span className='text-white/60'>Age</span>
											<span className='ml-auto font-mono tabular-nums'>{formatDistanceStrict(0, ageMs)}</span>
										</div>
									</div>

									{/* Fee Rate */}
									<div className='flex items-center gap-2'>
										<span className='text-white/60'>Median fee</span>
										<span className='ml-auto font-mono tabular-nums text-[#F4B728]'>
											{Number(d.p50).toLocaleString()} zat
										</span>
									</div>
								</div>
							)
						}}
					/>

					{/* axes / grid / data */}
					<CartesianGrid {...DEFAULT_GRID_PROPS} />

					<YAxis {...makeYAxis('zat')} domain={[0, (dataMax: number) => Math.ceil(dataMax) + 1]} />

					{/* Main x-axis that we plot against (hours-ago) */}
					<XAxis
						// {...makeXAxis(`Blocks ${minBlock?.toLocaleString()} – ${maxBlock?.toLocaleString()} (last 24h)`)}
						{...makeXAxis('')}
						type='number'
						dataKey='hoursAgo'
						domain={hoursAxis.domain}
						ticks={hoursAxis.ticks}
						tickFormatter={(h) => (h === 0 ? 'now' : `-${h} h`)}
						reversed
					/>

					{/* Secondary x-axis that shows block-height labels */}
					<XAxis
						orientation='bottom'
						xAxisId='height'
						type='number'
						// reuses the same scale as the "hours-ago" axis
						dataKey='hoursAgo'
						ticks={hoursAxis.heightTicks}
						// map each tick's hours-ago value to the nearest datapoint's block-height for a pseudo-accurate label
						tickFormatter={(h) => {
							const closest = findClosestDataPoint(deferredData, h, (item) => item.hoursAgo)
							return closest?.block ? Number(closest.block).toLocaleString() : ''
						}}
						axisLine={false}
						tickLine={false}
						reversed
					/>

					<Area
						dataKey='p50'
						type='monotone'
						/* gradient under the curve */
						fill={`url(#${fillId})`}
						fillOpacity={1}
						/* gradient of the line */
						stroke={`url(#${strokeId})`}
						strokeWidth={1.25}
						isAnimationActive={false}
					/>
				</AreaChart>
			</ChartContainer>
		</ChartCard>
	)
}
