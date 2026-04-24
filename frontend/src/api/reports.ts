import client from './client'

export interface ReportParams {
  date_from?: string
  date_to?: string
  education_level?: string
  course?: string
  group?: string
  student_id?: string
  student_ids?: string[]
  category?: string
  status?: string
}

export const reportsApi = {
  exportCsv(type: string, params: ReportParams | URLSearchParams) {
    const target =
      params instanceof URLSearchParams ? `/reports/${type}?${params.toString()}` : `/reports/${type}`
    return client.get(target, { params: params instanceof URLSearchParams ? undefined : params, responseType: 'blob' })
  },
}
