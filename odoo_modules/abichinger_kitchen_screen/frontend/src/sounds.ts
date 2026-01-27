import { useState } from './state'

export interface Sound {
  id: string
  url: string | null
}

let sounds: Sound[] = []
export function getSounds(): Sound[] {
  if (sounds.length == 0) {
    sounds = [
      {
        id: 'none',
        url: null,
      },
      {
        id: 'alert',
        url: import.meta.env.BASE_URL + '/sounds/alert.mp3',
      },
      {
        id: 'champagne',
        url: import.meta.env.BASE_URL + '/sounds/champagne-cork.mp3',
      },
      {
        id: 'dingaling',
        url: import.meta.env.BASE_URL + '/sounds/dingaling.mp3',
      },
      {
        id: 'dripecho',
        url: import.meta.env.BASE_URL + '/sounds/drip-echo.mp3',
      },
      {
        id: 'rooster',
        url: import.meta.env.BASE_URL + '/sounds/rooster-call.mp3',
      },
    ]
  }
  return sounds
}

export function soundById(id: string): Sound | undefined {
  return getSounds().find((s) => s.id == id)
}

const player = new Audio()
export async function play(sound: Sound) {
  if (sound.url == null) {
    return
  }
  player.setAttribute('src', sound.url)
  player.load()
  await player.play()
}

let _muted = 'none'
export function mute() {
  const state = useState()
  if (state.sound.value !== 'none') {
    _muted = state.sound.value
  }
  state.sound.value = 'none'
}

export function unmute() {
  if (_muted !== 'none') {
    const state = useState()
    state.sound.value = _muted
  }
}
