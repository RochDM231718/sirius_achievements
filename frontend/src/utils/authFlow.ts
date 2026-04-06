export type AuthFlowType = 'verify_email' | 'reset_password' | 'reset_password_verified'

interface StoredAuthFlow {
  type: AuthFlowType
  token: string
  email?: string
  resendAvailableAt?: number
  expiresAt?: number
}

const FLOW_STORAGE_KEYS: Record<AuthFlowType, string> = {
  verify_email: 'sirius_verify_email_flow',
  reset_password: 'sirius_reset_password_flow',
  reset_password_verified: 'sirius_reset_password_verified_flow',
}

function isBrowserAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function decodeTokenExpiry(token: string): number | undefined {
  try {
    const [, payload] = token.split('.')
    if (!payload) {
      return undefined
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const json = JSON.parse(atob(padded)) as { exp?: number }

    return typeof json.exp === 'number' ? json.exp * 1000 : undefined
  } catch {
    return undefined
  }
}

function readFlow(type: AuthFlowType): StoredAuthFlow | null {
  if (!isBrowserAvailable()) {
    return null
  }

  const raw = window.localStorage.getItem(FLOW_STORAGE_KEYS[type])
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredAuthFlow
    if (!parsed.token) {
      clearAuthFlow(type)
      return null
    }

    if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
      clearAuthFlow(type)
      return null
    }

    return parsed
  } catch {
    clearAuthFlow(type)
    return null
  }
}

export function getStoredAuthFlow(type: AuthFlowType) {
  return readFlow(type)
}

export function saveAuthFlow(
  type: AuthFlowType,
  token: string,
  options: {
    email?: string
    resendAvailableAt?: number
  } = {}
) {
  if (!isBrowserAvailable()) {
    return null
  }

  const current = readFlow(type)
  const nextFlow: StoredAuthFlow = {
    type,
    token,
    email: options.email ?? current?.email,
    resendAvailableAt: options.resendAvailableAt ?? current?.resendAvailableAt,
    expiresAt: decodeTokenExpiry(token) ?? current?.expiresAt,
  }

  window.localStorage.setItem(FLOW_STORAGE_KEYS[type], JSON.stringify(nextFlow))
  return nextFlow
}

export function clearAuthFlow(type: AuthFlowType) {
  if (!isBrowserAvailable()) {
    return
  }

  window.localStorage.removeItem(FLOW_STORAGE_KEYS[type])
}

export function clearAllAuthFlows() {
  clearAuthFlow('verify_email')
  clearAuthFlow('reset_password')
  clearAuthFlow('reset_password_verified')
}

export function getAuthFlowToken(type: AuthFlowType) {
  return readFlow(type)?.token ?? ''
}

export function getAuthFlowEmail(type: AuthFlowType) {
  return readFlow(type)?.email ?? ''
}

export function getAuthFlowRemainingSeconds(type: AuthFlowType) {
  const resendAvailableAt = readFlow(type)?.resendAvailableAt
  if (!resendAvailableAt) {
    return 0
  }

  return Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000))
}

export function hasStoredAuthFlow(type: AuthFlowType) {
  return Boolean(readFlow(type))
}
