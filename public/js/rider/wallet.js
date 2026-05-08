import { api } from '../api.js';
import { refresh } from '../shell.js';
import { state } from '../state.js';
import {
  $,
  escapeHtml,
  formObject,
  formatMoney,
  run,
  table
} from '../ui.js';

export function renderWalletSection() {
  const data = state.data;
  const wallet = data.wallet || {};

  $('#content').innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <h2>Wallet</h2>
        <span>Balance and ledger</span>
      </div>
      <div class="wallet-balance">
        <span>Available Balance</span>
        <strong>${escapeHtml(formatMoney(wallet.balance))}</strong>
      </div>
      <form class="inline-form" id="walletTopUpForm">
        <label>Top-up Amount<input name="amount" type="number" min="1" step="1" value="500" required></label>
        <button class="primary-action" type="submit">Add Balance</button>
      </form>
    </section>
    <section class="panel">
      <div class="panel-header">
        <h2>Wallet Transactions</h2>
        <span>${escapeHtml(data.walletTransactions.length)} records</span>
      </div>
      ${table(data.walletTransactions, [
        { label: 'Type', key: 'transaction_type', format: (value) => escapeHtml(String(value || 'unknown').replaceAll('_', ' ')) },
        { label: 'Amount', key: 'amount', format: formatMoney },
        { label: 'Balance After', key: 'balance_after', format: formatMoney },
        { label: 'Ride', key: 'ride_id', format: (value) => escapeHtml(value ? `#${value}` : '-') },
        { label: 'Description', key: 'description' },
        { label: 'Date', key: 'created_at' }
      ])}
    </section>
  `;

  $('#walletTopUpForm').addEventListener('submit', topUpWallet);
}

async function topUpWallet(event) {
  event.preventDefault();
  const payload = formObject(event.currentTarget);
  await run(async () => {
    await api('/api/rider/wallet/top-up', {
      method: 'POST',
      body: JSON.stringify({ amount: Number(payload.amount) })
    });
    await refresh();
  }, 'Wallet updated.');
}
