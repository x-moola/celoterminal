import * as React from 'react'
import { ContractKit } from '@celo/contractkit'
import { CancelPromise } from '../utils'
import kit from '../tx-runner/kit'

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
const useOnChainState = <T>(
	fetch:
		(kit: ContractKit, c: CancelPromise) => Promise<T>,
	deps: React.DependencyList,
) => {
	const [fetched, setFetched] = React.useState<T | undefined>(undefined)
	const [fetchError, setFetchError] = React.useState<Error | undefined>(undefined)
	const [isFetching, setIsFetching] = React.useState(true)
	const [fetchN, setFetchN] = React.useState(0)
	React.useEffect(() => {
		console.info(`useOnChainState: fetch initiated: ${fetchN}`)
		const c = new CancelPromise()
		setIsFetching(true)

		fetch(kit(), c)
		.then((a: T) => {
			c.isCancelled() || setFetched(a)
		})
		.catch((e) => {
			if (!c.isCancelled()) {
				setFetchError(e)
				setFetched(undefined)
			}
		})
		.finally(() => {
			console.info(`useOnChainState: fetch finished: ${fetchN}`)
			c.isCancelled() || setIsFetching(false)
		})
		return () => { c.cancel() }
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [fetchN, ...deps])

	const refetch = () => {
		setFetchN(fetchN + 1)
	}
	return {
		isFetching,
		fetched,
		fetchError,
		refetch,
	}
}
export default useOnChainState