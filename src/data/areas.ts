import type { AreaId } from '../engine/types'
import type { DeptId } from './budget'

/** What people worry about: the rows of the demand panel. */
export const AREA_LABEL: Record<AreaId, string> = {
  housing: '住屋',
  jobs: '就業',
  transport: '交通',
  care: '醫療安老',
  education: '教育',
  environment: '環境',
}

export const DEPT_AREA: Record<DeptId, AreaId> = {
  housing: 'housing',
  transport: 'transport',
  economy: 'jobs',
  education: 'education',
  health: 'care',
  environment: 'environment',
}

export const AREA_DEPT = Object.fromEntries(Object.entries(DEPT_AREA).map(([d, a]) => [a, d])) as Record<AreaId, DeptId>
