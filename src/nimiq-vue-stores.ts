import { ref, reactive, computed, watch, isRef, Ref } from '@vue/composition-api'
import Nimiq from '@nimiq/core-web'

type AccountIn = {
	address: Nimiq.Address | string,
}
type ParsedAccountIn = {
	address: Nimiq.Address
}
type Account = {
	address: Nimiq.Address,
	type?: string,
	balance?: number,

	// Vesting Contracts
	owner?: string,
	vestingStart?: number,
	vestingStepBlocks?: number,
	vestingStepAmount?: number,
	vestingTotalAmount?: number,

	// HTLCs
	sender?: string,
	recipient?: string,
	hashRoot?: string,
	hashCount?: number,
	timeout?: number,
	totalAmount?: number,
}
type AddressLike = Nimiq.Address | string | AccountIn

function addressLikes2AccountIns (input?: AddressLike | AddressLike[]): ParsedAccountIn[] {
	const addressLikes = input
		? (Array.isArray(input)
			? input
			: [input])
		: []
	return addressLikes.map(addressLike => ({
		...((addressLike as AccountIn).address ? (addressLike as AccountIn) : {}),
		address: Nimiq.Address.fromAny((addressLike as AccountIn).address || (addressLike as Nimiq.Address | string))
	}))
}

// let options = {
// 	network: 'main',
// 	features: [],
// 	volatile: undefined,
// 	blockConfirmations: undefined,
// }

export let client: Nimiq.Client

export const init = Nimiq.WasmHelper.doImport().then(() => {
	Nimiq.GenesisConfig.main()
	client = Nimiq.Client.Configuration.builder().instantiateClient()
	_ready.value = true
	return client
})

// Composition API functions can only be used after Vue initialized, and this library might be loaded before that,
// so we need to mock a ref() so the init() method above works.
let _ready = { value: false }
export function useReady() {
	// Once the ready store is used, we replace the mock ref with a real ref for reactivity.
	if (!isRef(_ready)) _ready = ref<boolean>((_ready as {value: boolean}).value)

	const ready = computed<boolean>(() => _ready.value)

	return {
		ready,
	}
}


/**
 * Consensus
 */

export function useConsensus() {
	const consensus = ref<string>('loading')
	const established = computed<boolean>(() => consensus.value === 'established')

	init.then(() => {
		function set(state: Nimiq.Client.ConsensusState) {
			consensus.value = state
		}

		set(client._consensusState)
		client.addConsensusChangedListener(set)
	})

	return {
		consensus,
		established,
	}
}


/**
 * Blockchain
 */

export function useBlockchain() {
	const headHash = ref<Nimiq.Hash | null>(null)
	const head = ref<Nimiq.Block | null>(null)
	const height = computed<number>(() => head.value ? head.value.height : 0)

	watch(() => {
		if (headHash.value) client.getBlock(headHash.value).then(block => {
			head.value = block
		})
	})

	init.then(() => {
		function set(hash: Nimiq.Hash) {
			headHash.value = hash
		}

		if (client._consensusState === 'established') client.getHeadHash().then(set)
		client.addHeadChangedListener(set)
	})

	return {
		headHash,
		head,
		height,
	}
}


/**
 * Network
 */

export function useNetwork() {
	const networkStatistics = ref({
		bytesReceived: 0,
		bytesSent: 0,
		totalPeerCount: 0,
		peerCountsByType: {
			total: 0,
			connecting: 0,
			dumb: 0,
			rtc: 0,
			ws: 0,
			wss: 0,
		},
		totalKnownAddresses: 0,
		knownAddressesByType: {
			total: 0,
			rtc: 0,
			ws: 0,
			wss: 0,
		},
		timeOffset: 0,
	})
	const peerCount = computed(() => networkStatistics.value.totalPeerCount)

	init.then(() => {
		function set(statistics: Nimiq.Client.NetworkStatistics) {
			networkStatistics.value = statistics
		}

		client.network.getStatistics().then(set)
		window.setInterval(() => client.network.getStatistics().then(set), 1000)
	})

	return {
		networkStatistics,
		peerCount,
	}
}


/**
 * Accounts
 */

export function useAccounts(refreshTrigger: Ref<Nimiq.Hash | null> | Ref<Nimiq.Block | null> | Ref<number>) {
	const accountsMap = new Nimiq.HashMap<Nimiq.Address, Account>()
	const accounts = ref<Account[]>([])

	const _accountsRefreshing = ref<number>(0)
	const accountsRefreshing = computed<boolean>(() => _accountsRefreshing.value > 0)

	watch(refreshTrigger as Ref<any>, () => refreshAccounts())

	function set(items: Account[]) {
		accounts.value = items
	}

	function addAccounts(input: AddressLike | AddressLike[]) {
		const accounts = addressLikes2AccountIns(input)
		if (!accounts.length ) return

		const newAccounts: Account[] = []
		for (const account of accounts) {
			const storedAccount = accountsMap.get(account.address)
			const newAccount = {
				...(storedAccount || {}),
				...account,
			}
			accountsMap.put(account.address, newAccount)
			if (!storedAccount) newAccounts.push(newAccount)
		}

		set(accountsMap.values())

		if (newAccounts.length) refreshAccounts(newAccounts)
	}

	function removeAccounts(input: AddressLike | AddressLike[]) {
		const accounts = addressLikes2AccountIns(input)
		if (!accounts.length ) return

		for (const account of accounts) {
			accountsMap.remove(account.address)
		}
		set(accountsMap.values())
	}

	function refreshAccounts(input?: AddressLike | AddressLike[]) {
		let accounts = addressLikes2AccountIns(input)
		if (!accounts.length) accounts = accountsMap.values()
		if (!accounts.length) return

		const addresses = accounts.map(account => account.address)
		console.debug('useAccounts->refresh', addresses.map(a => a.toPlain()))

		_accountsRefreshing.value += 1

		init.then(() => {
			client.waitForConsensusEstablished().then(() => {
				client.getAccounts(addresses)
					.then(accounts => {
						for (const [i, account] of Array.from(accounts.entries())) {
							const address = addresses[i]
							const storedAccount = accountsMap.get(address) || { address }
							accountsMap.put(address, {
								...storedAccount,
								...account.toPlain(),
							})
						}
						set(accountsMap.values())
					})
					.finally(() => _accountsRefreshing.value -= 1)
			})
		})
	}

	return {
		accounts,
		addAccounts,
		removeAccounts,
		refreshAccounts,
		accountsRefreshing,
	}
}


/**
 * Transactions
 */

export function useTransactions(accounts: Ref<Account[]>) {
	const trackedAddresses = new Nimiq.HashSet<Nimiq.Address>()
	let transactionsArray: Nimiq.Client.TransactionDetails[] = []

	const newTransaction = ref<Nimiq.Client.TransactionDetails | null>(null)
	const transactions = ref<Nimiq.Client.TransactionDetails[]>([])

	const _transactionsRefreshing = ref<number>(0)
	const transactionsRefreshing = computed<boolean>(() => _transactionsRefreshing.value > 0)

	watch(() => onAccountsChanged(accounts.value))
	watch(() => addTransactions(newTransaction.value))

	let handle: Nimiq.Handle

	function onAccountsChanged(accounts: Account[]) {
		console.debug('useTransactions->onAccountsChanged', accounts)

		// Update transaction listener
		init.then(() => {
			client.addTransactionListener(tx => {
				newTransaction.value = tx
			}, accounts.map(acc => acc.address)).then(newHandle => {
				client.removeListener(handle)
				handle = newHandle
			})
		})

		// Find untracked addresses
		const newAddresses: Nimiq.Address[] = []
		for (const address of accounts.map(acc => acc.address)) {
			if (trackedAddresses.contains(address)) continue
			newAddresses.push(address)
			trackedAddresses.add(address)
		}

		if (!newAddresses.length) return

		// Get transaction history for new addresses
		refreshTransactions(newAddresses)
	}

	function transactionsForAddress(address: Nimiq.Address) {
		return transactionsArray.filter(tx => tx.sender.equals(address) || tx.recipient.equals(address))
	}

	function sort(a: Nimiq.Client.TransactionDetails, b: Nimiq.Client.TransactionDetails) {
		if (a.timestamp === b.timestamp) return 0
		else if (!a.timestamp) return -1
		else if (!b.timestamp) return 1
		else return b.timestamp - a.timestamp
	}

	function addTransactions(newTransactions: Nimiq.Client.TransactionDetails | Nimiq.Client.TransactionDetails[] | null) {
		if (!newTransactions) return
		if (!Array.isArray(newTransactions)) newTransactions = [newTransactions]
		if (!newTransactions.length) return

		newTransactions = newTransactions.map(tx => Nimiq.Client.TransactionDetails.fromPlain(tx))
		console.debug('transactions->add', newTransactions)

		const transactionsByHash = new Nimiq.HashMap<Nimiq.Hash, Nimiq.Client.TransactionDetails>()
		for (const tx of transactionsArray) {
			transactionsByHash.put(tx.transactionHash, tx)
		}

		for (const tx of newTransactions) {
			transactionsByHash.put(tx.transactionHash, tx)
		}

		transactionsArray = transactionsByHash.values().sort(sort)

		transactions.value = transactionsArray
	}

	function refreshTransactions(input?: AddressLike | AddressLike[]) {
		let addresses = addressLikes2AccountIns(input).map(account => account.address)
		if (!addresses.length) addresses = trackedAddresses.values()
		if (!addresses.length) return

		console.debug('transactions->refresh', addresses.map(a => a.toPlain()))

		_transactionsRefreshing.value += 1

		init.then(() => {
			client.waitForConsensusEstablished().then(() => {
				Promise.all(addresses.map(address => client.getTransactionsByAddress(address, 0, transactionsForAddress(address)).then(addTransactions)))
					.finally(() => _transactionsRefreshing.value -= 1)
			})
		})
	}

	return {
		newTransaction,
		transactions,
		addTransactions,
		refreshTransactions,
		transactionsRefreshing,
	}
}
