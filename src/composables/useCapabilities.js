import { readonly, reactive } from 'vue'

/** Detección de capacidades del navegador (RNF02, I5). */
const caps = reactive({
  webSerial: typeof navigator !== 'undefined' && 'serial' in navigator,
  webBluetooth: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
  secureContext: typeof window !== 'undefined' && window.isSecureContext === true,
  indexedDb: typeof indexedDB !== 'undefined',
  webCrypto: typeof crypto !== 'undefined' && !!crypto.subtle,
  tactil: typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches,
})

export function useCapabilities() {
  return readonly(caps)
}
