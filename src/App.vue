<template>
  <div id="app">
    <p style="background: lightblue; border-left: solid 3px rgb(0,100,200); padding: 16px;">
      This is a demo page for <a href="https://github.com/sisou/nimiq-vue-stores">Nimiq Vue Stores</a>.
    </p>

    <div>Client ready: <strong>{{ ready }}</strong></div>

    <h3>Consensus</h3>
    <div>Consensus: <strong>{{ consensus }}</strong></div>
    <div>Established: <strong>{{ established }}</strong></div>

    <h3>Blockchain</h3>
    <div>Height: <strong>{{ height }}</strong></div>
    <div>Last Block Time: <strong>{{ head && new Date(head.timestamp * 1000).toLocaleString() }}</strong></div>

    <h3>Network</h3>
    <div>Peers: <strong>{{ peerCount }}</strong></div>
    <div>Received: <strong>{{ networkStatistics.bytesReceived / 1000 }} kB</strong></div>
    <div>Sent: <strong>{{ networkStatistics.bytesSent / 1000 }} kB</strong></div>
    <div>Offset: <strong>{{ networkStatistics.timeOffset }} ms</strong></div>

    <h3>Accounts</h3>
    <form>
      Address: <input v-model="address"><br>
      Label: <input v-model="label">
    </form>
    <button @click="() => addAccounts({ address, label })">Add address</button>
    <button @click="() => refreshAccounts()" :disabled="accountsRefreshing">Refresh balances</button>
    <ul>
      <li v-for="account in accounts" :key="account.address.toPlain()">
        {{account.label || '-unnamed-'}} - {{account.address.toPlain()}} ({{account.type}}): {{account.balance / 1e5}} NIM
      </li>
    </ul>

    <h3>Transactions</h3>
    <div>
      Latest:
      <strong v-if="newTransaction">Tx from {{newTransaction.sender.toPlain()}} to {{newTransaction.recipient.toPlain()}} of {{newTransaction.value / 1e5}} NIM, state: {{newTransaction.state}}</strong>
    </div>

    <button @click="() => refreshTransactions()" :disabled="transactionsRefreshing">Refresh history</button>

    <table border="1" cellspacing="0" cellpadding="4">
      <tr>
        <th>Time</th>
        <th>From</th>
        <th>To</th>
        <th>Value</th>
        <th>State</th>
      </tr>
      <tr v-for="tx in transactions" :key="tx.transactionHash.toPlain()">
        <td>{{ new Date(tx.timestamp * 1000).toLocaleString() }}</td>
        <td>{{ tx.sender.toPlain() }}</td>
        <td>{{ tx.recipient.toPlain() }}</td>
        <td>{{ tx.value / 1e5 }} NIM</td>
        <td>{{ tx.state }}</td>
      </tr>
    </table>
  </div>
</template>

<script lang="ts">
import { createComponent } from '@vue/composition-api';
import {
  useReady,
  useConsensus,
  useBlockchain,
  useNetwork,
  useAccounts,
  useTransactions,
} from './nimiq-vue-stores'

export default createComponent({
  name: 'app',
  data() {
    return {
      // address: 'NQ18 8JC8 DTKE 7G6V 6PJP 6VF8 1N5X K8Q7 21UX',
      address: 'NQ26 8MMT 8317 VD0D NNKE 3NVA GBVE UY1E 9YDF',
      // label: 'My Address',
      label: 'Blaukäppchen',
    };
  },
  setup() {
    const { ready } = useReady();
    const { consensus, established } = useConsensus();
    const { headHash, head, height } = useBlockchain();
    const { networkStatistics, peerCount } = useNetwork();
    const { accounts, addAccounts, removeAccounts, refreshAccounts, accountsRefreshing} = useAccounts(headHash)
    const { newTransaction, transactions, addTransactions, refreshTransactions, transactionsRefreshing } = useTransactions(accounts)

    return {
      ready,
      consensus,
      established,
      headHash,
      head,
      height,
      networkStatistics,
      peerCount,
      accounts,
      addAccounts,
      removeAccounts,
      refreshAccounts,
      accountsRefreshing,
      newTransaction,
      transactions,
      addTransactions,
      refreshTransactions,
      transactionsRefreshing,
    };
  }
});
</script>
