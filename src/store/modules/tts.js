import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTTSStore = defineStore('tts', () => {
  // State
  const isPlaying = ref(false)
  const currentText = ref('')
  const voice = ref(null)
  const rate = ref(1.0)
  const pitch = ref(1.0)
  const volume = ref(1.0)
  
  // Actions
  const speak = async (text, language = 'en') => {
    if (isPlaying.value) {
      stop()
    }
    
    isPlaying.value = true
    currentText.value = text
    
    try {
      // Mock TTS functionality
      console.log(`Speaking: "${text}" in ${language}`)
      
      // Simulate speech duration
      const duration = Math.max(1000, text.length * 50)
      await new Promise(resolve => setTimeout(resolve, duration))
      
      return { success: true }
    } catch (error) {
      console.error('TTS error:', error)
      throw error
    } finally {
      isPlaying.value = false
      currentText.value = ''
    }
  }
  
  const stop = () => {
    if (isPlaying.value) {
      isPlaying.value = false
      currentText.value = ''
      console.log('TTS stopped')
    }
  }
  
  const setRate = (newRate) => {
    rate.value = Math.max(0.1, Math.min(2.0, newRate))
  }
  
  const setPitch = (newPitch) => {
    pitch.value = Math.max(0.0, Math.min(2.0, newPitch))
  }
  
  const setVolume = (newVolume) => {
    volume.value = Math.max(0.0, Math.min(1.0, newVolume))
  }
  
  return {
    // State
    isPlaying,
    currentText,
    voice,
    rate,
    pitch,
    volume,
    
    // Actions
    speak,
    stop,
    setRate,
    setPitch,
    setVolume
  }
})