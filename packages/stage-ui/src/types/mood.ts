export type CoreMood = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'relaxed' | 'thinking' | 'cool'

export interface MoodState {
  current: CoreMood
  intensity: number // 0 to 1
  valence: number // -1 (negative) to 1 (positive)
  arousal: number // -1 (calm) to 1 (excited)
  lastUpdate: number // timestamp
}

export interface MoodLogEntry {
  timestamp: number
  userId: string
  characterId: string
  context: string // snippet of trigger text
  shift: {
    valence: number
    arousal: number
  }
}
