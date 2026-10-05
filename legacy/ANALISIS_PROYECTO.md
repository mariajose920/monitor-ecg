# Análisis y Planificación del Proyecto de Software (Monitor ECG)

## 1. Idea General del Proyecto
A partir del código Arduino proporcionado, la idea es desarrollar una plataforma web o **Dashboard (Panel de Control)** que permita visualizar en tiempo real la información fisiológica obtenida por el sensor de ECG (AD8232). El Arduino envía los datos (tiempo, valor crudo del ECG, estado de los electrodos y BPM) mediante el puerto serie. 

El sitio web interceptará estos datos (idealmente mediante la **Web Serial API**, que permite al navegador leer el puerto serie directamente sin necesidad de servidores intermedios, o a través de un backend ligero) para graficar la onda del electrocardiograma y mostrar la frecuencia cardíaca (BPM) en vivo.

*Nota: En la información entregada al principio de tu mensaje aparece contenido sobre lecciones de inglés (vocabulario y gramática). Asumo que esto se pegó por accidente y me enfocaré en el código biomédico de ECG. Si tiene relación con el proyecto, por favor indícamelo.*

## 2. Requerimientos Funcionales
Son las funciones específicas que debe cumplir el sitio web:
1. **Conexión Serial:** Interfaz en la web (botón) que permita al usuario solicitar conexión con el puerto serie del Arduino.
2. **Recepción de Datos:** El sistema debe ser capaz de leer el flujo de datos CSV entrante (`t_ms, ecg_raw, leads_off, bpm`).
3. **Visualización de la Onda ECG:** Gráfico dinámico en tiempo real que trace el valor de `ecg_raw` respecto al tiempo.
4. **Visualización de BPM:** Indicador numérico destacado que muestre los latidos por minuto en tiempo real.
5. **Alerta de Electrodos ("Leads-off"):** Indicador visual que alerte al usuario si el estado `leads_off` es 1 (electrodos desconectados).
6. **Registro/Exportación (Opcional):** Opción para grabar los datos leídos en un archivo `.csv` descargable desde el navegador para su posterior análisis.

## 3. Requerimientos No Funcionales
Son las características de calidad, rendimiento y seguridad:
1. **Rendimiento:** El gráfico debe actualizarse fluidamente (el Arduino muestrea a 250 Hz, es decir, 250 datos por segundo). El renderizado del gráfico no debe bloquear la página.
2. **Usabilidad:** Interfaz limpia, con un estilo de panel médico ("dark mode" o tema clínico) y fácil de entender.
3. **Compatibilidad:** Dado que usaremos Web Serial API, el sitio requerirá un navegador compatible (Chrome, Edge u Opera en PC). 
4. **Seguridad:** Advertencia visible en la aplicación sobre el riesgo eléctrico de conectarse directamente a la red sin aislamiento (como ya está descrito en el código de Arduino).

## 4. Procedimiento y Siguientes Pasos
Para construir la carpeta `software` y el sitio web, sugiero esta secuencia:

1. **Estructura Base (Frontend puro):**
   - Crear `index.html` (Estructura de la página, contenedor del gráfico y métricas).
   - Crear `style.css` (Diseño moderno e intuitivo).
   - Crear `app.js` (Lógica de conexión a la Web Serial API y actualización de la interfaz).
2. **Integración de Gráficos:**
   - Incorporar una biblioteca de gráficos rápida (como *Chart.js* o *SmoothieCharts* / *uPlot* que manejan bien los datos de alta frecuencia).
3. **Pruebas de Conexión:**
   - Subir el código Arduino entregado a la placa.
   - Conectar la placa por USB/Bluetooth al PC.
   - Abrir el sitio web, emparejar el puerto y validar que la gráfica se dibuja en tiempo real.
4. **Refinamiento:**
   - Añadir manejo de errores (ej. pérdida de conexión).
   - Implementar la función de exportar datos si es necesario.

## 5. Preguntas para continuar
Para avanzar de manera precisa, me gustaría que me confirmes lo siguiente:
1. ¿El fragmento de inglés al inicio de tu mensaje fue pegado por error, o el proyecto tiene un enfoque educativo bilingüe?
2. ¿Estás de acuerdo con utilizar la **Web Serial API**? Esto permite que la web funcione de forma directa (abriendo un archivo HTML en Chrome) sin necesidad de instalar Python o Node.js como servidores backend.
3. Al revisar la carpeta original, veo que también hay archivos sobre un "Sensor de Lactato". ¿Este sitio web de software deberá integrar la información de lactato a futuro, o por ahora nos enfocamos 100% en el ECG?

---
*Este archivo se ha guardado en la ruta `c:\Users\mjvil\OneDrive\Escritorio\dario\software\ANALISIS_PROYECTO.md`.*
