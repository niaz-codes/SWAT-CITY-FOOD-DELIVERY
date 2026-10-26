import { useCallback, useEffect, useRef, useState } from 'react'
import { api, apiErrorMessage } from './api'

interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string
}

/**
 * Fetches one object from the API (a dashboard, a detail record) and exposes
 * `reload` for a refresh button. `select` turns the wrapped payload into the
 * shape the screen wants.
 */
export function useApi<T>(url: string | null, select: (payload: unknown) => T) {
  const [state, setState] = useState<ApiState<T>>({ data: null, loading: Boolean(url), error: '' })
  const selectRef = useRef(select)
  selectRef.current = select
  const requestId = useRef(0)

  const load = useCallback(async () => {
    if (!url) return
    const currentRequest = ++requestId.current
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await api.get(url)
      if (currentRequest !== requestId.current) return
      setState({ data: selectRef.current(response.data), loading: false, error: '' })
    } catch (failure) {
      if (currentRequest !== requestId.current) return
      setState({
        data: null,
        loading: false,
        error: apiErrorMessage(failure, 'Could not load this data.'),
      })
    }
  }, [url])

  useEffect(() => {
    void load()
  }, [load])

  return { ...state, reload: load }
}
