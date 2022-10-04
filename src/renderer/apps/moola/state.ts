import * as React from "react";
import { AbiItem } from "@celo/connect";
import { ContractKit } from "@celo/contractkit";
import useOnChainState from "../../state/onchain-state";
import { Account } from "../../../lib/accounts/accounts";
import { selectAddressOrThrow } from "../../../lib/cfg";

import { abi as LendingPoolAddressesProviderABI } from "./abi/AddressesProvider.json";
import { abi as LendingPoolABI } from "./abi/LendingPool.json";
import { abi as LendingPoolDataProviderABI } from "./abi/DataProvider.json";
import {
	autoRepayAddresses,
	lendingPoolAddressesProviderAddresses,
	lendingPoolDataProviderAddresses,
	liquiditySwapAdapterAddresses,
	repayFromCollateralAdapterAddresses,
	leverageBorrowAdapterAddresses,
	ubeswapAddresses,
	governanceAddresses,
	formattedUserAccountData,
	formattedReserveData,
	formattedUserReserveData,
} from "./moola-helper";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const useUserOnChainState = (account: Account, tokenAddress: string) => {
	return useOnChainState(
		React.useCallback(
			async (kit: ContractKit) => {
				const goldToken = await kit.contracts.getGoldToken();
				const latestBlockNumber = await kit.web3.eth.getBlockNumber();

				const lendingPoolAddressesProviderAddress = selectAddressOrThrow(
					lendingPoolAddressesProviderAddresses
				);
				const LendingPoolAddressesProvider = new kit.web3.eth.Contract(
					LendingPoolAddressesProviderABI as AbiItem[],
					lendingPoolAddressesProviderAddress
				);
				const lendingPoolAddress = await LendingPoolAddressesProvider.methods
					.getLendingPool()
					.call();
				const priceOracleAddress = await LendingPoolAddressesProvider.methods
					.getPriceOracle()
					.call();
				const LendingPool = new kit.web3.eth.Contract(
					LendingPoolABI as AbiItem[],
					lendingPoolAddress
				);
				const lendingPoolDataProviderAddress = selectAddressOrThrow(
					lendingPoolDataProviderAddresses
				);
				const LendingPoolDataProvider = new kit.web3.eth.Contract(
					LendingPoolDataProviderABI as AbiItem[],
					lendingPoolDataProviderAddress
				);

				const userAccountDataRaw = await LendingPool.methods
					.getUserAccountData(account.address)
					.call();
				const userReserveDataRaw = await LendingPoolDataProvider.methods
					.getUserReserveData(tokenAddress, account.address)
					.call();
				const reserveDataRaw = await LendingPoolDataProvider.methods
					.getReserveData(tokenAddress)
					.call();

				const autoRepayAddress = selectAddressOrThrow(autoRepayAddresses);
				const liquiditySwapAdapterAddress = selectAddressOrThrow(
					liquiditySwapAdapterAddresses
				);
				const ubeswapAddress = selectAddressOrThrow(ubeswapAddresses);
				const repayFromCollateralAdapterAddress = selectAddressOrThrow(
					repayFromCollateralAdapterAddresses
				);
				const leverageBorrowAdapterAddress = selectAddressOrThrow(
					leverageBorrowAdapterAddresses
				);
				const governanceAddress = selectAddressOrThrow(governanceAddresses);

				return {
					latestBlockNumber,
					autoRepayAddress,
					goldToken,
					lendingPoolAddress,
					lendingPoolDataProviderAddress,
					liquiditySwapAdapterAddress,
					priceOracleAddress,
					repayFromCollateralAdapterAddress,
					leverageBorrowAdapterAddress,
					reserveData: formattedReserveData(reserveDataRaw),
					ubeswapAddress,
					governanceAddress,
					userAccountData: formattedUserAccountData(userAccountDataRaw),
					userReserveData: formattedUserReserveData(
						userReserveDataRaw,
						reserveDataRaw
					),
				};
			},
			[account, tokenAddress]
		),
		{}
	);
};
