import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogCancel,
	AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {type SettingsSchema} from '#settings'

interface SaveSettingsDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSave: () => void
	initialSettings?: SettingsSchema
	formValues: SettingsSchema
}

export default function SaveSettingsDialog({open, onOpenChange, onSave}: SaveSettingsDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className='bg-card-gradient backdrop-blur-2xl border-white/10 border-[0.5px] rounded-2xl'>
				<AlertDialogHeader>
					<AlertDialogTitle className='font-outfit text-white text-[20px] font-[400] text-left'>
						Save changes?
					</AlertDialogTitle>
					<AlertDialogDescription className='text-white/60 text-left text-[13px] space-y-3'>
						<span className='text-[13px]'>Zebra and lightwalletd will restart to apply these settings.</span>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel className='bg-white/90 hover:bg-white'>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={() => {
							onOpenChange(false)
							onSave()
						}}
						className='hover:bg-white/10'
					>
						Yes
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
