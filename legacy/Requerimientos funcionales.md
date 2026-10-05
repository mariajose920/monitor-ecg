**Requerimientos funcionales**

1\. **Requerimientos funcionales**

## **1.1 Gestión e identificación de usuarios**

**RF01. Identificación de usuario**

El sistema deberá permitir identificar al usuario que realizará una medición mediante un identificador, por ejemplo, “Usuario 1”, “Usuario 2”, etc.

**RF02. Inicio de sesión sin contraseña**

El sistema deberá permitir seleccionar o ingresar un identificador de usuario sin requerir una contraseña.

**RF03. Registro de información opcional**

El sistema podrá permitir ingresar información adicional del usuario, como edad, peso o actividad física, de manera opcional y sujeta a las condiciones éticas del proyecto.

## **1.2 Medición y visualización en tiempo real**

**RF04. Recepción de datos**

El sistema deberá recibir los datos provenientes del sensor de frecuencia cardíaca conectado al ESP32.

**RF05. Visualización de señal en tiempo real**

El sistema deberá mostrar gráficamente la señal obtenida desde el sensor en tiempo real.

**RF06. Visualización del valor de frecuencia**

El sistema deberá mostrar el valor de frecuencia correspondiente a la señal recibida.

**RF07. Visualización de múltiples mediciones**

El sistema deberá permitir visualizar simultáneamente las señales provenientes de hasta cinco sensores o usuarios.

**RF08. Inicio de medición**

El sistema deberá permitir iniciar una sesión de medición para uno o varios usuarios.

**RF09. Finalización de medición**

El sistema deberá detener la medición cuando el sensor sea desconectado o se pierda la comunicación.

**RF10. Estado de conexión**

El sistema deberá indicar el estado de la conexión o de la medición, diferenciando al menos entre una medición activa y una pérdida o finalización de señal.

## **1.3 Comparación de señales**

**RF11. Uso de señal validada**

El sistema deberá permitir utilizar una señal cardíaca previamente validada como referencia para la comparación con la señal obtenida por el sensor.

**RF12. Comparación de señales**

El sistema deberá permitir comparar la señal obtenida mediante el sensor desarrollado con una señal de referencia validada.

**RF13. Visualización comparativa**

El sistema deberá permitir visualizar simultáneamente la señal experimental y la señal de referencia para facilitar su comparación.

**RF14. Sincronización de señales**

El sistema deberá permitir sincronizar las señales utilizadas en la comparación.

## **1.4 Parámetros y evaluación de la medición**

**RF15. Configuración de parámetros**

El sistema deberá permitir al administrador establecer un parámetro mínimo y un parámetro máximo para la evaluación de la medición.

**RF16. Comparación con parámetros**

El sistema deberá comparar el valor registrado con los parámetros mínimo y máximo establecidos.

**RF17. Indicación del estado de la medición**

El sistema deberá indicar si el valor registrado se encuentra dentro o fuera del rango configurado.

**RF18. Clasificación de actividad**

El sistema deberá permitir indicar el estado o actividad realizada durante la medición, por ejemplo, reposo o movimiento.

**RF19. Registro del contexto de medición**

El sistema deberá asociar la actividad o contexto seleccionado con la medición correspondiente.

## **1.5 Alertas e información educativa**

**RF20. Alerta por valor fuera de rango**

El sistema deberá notificar al usuario cuando el valor registrado se encuentre fuera del rango configurado.

**RF21. Información sobre posibles causas**

El sistema deberá mostrar información educativa sobre posibles factores que pueden producir variaciones en la frecuencia cardíaca.

**RF22. Información sobre frecuencia cardíaca**

El sistema deberá proporcionar información educativa sobre la frecuencia cardíaca y su relación con la fisiología.

**RF23. Información sobre el sensor**

El sistema deberá proporcionar información introductoria sobre el funcionamiento del sensor infrarrojo utilizado para obtener la señal.

**RF24. Información relacionada con ingeniería**

El sistema deberá proporcionar contenido introductorio sobre la aplicación de la ingeniería en la medición y análisis de señales.

## **1.6 Administración**

**RF25. Perfil de administrador**

El sistema deberá contar con un perfil de administrador.

**RF26. Administración de parámetros**

El administrador deberá poder modificar los valores mínimo y máximo utilizados para evaluar las mediciones.

**RF27. Configuración de sincronización**

El administrador deberá poder seleccionar el método de sincronización de las mediciones.

# **2\. Requerimientos no funcionales preliminares**

**RNF01. Responsividad**

La plataforma deberá adaptarse a computadores, tablets y teléfonos móviles.

**RNF02. Accesibilidad multiplataforma**

La plataforma deberá poder utilizarse desde navegadores web en diferentes dispositivos.

**RNF03. Visualización en tiempo real**

La plataforma deberá actualizar la señal recibida con una latencia suficientemente baja para permitir su visualización prácticamente en tiempo real.

**RNF04. Usabilidad**

La interfaz deberá presentar la información de manera visual, clara e intuitiva.

**RNF05. Disponibilidad**

La plataforma deberá estar disponible durante las sesiones de medición.

**RNF06. Seguridad**

El sistema deberá proteger la información asociada a los usuarios y limitar las funciones administrativas al perfil correspondiente.

**RNF07. Escalabilidad**

El sistema debería permitir aumentar el número de sensores conectados en futuras versiones.

**RNF08. Compatibilidad**

La plataforma deberá ser compatible con los ESP32 y sensores definidos para el proyecto.

**RNF09. Despliegue**

La plataforma deberá poder desplegarse en un servicio de alojamiento web, considerando Vercel como una alternativa.

