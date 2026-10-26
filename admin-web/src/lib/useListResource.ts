import { useCallback, useEffect, useRef, useState } from 'react'
import { api, apiErrorMessage } from './api'

interface ListOptions {
  /** The API path, e.g. `/admin/orders`. */
  endpoint: string
  /** The key of the row array inside the response `data`. */
  rowsKey: string
  pageSize?: number
  /** The query parameter the search box fills, when the API supports one. */
  searchParam?: string
  /** A search to start with, e.g. from a link or the command palette. */
  initialSearch?: string
  /** Skip the request entirely (e.g. a tab that has not been opened). */
  enabled?: boolean
}

interface ListMeta {
  page: number
  pages: number
  total: number
}

/**
 * The list contract every admin endpoint shares:
 * `{ data: { <key>: [...] }, meta: { page, limit, pages, total } }`.
 *
 * Search is debounced, filters reset paging, and a slow response that arrives
 * after a newer one is discarded instead of flashing stale rows.
 */
export function useListResource<T>(options: ListOptions) {
  const {
    endpoint,
    rowsKey,
    pageSize = 20,
    searchParam,
    initialSearch = '',
    enabled = true,
  } = options

  const [rows, setRows] = useState<T[]>([])
  const [meta, setMeta] = useState<ListMeta>({ page: 1, pages: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(pageSize)
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  // Typing should not fire one request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 350)
    return () => window.clearTimeout(timer)
  }, [search])

  const load = useCallback(async () => {
    if (!enabled) return
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    if (searchParam && debouncedSearch.trim()) params.set(searchParam, debouncedSearch.trim())
    // Every selected filter is a query parameter, whether or not the screen
    // renders a visible dropdown for it.
    for (const [param, value] of Object.entries(filterValues)) {
      if (value && value !== 'all') params.set(param, value)
    }
    const queryString = params.toString()

    const currentRequest = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const url = endpoint.includes('?') ? `${endpoint}&${queryString}` : `${endpoint}?${queryString}`
      const response = await api.get(url)
      // A newer request has already answered - this one is out of date.
      if (currentRequest !== requestId.current) return
      const body = response.data as {
        data?: Record<string, unknown[]>
        meta?: Partial<ListMeta>
      }
      setRows((body?.data?.[rowsKey] as T[]) ?? [])
      setMeta({
        page: body?.meta?.page ?? page,
        pages: body?.meta?.pages ?? 1,
        total: body?.meta?.total ?? 0,
      })
    } catch (failure) {
      if (currentRequest !== requestId.current) return
      setError(apiErrorMessage(failure, 'Could not load this list.'))
      setRows([])
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
    // filterValues and the other inputs are listed below; the API base and
    // helpers are stable imports.
  }, [endpoint, rowsKey, page, limit, debouncedSearch, searchParam, filterValues, enabled])

  useEffect(() => {
    void load()
  }, [load])

  const setFilter = useCallback((param: string, value: string) => {
    setFilterValues((current) => ({ ...current, [param]: value }))
    setPage(1)
  }, [])

  const resetFilters = useCallback(() => {
    setFilterValues({})
    setSearch('')
    setPage(1)
  }, [])

  const changePageSize = useCallback((size: number) => {
    setLimit(size)
    setPage(1)
  }, [])

  return {
    rows,
    loading,
    error,
    page,
    pages: meta.pages,
    total: meta.total,
    limit,
    search,
    setSearch: (value: string) => {
      setSearch(value)
      setPage(1)
    },
    filterValues,
    setFilter,
    resetFilters,
    setPage,
    setLimit: changePageSize,
    reload: load,
  }
}
