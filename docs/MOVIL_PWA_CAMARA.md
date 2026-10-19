# Móvil, PWA y cámara (PPG)

Uso educativo. **No es un ECG ni un dispositivo médico**: la cámara mide el pulso por fotopletismografía (PPG), no la actividad eléctrica del corazón.

## Instalar la app
- **Android (Chrome), recomendado**: abre https://monitor-ecg1.vercel.app/ ; aparece el banner "Instalar aplicación" (botón Instalar / "Ahora no"). Si no aparece: menú de Chrome (⋮) > "Instalar app" o "Agregar a la pantalla principal". Se abre en modo standalone desde el ícono.
- **iPhone (Safari), segunda etapa**: Compartir > "Agregar a pantalla de inicio". iOS no ofrece el evento de instalación.
- Sin conexión funciona el app shell y lo local (los datos viven en IndexedDB). La nube (Supabase) requiere red. Al haber nueva versión aparece el aviso "Actualizar".

## Medir con la cámara
1. Monitor > fuente "Cámara del celular (PPG con flash)" > "Medir con la cámara (guía)".
2. Acepta el consentimiento y permite la cámara.
3. Cubre cámara trasera y flash con la yema del dedo, presión suave. El flash se enciende solo; si falla, toca "Encender flash" o activa la linterna a mano.
4. Quédate quieto 45 s (brazo apoyado, sin hablar, manos tibias). El indicador muestra "Señal buena", "Ajusta el dedo", "Muy fuerte presión" o "Movimiento detectado".
5. Resultado y "Continuar con la sesión": el flujo de sesión, rangos, alertas, guardado, comparación y exportación es el habitual.
Las imágenes nunca se guardan ni se envían; la cámara y el flash se apagan al desconectar o al cambiar de pestaña.

## Limitaciones
- Torch: Chrome en Android lo permite en la mayoría de equipos; **Safari en iOS no** (usa luz ambiental fuerte).
- La calidad depende del sensor, la cámara y la temperatura de los dedos.
- Requiere HTTPS (o localhost) para la cámara y el service worker.
- Medición con ~30 fps; error esperado de unos pocos lpm en reposo.

## Probar en el celular real
- Producción: https://monitor-ecg1.vercel.app/ (HTTPS).
- Local: `npm run build && npm run preview -- --host`; la cámara exige HTTPS, así que usa un túnel HTTPS (p. ej. `cloudflared tunnel --url http://localhost:4173` o ngrok) o en Android Chrome `chrome://inspect` con reenvío de puerto a localhost.
- Iconos: `npm run gen:iconos`.
