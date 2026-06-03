import { checkInScene } from './checkin.scene'
import { orderScene } from './order.scene'
import { adminScene } from './admin.scene'

export const SCENE_IDS = {
  CHECKIN: 'CHECKIN',
  ORDER: 'ORDER',
  ADMIN: 'ADMIN'
} as const

export const allScenes = [checkInScene, orderScene, adminScene]
