import { checkInScene } from './checkin.scene'
import { adminScene } from './admin.scene'

export const SCENE_IDS = {
  CHECKIN: 'CHECKIN',
  ORDER: 'ORDER',
  ADMIN: 'ADMIN'
} as const

export const allScenes = [checkInScene, adminScene]
