import client from './client'

export interface PointsRule {
  level: string
  base_points: number
}

export interface ResultMultiplier {
  result: string
  percent: number
}

export interface PointsMatrixRow {
  level: string
  base_points: number
  scores: Record<string, number>
}

export interface GpaRule {
  range: string
  points: number | string
  note: string
}

export interface PointsRulesResponse {
  formula: string
  level_points: PointsRule[]
  result_multipliers: ResultMultiplier[]
  matrix: PointsMatrixRow[]
  categories: string[]
  category_note: string
  status_note: string
  balance_note: string
  gpa_rules: GpaRule[]
  my_gpa_bonus: number
}

export const pointsApi = {
  getRules() {
    return client.get<PointsRulesResponse>('/points/rules')
  },
}
