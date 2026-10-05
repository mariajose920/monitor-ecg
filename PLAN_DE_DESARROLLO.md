# Plan de Desarrollo: Plataforma ECG Web

Este documento describe el paso a paso para la construcción de la plataforma web de monitorización cardíaca utilizando Vue 3.

## Fase 1: Configuración y Estructura Base (Completado/En curso)
1. **Inicializar proyecto**: Creación del proyecto base con Vite y Vue 3.
2. **Instalación de dependencias**: Agregar `vue-router` (rutas), `pinia` (estado) y `chart.js` / `vue-chartjs` (gráficos).
3. **Estructura de carpetas**: Crear los directorios para componentes, vistas, stores y servicios (comunicación con ESP32).

## Fase 2: Implementación de la Interfaz (Frontend)
1. **Vista de Inicio de Sesión (RF01, RF02, RF03)**: Formulario simple de identificación sin contraseña, con campos opcionales para datos biométricos.
2. **Layout Principal y Navegación**: Barra de navegación superior o lateral para acceder a la medición, el panel de administración y la sección educativa.
3. **Vista de Medición (RF05-RF07)**: Integración de Chart.js para mostrar el electrocardiograma en tiempo real y el valor de BPM.
4. **Vista de Comparación (RF11-RF14)**: Gráfico dual para sobreponer una señal de referencia frente a la señal en tiempo real.
5. **Sección Educativa (RF21-RF24)**: Creación de componentes de solo lectura con la información teórica sobre la frecuencia cardíaca y el sensor.

## Fase 3: Lógica de Negocio y Comunicación ESP32
1. **Servicio de Comunicación (RF04, RF08, RF09)**: Implementación de la conexión mediante Web Serial API para recibir los datos del Arduino/ESP32 por USB y transformarlos en formato usable para el gráfico.
2. **Gestor de Estado (Pinia)**: 
   - Guardar historial de mediciones (sesión activa).
   - Guardar parámetros configurados por el administrador.
3. **Sistema de Alertas (RF15-RF17, RF20)**: Lógica para comparar el BPM actual con los umbrales (ej: 60-100) definidos en el perfil de Admin, mostrando notificaciones en pantalla.

## Fase 4: Pruebas y Ajustes Finales (RNF01-RNF09)
1. **Diseño Responsivo**: Asegurar que la vista de medición y los gráficos se adapten a teléfonos móviles y computadoras.
2. **Simulación de Datos**: Crear un generador de señales ficticio para probar los gráficos y las alertas sin necesidad de tener el sensor conectado permanentemente.
3. **Despliegue**: Preparar el proyecto para ser alojado en Vercel.
