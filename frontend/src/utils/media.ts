function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}

export function buildMediaUrl(path?: string | null, version?: string | null) {
  if (!path) {
    return ''
  }

  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
    return version ? appendQueryParam(path, 'v', version) : path
  }

  if (path.startsWith('s3:')) {
    let url = `/api/v1/public/media?path=${encodeURIComponent(path)}`
    if (version) {
      url = appendQueryParam(url, 'v', version)
    }
    return url
  }

  const normalizedPath = path.replace(/^\/+/, '')
  const url = `/static/${normalizedPath}`
  return version ? appendQueryParam(url, 'v', version) : url
}

export function buildMediaUrlOrNull(path?: string | null, version?: string | null) {
  return path ? buildMediaUrl(path, version) : null
}
