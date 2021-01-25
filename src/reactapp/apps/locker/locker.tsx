import * as React from 'react'
import { ContractKit } from '@celo/contractkit'

import Button from '@material-ui/core/Button'
import LinearProgress from '@material-ui/core/LinearProgress'
import Typography from '@material-ui/core/Typography'
import TextField from '@material-ui/core/TextField'
import Box from '@material-ui/core/Box'

import { Account } from '../../../common/accounts'
import useOnChainState from '../../state/onchain-state'
import { fmtCELOAmt } from '../../utils'
import { TXFunc, TXFinishFunc } from '../../tx-runner/tx-runner'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const LockerApp = (props: {
	accounts: Account[],
	selectedAccount: Account,
	runTXs: (f: TXFunc, onFinish?: TXFinishFunc) => void,
	onError: (e: Error) => void,
}): JSX.Element => {
	const {
		isFetching,
		fetched,
		fetchError,
		refetch,
	} = useOnChainState(async (kit: ContractKit) => {
		const goldToken = await kit.contracts.getGoldToken()
		const lockedGold = await kit.contracts.getLockedGold()
		const accounts = await kit.contracts.getAccounts()

		const isAccount = await accounts.isAccount(props.selectedAccount.address)
		if (!isAccount) {
			return { isAccount }
		}
		const totalCELO = await goldToken.balanceOf(props.selectedAccount.address)
		const totalLocked = await lockedGold.getAccountTotalLockedGold(props.selectedAccount.address)
		const pendingWithdrawals = await lockedGold.getPendingWithdrawals(props.selectedAccount.address)
		return {
			isAccount,
			totalCELO,
			totalLocked,
			pendingWithdrawals,
		}
	}, [props.selectedAccount.address])
	const onError = props.onError
	React.useEffect(() => {
		if (fetchError) {
			onError(fetchError)
		}
	}, [fetchError, onError])
	const [toUnlock, setToUnlock] = React.useState("0")
	const [toLock, setToLock] = React.useState("0")

	const createLockTXs: TXFunc = async (kit: ContractKit) => {
		const lockedGold = await kit.contracts.getLockedGold()
		const tx = lockedGold.lock()
		return [{
			tx: tx,
			value: toLock,
		}]
	}
	const runTXs = (f: TXFunc) => {
		props.runTXs(f, () => { refetch() })
	}

	return (
		<div style={{display: "flex", flex: 1}}>
			{isFetching || <LinearProgress />}
			{fetched &&
			(!fetched.isAccount ?
			<div>
				<Button>Register Account</Button>
			</div>
			:
			<div style={{display: "flex", flex: 1, flexDirection: "column"}}>
				<Box p={2}>
					<Typography>CELO Balance: {fmtCELOAmt(fetched.totalCELO)}</Typography>
					<div style={{display: "flex", flexDirection: "row"}}>
						<TextField
								autoFocus
								margin="dense"
								label={`Lock (max: ${fmtCELOAmt(fetched.totalCELO)})`}
								variant="outlined"
								value={toLock}
								size="medium"
								type="number"
								fullWidth={true}
								// style={{marginTop: 20}}
								onChange={(e) => { setToLock(e.target.value) }}
							/>
						<Button onClick={() => { runTXs(createLockTXs) }}>Lock</Button>
					</div>
				</Box>
				<Box p={2}>
					<Typography>CELO Locked: {fmtCELOAmt(fetched.totalLocked)}</Typography>
					<div style={{display: "flex", flexDirection: "row"}}>
						<TextField
								autoFocus
								margin="dense"
								label={`Unlock (max: ${fmtCELOAmt(fetched.totalLocked)})`}
								variant="outlined"
								value={toUnlock}
								size="medium"
								type="number"
								fullWidth={true}
								// style={{marginTop: 20}}
								onChange={(e) => { setToUnlock(e.target.value) }}
							/>
						<Button>Unlock</Button>
					</div>
					<Typography>Pending withdrawals: {fetched.pendingWithdrawals.length}</Typography>
				</Box>
			</div>)}
		</div>
	)
}