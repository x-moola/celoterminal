import { ContractKit } from '@celo/contractkit'
import { toTransactionObject } from '@celo/connect'
import { concurrentMap } from '@celo/utils/lib/async'

import { Account } from '../../../lib/accounts/accounts'
import { TXFunc, TXFinishFunc } from '../../components/app-definition'
import { MultiSig } from './def'
import useOnChainState from '../../state/onchain-state'

import * as React from 'react'
import { Tab } from '@material-ui/core'
import Alert from '@material-ui/lab/Alert'
import TabContext from '@material-ui/lab/TabContext'
import TabList from '@material-ui/lab/TabList'
import TabPanel from '@material-ui/lab/TabPanel'

import AppContainer from '../../components/app-container'
import AppHeader from '../../components/app-header'
import AppSection from '../../components/app-section'
import SectionTitle from '../../components/section-title'
import { OwnersTable, SignaturesTable } from './owners'
import { TransactionsTable } from './transactions'
import { parseTXs } from './parse-txs'

const MultiSigApp = (props: {
	accounts: Account[],
	selectedAccount: Account,
	runTXs: (f: TXFunc, onFinish?: TXFinishFunc) => void,
}): JSX.Element => {
	const account = props.selectedAccount
	const {
		fetched,
		isFetching,
		refetch,
	} = useOnChainState(React.useCallback(
		async (kit: ContractKit) => {
			if (account.type !== "multisig") {
				return {}
			}
			const multiSig = await kit.contracts.getMultiSig(account.address)
			const transactionsN = await multiSig.totalTransactionCount()
			const [
				_transactions,
				owners,
				requiredSignatures,
				internalRequiredSignatures,
			] = await Promise.all([
				concurrentMap(
					10,
					Array.from(Array(transactionsN).keys()),
					(idx) => { return multiSig.getTransaction(idx) }
				),
				multiSig.getOwners(),
				multiSig.getRequired(),
				multiSig.getInternalRequired(),
			])

			const transactions = _transactions.map((t, idx) => ({...t, idx: idx}))
			const pendingTXsRaw = transactions.filter((t) => !t.executed)
			const pendingTXs = await parseTXs(kit, pendingTXsRaw)
			return {
				transactions,
				pendingTXs,
				owners,
				requiredSignatures,
				internalRequiredSignatures,
			}
		},
		[account]
	))
	const [tab, setTab] = React.useState("transactions")

	const handleAddOwner = (newOwner: string) => {
		props.runTXs(
			async (kit: ContractKit) => {
				const multiSig = await kit._web3Contracts.getMultiSig(account.address)
				const tx = toTransactionObject(
					kit.connection,
					multiSig.methods.addOwner(newOwner))
				return [{tx: tx}]
			},
			() => { refetch() },
		)
	}
	const handleRemoveOwner = (owner: string) => {
		props.runTXs(
			async (kit: ContractKit) => {
				const multiSig = await kit._web3Contracts.getMultiSig(account.address)
				const tx = toTransactionObject(
					kit.connection,
					multiSig.methods.removeOwner(owner))
				return [{tx: tx}]
			},
			() => { refetch() },
		)
	}
	const handleReplaceOwner = (owner: string, newOwner: string) => {
		props.runTXs(
			async (kit: ContractKit) => {
				const multiSig = await kit._web3Contracts.getMultiSig(account.address)
				const tx = toTransactionObject(
					kit.connection,
					multiSig.methods.replaceOwner(owner, newOwner))
				return [{tx: tx}]
			},
			() => { refetch() },
		)
	}
	const handleChangeRequiredSignatures = (signatures: number) => {
		props.runTXs(
			async (kit: ContractKit) => {
				const multiSig = await kit._web3Contracts.getMultiSig(account.address)
				const tx = toTransactionObject(
					kit.connection,
					multiSig.methods.changeRequirement(signatures))
				return [{tx: tx}]
			},
			() => { refetch() },
		)
	}
	const handleChangeInternalRequiredSignatures = (signatures: number) => {
		props.runTXs(
			async (kit: ContractKit) => {
				const multiSig = await kit._web3Contracts.getMultiSig(account.address)
				const tx = toTransactionObject(
					kit.connection,
					multiSig.methods.changeInternalRequirement(signatures))
				return [{tx: tx}]
			},
			() => { refetch() },
		)
	}

	const handleExecuteTX = (txIdx: number) => {
		props.runTXs(
			async (kit: ContractKit) => {
				const multiSig = await kit._web3Contracts.getMultiSig(account.address)
				const tx = toTransactionObject(
					kit.connection,
					multiSig.methods.executeTransaction(txIdx))
				return [{tx: tx, executeUsingParentAccount: true}]
			},
			() => { refetch() },
		)
	}
	const handleConfirmTX = (txIdx: number) => {
		props.runTXs(
			async (kit: ContractKit) => {
				const multiSig = await kit._web3Contracts.getMultiSig(account.address)
				const tx = toTransactionObject(
					kit.connection,
					multiSig.methods.confirmTransaction(txIdx))
				return [{tx: tx, executeUsingParentAccount: true}]
			},
			() => { refetch() },
		)
	}
	const handleRevokeTX = (txIdx: number) => {
		props.runTXs(
			async (kit: ContractKit) => {
				const multiSig = await kit._web3Contracts.getMultiSig(account.address)
				const tx = toTransactionObject(
					kit.connection,
					multiSig.methods.revokeConfirmation(txIdx))
				return [{tx: tx, executeUsingParentAccount: true}]
			},
			() => { refetch() },
		)
	}

	return (
		<AppContainer>
			<AppHeader app={MultiSig} isFetching={isFetching} refetch={refetch} />
			{account.type !== "multisig" ?
			<AppSection>
				<Alert severity="info">
					Select MultiSig type account using the account selector. You can create
					or import MultiSig accounts in the Accounts app.
				</Alert>
			</AppSection> : fetched && <>
			<TabContext value={tab}>
				<AppSection innerPadding={0}>
					<TabList onChange={(e, v) => { setTab(v) }}>
						<Tab label="Transactions" value={"transactions"} />
						<Tab label="Owners" value={"owners"} />
					</TabList>
					<TabPanel value="transactions">
						{!fetched?.pendingTXs?.length ?
						<Alert severity="info">
							There are no pending transactions.
						</Alert> :
						<TransactionsTable
							account={account}
							requiredSignatures={fetched.requiredSignatures.toNumber()}
							internalRequiredSignatures={fetched.internalRequiredSignatures.toNumber()}
							pendingTXs={fetched.pendingTXs}
							onExecute={handleExecuteTX}
							onConfirm={handleConfirmTX}
							onRevoke={handleRevokeTX}
						/>}
					</TabPanel>
					<TabPanel value="owners">
						<OwnersTable
							owners={fetched.owners || []}
							onAdd={handleAddOwner}
							onRemove={handleRemoveOwner}
							onReplace={handleReplaceOwner}
						/>
					</TabPanel>
				</AppSection>
				{tab === "owners" && <>
				<AppSection>
					<SectionTitle>Required signatures</SectionTitle>
					<SignaturesTable
						requiredSignatures={fetched?.requiredSignatures?.toNumber() || 0}
						internalRequiredSignatures={fetched?.internalRequiredSignatures?.toNumber() || 0}
						onChangeRequiredSignatures={handleChangeRequiredSignatures}
						onChangeInternalRequiredSignatures={handleChangeInternalRequiredSignatures}
					/>
				</AppSection>
				</>}
			</TabContext>
			</>}
		</AppContainer>
	)
}
export default MultiSigApp
