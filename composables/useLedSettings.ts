/** impostazioni dei LED simulati, condivise tra il pannello e il simulatore */
import type { LedEffectName, LedLayoutName } from '~/utils/leds'

const on = ref(false)                        // spenti = come una dapo senza LED
const layout = ref<LedLayoutName>('raggi')
const effect = ref<LedEffectName>('speed')
const diffuseCm = ref(2.5)                   // quanto la luce si allarga nel tessuto
const night = ref(false)                     // scena al buio: si vede meglio la luce

export function useLedSettings() {
  return { on, layout, effect, diffuseCm, night }
}
