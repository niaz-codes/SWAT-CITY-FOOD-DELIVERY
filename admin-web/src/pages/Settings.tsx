import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import { formatDateTime, timeAgo } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card, CardBody } from '../components/ui/Card'
import { Field, Input, Select, Switch, Textarea } from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import { EmptyState, ErrorState, InlineError, Skeleton } from '../components/ui/States'

interface Setting {
  _id: string
  key: string
  value?: unknown
  label?: string | null
  description?: string | null
  updatedAt?: string
}

type ValueType = 'text' | 'number' | 'boolean' | 'json'

const TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'On / off' },
  { value: 'json', label: 'JSON (object or list)' },
]

function detectType(value: unknown): ValueType {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (value !== null && typeof value === 'object') return 'json'
  return 'text'
}

function valueToDraft(value: unknown, type: ValueType): string {
  if (value == null) return ''
  if (type === 'json') return JSON.stringify(value, null, 2)
  return String(value)
}

function displayValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

/** The values the mobile app and backend read at runtime, editable in place. */
export default function Settings() {
  const settings = useApi<Setting[]>('/admin/settings', (payload) => {
    const data = (payload as { data?: { settings?: Setting[] } })?.data
    return data?.settings ?? []
  })

  const [search, setSearch] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draftType, setDraftType] = useState<ValueType>('text')
  const [draft, setDraft] = useState('')
  const [draftBoolean, setDraftBoolean] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftError, setDraftError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addKey, setAddKey] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addType, setAddType] = useState<ValueType>('text')
  const [addValue, setAddValue] = useState('')
  const [addBoolean, setAddBoolean] = useState(false)
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  const startEdit = (setting: Setting) => {
    const type = detectType(setting.value)
    setEditingKey(setting.key)
    setDraftType(type)
    setDraft(valueToDraft(setting.value, type))
    setDraftBoolean(Boolean(setting.value))
    setDraftLabel(setting.label ?? '')
    setDraftError('')
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setDraft('')
    setDraftBoolean(false)
    setDraftLabel('')
    setDraftError('')
  }

  const parseDraft = (type: ValueType, raw: string, bool: boolean): unknown => {
    if (type === 'boolean') return bool
    if (type === 'text') return raw
    if (type === 'number') {
      const number = Number(raw)
      if (!Number.isFinite(number)) throw new Error('Enter a valid number.')
      return number
    }
    try {
      return JSON.parse(raw)
    } catch {
      throw new Error('This is not valid JSON. Check the quotes and brackets.')
    }
  }

  const saveSetting = async (key: string) => {
    setDraftError('')
    let value: unknown
    try {
      value = parseDraft(draftType, draft, draftBoolean)
    } catch (failure) {
      setDraftError(failure instanceof Error ? failure.message : 'Check the value.')
      return
    }
    setSavingKey(key)
    try {
      await api.patch(`/admin/settings/${encodeURIComponent(key)}`, {
        value,
        label: draftLabel.trim() || undefined,
      })
      toast.success(`${key} saved`)
      cancelEdit()
      await settings.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not save this setting.'))
    } finally {
      setSavingKey(null)
    }
  }

  const addSetting = async () => {
    setAddError('')
    const key = addKey.trim()
    if (!/^[a-zA-Z0-9_.-]{2,80}$/.test(key)) {
      setAddError('Use 2–80 letters, numbers, dots, dashes or underscores.')
      return
    }
    let value: unknown
    try {
      value = parseDraft(addType, addValue, addBoolean)
    } catch (failure) {
      setAddError(failure instanceof Error ? failure.message : 'Check the value.')
      return
    }
    setAdding(true)
    try {
      await api.post('/admin/settings', {
        key,
        value,
        label: addLabel.trim() || undefined,
        description: addDescription.trim() || undefined,
      })
      toast.success(`${key} added`)
      setAddOpen(false)
      setAddKey('')
      setAddLabel('')
      setAddDescription('')
      setAddValue('')
      setAddType('text')
      setAddBoolean(false)
      await settings.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not add this setting.'))
    } finally {
      setAdding(false)
    }
  }

  const filtered = useMemo(() => {
    const rows = settings.data ?? []
    const needle = search.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (row) =>
        row.key.toLowerCase().includes(needle) ||
        row.label?.toLowerCase().includes(needle) ||
        row.description?.toLowerCase().includes(needle),
    )
  }, [settings.data, search])

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="The runtime values the app reads from the backend. Changes are live immediately."
        actions={
          <>
            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={settings.loading}
              onClick={() => void settings.reload()}
            >
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
              New setting
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-72">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search keys and labels"
              icon={Search}
              aria-label="Search settings"
            />
          </div>
          <Badge tone="neutral">
            <Settings2 className="h-3 w-3" aria-hidden="true" />
            {settings.data?.length ?? 0} keys stored
          </Badge>
        </div>
      </PageHeader>

      <Card className="mb-4 border-info/25 bg-info-soft/40">
        <CardBody className="flex gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
            <Info className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="text-sm leading-relaxed text-ink-muted">
            <p className="font-semibold text-ink">These are production values.</p>
            <p className="mt-0.5">
              A wrong delivery fee or commission changes what customers and riders are charged.
              Edit one key at a time and check the app afterwards.
            </p>
          </div>
        </CardBody>
      </Card>

      {settings.error ? (
        <Card>
          <ErrorState message={settings.error} onRetry={() => void settings.reload()} />
        </Card>
      ) : settings.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardBody className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="h-16 w-full" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={SlidersHorizontal}
            title={search ? 'No settings match' : 'No settings stored'}
            description={
              search
                ? 'Try a different key or clear the search.'
                : 'Add the first key the app should read from the backend.'
            }
            action={
              <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
                New setting
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((setting) => {
            const isEditing = editingKey === setting.key
            const type = detectType(setting.value)
            return (
              <Card key={setting._id ?? setting.key}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-bold text-ink">
                        {setting.key}
                      </code>
                      <Badge tone="neutral">{type === 'json' ? 'JSON' : type}</Badge>
                    </div>
                    {setting.label && (
                      <p className="mt-1 text-sm font-medium text-ink">{setting.label}</p>
                    )}
                    {setting.description && (
                      <p className="mt-0.5 text-xs text-ink-muted">{setting.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="hidden text-[11px] text-ink-subtle sm:block"
                      title={formatDateTime(setting.updatedAt)}
                    >
                      Updated {timeAgo(setting.updatedAt)}
                    </span>
                    {isEditing ? (
                      <Button size="sm" variant="ghost" icon={X} onClick={cancelEdit}>
                        Cancel
                      </Button>
                    ) : (
                      <Button size="sm" icon={Pencil} onClick={() => startEdit(setting)}>
                        Edit
                      </Button>
                    )}
                  </div>
                </div>

                <CardBody>
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Label" htmlFor={`label-${setting.key}`}>
                          <Input
                            id={`label-${setting.key}`}
                            value={draftLabel}
                            onChange={(event) => setDraftLabel(event.target.value)}
                            placeholder="How this value is described"
                            maxLength={120}
                          />
                        </Field>
                        <Field label="Value type" htmlFor={`type-${setting.key}`}>
                          <Select
                            id={`type-${setting.key}`}
                            value={draftType}
                            onChange={(event) => {
                              const nextType = event.target.value as ValueType
                              // Keep what is already typed; the admin can adjust it.
                              setDraftType(nextType)
                              setDraftError('')
                            }}
                            options={TYPE_OPTIONS}
                          />
                        </Field>
                      </div>

                      {draftType === 'boolean' ? (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                          <span className="text-sm text-ink">
                            {draftBoolean ? 'On' : 'Off'} — the app reads this as{' '}
                            <code className="text-xs">{String(draftBoolean)}</code>
                          </span>
                          <Switch
                            checked={draftBoolean}
                            onChange={setDraftBoolean}
                            label={`Value for ${setting.key}`}
                          />
                        </div>
                      ) : draftType === 'json' ? (
                        <Field
                          label="Value"
                          htmlFor={`value-${setting.key}`}
                          hint="Must be valid JSON."
                          error={draftError}
                        >
                          <Textarea
                            id={`value-${setting.key}`}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            rows={6}
                            className="font-mono text-xs"
                            spellCheck={false}
                          />
                        </Field>
                      ) : (
                        <Field label="Value" htmlFor={`value-${setting.key}`} error={draftError}>
                          <Input
                            id={`value-${setting.key}`}
                            type={draftType === 'number' ? 'number' : 'text'}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                          />
                        </Field>
                      )}

                      <div className="flex justify-end">
                        <Button
                          variant="primary"
                          icon={Save}
                          loading={savingKey === setting.key}
                          onClick={() => void saveSetting(setting.key)}
                        >
                          Save value
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-surface-muted/70 px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">
                      {displayValue(setting.value)}
                    </pre>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="New setting"
        description="Adding a key that already exists would create a duplicate — use Edit on the row instead."
        size="md"
        busy={adding}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button variant="primary" loading={adding} onClick={() => void addSetting()}>
              Add setting
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Key"
              htmlFor="new-setting-key"
              required
              hint="Read by the app, e.g. delivery.base_fee"
            >
              <Input
                id="new-setting-key"
                value={addKey}
                onChange={(event) => setAddKey(event.target.value)}
                placeholder="delivery.base_fee"
                maxLength={80}
                className="font-mono"
              />
            </Field>
            <Field label="Label" htmlFor="new-setting-label">
              <Input
                id="new-setting-label"
                value={addLabel}
                onChange={(event) => setAddLabel(event.target.value)}
                placeholder="Base delivery fee"
                maxLength={120}
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="new-setting-description">
            <Textarea
              id="new-setting-description"
              value={addDescription}
              onChange={(event) => setAddDescription(event.target.value)}
              placeholder="What this value controls."
              maxLength={300}
            />
          </Field>

          <Field label="Value type" htmlFor="new-setting-type">
            <Select
              id="new-setting-type"
              value={addType}
              onChange={(event) => setAddType(event.target.value as ValueType)}
              options={TYPE_OPTIONS}
            />
          </Field>

          {addType === 'boolean' ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
              <span className="text-sm text-ink">Value</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-muted">
                  {addBoolean ? 'On' : 'Off'}
                </span>
                <Switch checked={addBoolean} onChange={setAddBoolean} label="New setting value" />
              </div>
            </div>
          ) : addType === 'json' ? (
            <Field label="Value" htmlFor="new-setting-json" hint="Must be valid JSON." error={addError}>
              <Textarea
                id="new-setting-json"
                value={addValue}
                onChange={(event) => setAddValue(event.target.value)}
                rows={6}
                className="font-mono text-xs"
                spellCheck={false}
                placeholder={'{\n  "amount": 60\n}'}
              />
            </Field>
          ) : (
            <Field label="Value" htmlFor="new-setting-value" error={addError}>
              <Input
                id="new-setting-value"
                type={addType === 'number' ? 'number' : 'text'}
                value={addValue}
                onChange={(event) => setAddValue(event.target.value)}
                placeholder={addType === 'number' ? '60' : 'Swat City'}
              />
            </Field>
          )}

          {addError && addType !== 'json' && <InlineError message={addError} />}
        </div>
      </Modal>
    </div>
  )
}
