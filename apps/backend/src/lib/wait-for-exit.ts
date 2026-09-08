import type {ChildProcess} from 'node:child_process'

// Resolves on `exit` or `close`, whichever comes first. A child that failed to
// spawn only ever emits `error` + `close`, so waiting on `exit` alone can hang.
export function waitForExit(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
	return new Promise((resolve) => {
		const done = () => {
			child.off('exit', done)
			child.off('close', done)
			resolve()
		}
		child.once('exit', done)
		child.once('close', done)
	})
}
