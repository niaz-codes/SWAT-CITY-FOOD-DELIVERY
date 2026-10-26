import { useCallback, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Search, Wallet as WalletIcon } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useListResource } from '../lib/useListResource'
import { formatCurrency, formatDateTime, humanizeStatus, statusTone, timeAgo } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Field'
import Tabs from '../components/ui/Tabs'
import Drawer from '../components/ui/Drawer'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'
import { InlineError, Skeleton } from '../components/ui/States'

interface WalletRow {
  _id: string
  balance: number
  holdsEarnings?: boolean
  lastTransactionAt?: string | null
  updatedAt?: string | null
  user?: { _id?: string; name?: string; phone?: string; role?: string } | null
}

interface TransactionRow {
  _id: string
  type: string
  amount: number
  balanceAfter: number
  reference?: string | null
  description?: string | null
  createdAt: string
  user?: { _id?: string; name?: string; phone?: string; role?: string } | null
}

interface WalletDetail {
  wallet?: WalletRow | null
  transactions?: TransactionRow[]
}

const TX_TYPES = ['credit', 'debit', 'refund', 'earning', 'commission']

const TX_TONE: Record<string, string> = {
  credit: 'text-positive',
  earning: 'text-positive',
  refund: 'text-info',
  debit: 'text-danger',
  commission: 'text-warning',
}

/** Platform wallets: balances on one tab, the full ledger on the other. */
export default function Wallets() {
  const [tab, setTab] = useState('wallets')
  const [search, setSearch] = useState('')

  const wallets = useListResource<WalletRow>({
    endpoint: '/admin/wallets',
    rowsKey: 'wallets',
    enabled: tab === 'wallets',
  })

  const transactions = useListResource<TransactionRow>({
    endpoint: '/admin/transactions',
    rowsKey: 'transactions',
    enabled: tab === 'transactions',
  })

  const [selected, setSelected] = useState<WalletRow | null>(null)
  const [detail, setDetail] = useState<WalletDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const loadDetail = useCallback(async (wallet: WalletRow) => {
    const userId = wallet.user?._id
    if (!userId) {
      setDetailError('This wallet has no linked user id, so its ledger cannot be opened.')
      return
    }
    setDetailLoading(true)
    setDetailError('')
    try {
      const response = await api.get(`/admin/wallets/${userId}`)
      setDetail((response.data?.data ?? {}) as WalletDetail)
    } catch (failure) {
      setDetailError(apiErrorMessage(failure, 'Could not load this wallet.'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const openWallet = (wallet: WalletRow) => {
    setSelected(wallet)
    setDetail(null)
    void loadDetail(wallet)
  }

  const walletColumns: Column<WalletRow>[] = [
    {
      key: 'owner',
      label: 'Account',
      sortable: true,
      sortValue: (row) => row.user?.name ?? '',
      render: (row) => (
        <div>
          <div className="font-semibold text-ink">{row.user?.name || 'Unknown account'}</div>
          <div className="text-xs text-ink-subtle">
            {row.user?.phone || 'No phone'} · {humanizeStatus(row.user?.role ?? '')}
          </div>
        </div>
      ),
    },
    {
      key: 'balance',
      label: 'Balance',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.balance ?? 0,
      render: (row) => (
        <span className="text-base font-bold text-ink">{formatCurrency(row.balance ?? 0)}</span>
      ),
    },
    {
      key: 'holds',
      label: 'Earnings',
      render: (row) =>
        row.holdsEarnings ? (
          <Badge tone="brand">Rider earnings</Badge>
        ) : (
          <Badge tone="neutral">Spending wallet</Badge>
        ),
    },
    {
      key: 'last',
      label: 'Last movement',
      align: 'right',
      render: (row) =>
        row.lastTransactionAt ? (
          <span title={formatDateTime(row.lastTransactionAt)}>{timeAgo(row.lastTransactionAt)}</span>
        ) : (
          <span className="text-ink-subtle">No movements</span>
        ),
    },
  ]

  const transactionColumns: Column<TransactionRow>[] = [
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      sortValue: (row) => new Date(row.createdAt).getTime(),
      render: (row) => (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold ${
            TX_TONE[row.type] ?? 'text-ink'
          }`}
        >
          {row.type === 'debit' || row.type === 'commission' ? (
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {humanizeStatus(row.type)}
        </span>
      ),
    },
    {
      key: 'account',
      label: 'Account',
      render: (row) => (
        <div>
          <div className="text-ink">{row.user?.name || '-'}</div>
          <div className="text-xs text-ink-subtle">{humanizeStatus(row.user?.role ?? '')}</div>
        </div>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      render: (row) => (
        <div className="max-w-[280px]">
          <div className="truncate text-ink">{row.description || '—'}</div>
          {row.reference && (
            <div className="truncate font-mono text-[11px] text-ink-subtle">{row.reference}</div>
          )}
        </div>
      ),
    },
    {
      key: 'balanceAfter',
      label: 'Balance after',
      secondary: true,
      align: 'right',
      render: (row) => formatCurrency(row.balanceAfter ?? 0),
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.amount ?? 0,
      render: (row) => (
        <span className={`font-semibold ${TX_TONE[row.type] ?? 'text-ink'}`}>
          {formatCurrency(row.amount ?? 0)}
        </span>
      ),
    },
    {
      key: 'created',
      label: 'When',
      align: 'right',
      render: (row) => (
        <span title={formatDateTime(row.createdAt)} className="text-xs">
          {timeAgo(row.createdAt)}
        </span>
      ),
    },
  ]

  const active = tab === 'wallets' ? wallets : transactions

  const filteredWallets = search.trim()
    ? wallets.rows.filter((row) => {
        const needle = search.trim().toLowerCase()
        return (
          row.user?.name?.toLowerCase().includes(needle) ||
          row.user?.phone?.toLowerCase().includes(needle)
        )
      })
    : wallets.rows

  const filteredTransactions = search.trim()
    ? transactions.rows.filter((row) => {
        const needle = search.trim().toLowerCase()
        return (
          row.user?.name?.toLowerCase().includes(needle) ||
          row.description?.toLowerCase().includes(needle) ||
          row.reference?.toLowerCase().includes(needle)
        )
      })
    : transactions.rows

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Finance"
        title="Wallets"
        description="Customer balances and rider earnings, backed by an append-only transaction ledger."
        actions={
          <Button variant="secondary" icon={WalletIcon} onClick={() => void active.reload()}>
            Refresh
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            items={[
              { value: 'wallets', label: 'Balances' },
              { value: 'transactions', label: 'Transactions' },
            ]}
            value={tab}
            onChange={(value) => {
              setTab(value)
              setSearch('')
            }}
          />
          <div className="w-full sm:w-64">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter this page…"
              icon={Search}
              aria-label="Filter wallets on this page"
            />
          </div>
          {tab === 'transactions' && (
            <div className="w-full sm:w-40">
              <Select
                value={transactions.filterValues.type ?? 'all'}
                onChange={(event) => transactions.setFilter('type', event.target.value)}
                aria-label="Filter transactions by type"
                options={[
                  { value: 'all', label: 'All types' },
                  ...TX_TYPES.map((value) => ({ value, label: humanizeStatus(value) })),
                ]}
              />
            </div>
          )}
        </div>
      </PageHeader>

      <Card>
        {tab === 'wallets' ? (
          <>
            <DataTable
              columns={walletColumns}
              rows={filteredWallets}
              loading={wallets.loading}
              error={wallets.error}
              emptyTitle="No wallets yet"
              emptyDescription="A wallet is created the first time an account earns or spends."
              emptyIcon={WalletIcon}
              onRetry={wallets.reload}
              rowKey={(row) => row._id}
              onRowClick={openWallet}
            />
            <Pagination
              page={wallets.page}
              pages={wallets.pages}
              total={wallets.total}
              limit={wallets.limit}
              onPage={wallets.setPage}
              noun="wallets"
            />
          </>
        ) : (
          <>
            <DataTable
              columns={transactionColumns}
              rows={filteredTransactions}
              loading={transactions.loading}
              error={transactions.error}
              emptyTitle="No transactions yet"
              emptyDescription="Every credit, debit, refund and commission lands here."
              emptyIcon={WalletIcon}
              onRetry={transactions.reload}
              rowKey={(row) => row._id}
            />
            <Pagination
              page={transactions.page}
              pages={transactions.pages}
              total={transactions.total}
              limit={transactions.limit}
              onPage={transactions.setPage}
              noun="transactions"
            />
          </>
        )}
      </Card>

      <Drawer
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null)
          setDetail(null)
        }}
        title={detail?.wallet?.user?.name || selected?.user?.name || 'Wallet'}
        description={selected ? `Balance ${formatCurrency(selected.balance ?? 0)}` : ''}
      >
        {detailLoading && !detail ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detailError ? (
          <InlineError message={detailError} />
        ) : detail?.wallet ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-line bg-gradient-to-br from-brand to-brand-strong p-4 text-brand-contrast shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
                Available balance
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight">
                {formatCurrency(detail.wallet.balance ?? 0)}
              </p>
              <p className="mt-1 text-xs opacity-80">
                {detail.wallet.holdsEarnings ? 'Rider earnings wallet' : 'Customer spending wallet'}
              </p>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                Latest 50 movements
              </p>
              {(detail.transactions ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-ink-muted">
                  This wallet has no transactions yet.
                </p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {(detail.transactions ?? []).map((transaction) => (
                    <li key={transaction._id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                          <span className={TX_TONE[transaction.type] ?? 'text-ink'}>
                            {humanizeStatus(transaction.type)}
                          </span>
                          <Badge tone={statusTone(transaction.type)}>
                            {formatCurrency(transaction.amount)}
                          </Badge>
                        </p>
                        <p className="truncate text-[11px] text-ink-subtle">
                          {transaction.description || transaction.reference || 'No description'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-ink">
                          {formatCurrency(transaction.balanceAfter)}
                        </p>
                        <p className="text-[10px] text-ink-subtle">
                          {timeAgo(transaction.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
