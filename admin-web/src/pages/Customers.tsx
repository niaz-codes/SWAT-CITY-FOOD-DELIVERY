import { useState } from 'react'
import { toast } from 'sonner'
import { Search, UserCheck, UserX, Users } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useListResource } from '../lib/useListResource'
import { formatDate, formatDateTime, humanizeStatus, statusTone, timeAgo } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Avatar from '../components/ui/Avatar'
import { Card } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import Dropdown from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'

interface CustomerRow {
  _id: string
  name?: string | null
  email?: string | null
  phone?: string | null
  status?: string | null
  verified?: boolean
  isApproved?: boolean
  lastLoginAt?: string | null
  createdAt: string
}

/** Everyone who signed up as a customer, with a suspend switch. */
export default function Customers() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const list = useListResource<CustomerRow>({
    endpoint: '/admin/users?role=customer',
    rowsKey: 'users',
    searchParam: 'search',
  })

  const [target, setTarget] = useState<CustomerRow | null>(null)
  const [busy, setBusy] = useState(false)

  const applyStatus = (value: string) => {
    setStatus(value)
    list.setFilter('status', value)
  }

  const setAccountStatus = async () => {
    if (!target) return
    const nextStatus = target.status === 'suspended' ? 'active' : 'suspended'
    setBusy(true)
    try {
      await api.patch(`/admin/users/${target._id}/status`, { status: nextStatus })
      toast.success(nextStatus === 'active' ? 'Account reactivated' : 'Account suspended')
      setTarget(null)
      await list.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not change this account.'))
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<CustomerRow>[] = [
    {
      key: 'customer',
      label: 'Customer',
      sortable: true,
      sortValue: (row) => row.name ?? '',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.name} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink">{row.name || 'Unnamed customer'}</div>
            <div className="truncate text-xs text-ink-subtle">{row.email || 'No email'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (row) => row.phone || '-',
    },
    {
      key: 'verified',
      label: 'Verified',
      render: (row) => (
        <Badge tone={row.verified ? 'success' : 'neutral'} dot>
          {row.verified ? 'Verified' : 'Unverified'}
        </Badge>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <Badge tone={statusTone(row.status)} dot>
          {humanizeStatus(row.status ?? 'active')}
        </Badge>
      ),
    },
    {
      key: 'lastLogin',
      label: 'Last sign-in',
      secondary: true,
      render: (row) => (row.lastLoginAt ? timeAgo(row.lastLoginAt) : 'Never'),
    },
    {
      key: 'joined',
      label: 'Joined',
      align: 'right',
      sortable: true,
      sortValue: (row) => new Date(row.createdAt).getTime(),
      render: (row) => (
        <span title={formatDateTime(row.createdAt)}>{formatDate(row.createdAt)}</span>
      ),
    },
  ]

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Operations"
        title="Customers"
        description="Every customer account, their verification state and when they last opened the app."
        actions={
          <Button variant="secondary" icon={Users} onClick={() => void list.reload()}>
            Refresh
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="w-full sm:w-72">
            <Input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                list.setSearch(event.target.value)
              }}
              placeholder="Search name, phone or email"
              icon={Search}
              aria-label="Search customers"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={status}
              onChange={(event) => applyStatus(event.target.value)}
              aria-label="Filter customers by status"
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'suspended', label: 'Suspended' },
              ]}
            />
          </div>
          <span className="ml-auto hidden text-xs text-ink-subtle sm:block">
            {list.total.toLocaleString('en-PK')} customers
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          emptyTitle="No customers match"
          emptyDescription="Try a different name or clear the status filter."
          emptyIcon={Users}
          onRetry={list.reload}
          rowKey={(row) => row._id}
          actions={(row) => (
            <Dropdown
              items={[
                {
                  label: row.status === 'suspended' ? 'Reactivate account' : 'Suspend account',
                  icon: row.status === 'suspended' ? UserCheck : UserX,
                  danger: row.status !== 'suspended',
                  onClick: () => setTarget(row),
                },
              ]}
            />
          )}
        />

        <Pagination
          page={list.page}
          pages={list.pages}
          total={list.total}
          limit={list.limit}
          onPage={list.setPage}
          noun="customers"
        />
      </Card>

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={() => void setAccountStatus()}
        title={target?.status === 'suspended' ? 'Reactivate this account?' : 'Suspend this account?'}
        message={
          target?.status === 'suspended'
            ? `${target?.name || 'This customer'} will be able to sign in and order again.`
            : `${target?.name || 'This customer'} will be signed out and blocked from ordering until you reactivate the account.`
        }
        confirmLabel={target?.status === 'suspended' ? 'Reactivate' : 'Suspend'}
        tone={target?.status === 'suspended' ? 'primary' : 'danger'}
        busy={busy}
      />
    </div>
  )
}
