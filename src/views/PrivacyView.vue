<script setup>
import { useSettingsStore } from '@/stores/settings.js'
import { CONSENT_VERSION } from '@/stores/users.js'

/** SEC-19: aviso de privacidad completo (ruta pública /privacidad). */
const settings = useSettingsStore()
</script>

<template>
  <article class="card privacidad">
    <h1>Aviso de privacidad</h1>
    <p class="muted small">Versión del consentimiento vigente: {{ CONSENT_VERSION }}</p>

    <h2>Responsable</h2>
    <p>El equipo de estudiantes del proyecto "Monitor ECG" de la asignatura de Programación Web, bajo la supervisión del docente a cargo, que actúa como administrador y custodio de los datos.</p>

    <h2>Finalidad</h2>
    <p>Exclusivamente académica: demostrar la adquisición, visualización y comparación de señales ECG con un sensor AD8232. El sistema <strong>no es un dispositivo médico</strong> ni realiza diagnósticos.</p>

    <h2>Datos que se tratan</h2>
    <ul>
      <li>Identificador seudónimo generado por el sistema ("Usuario N"); no se piden nombre, RUT, correo, teléfono, fecha de nacimiento ni fotos.</li>
      <li>Señal ECG cruda, BPM y actividad realizada durante la medición (datos de salud: Confidencial-Sensible).</li>
      <li>Opcionales y solo con consentimiento: rango de edad, peso y nivel de actividad física.</li>
      <li>Registro de auditoría técnico (sin valores de ECG, BPM, edad ni peso).</li>
    </ul>

    <h2>Base legal</h2>
    <p>Consentimiento informado, libre y revocable del participante (Ley 19.628 sobre protección de la vida privada y Ley 21.719 de protección de datos personales de Chile; Ley 20.584 como referencia de confidencialidad de datos de salud; RGPD art. 9 como buena práctica).</p>

    <h2>Dónde se guardan y quién accede</h2>
    <p>Solo en este navegador y equipo, cifrados con AES-GCM 256 (Web Crypto) en IndexedDB. No hay servidor ni base de datos remota y no se envían datos a terceros (sin analítica ni telemetría). Accede el administrador del curso desde este equipo.</p>

    <h2>Retención</h2>
    <p>Las mediciones se borran automáticamente a los <strong>{{ settings.retencionDias }} días</strong> (plazo configurable por el administrador, máximo 180).</p>

    <h2>Tus derechos</h2>
    <p>Puedes acceder a tus datos, retirar el consentimiento (borra de inmediato los datos opcionales) y solicitar la supresión con el botón "Eliminar mis datos" en la sección Participantes. Para rectificación u oposición, contacta al responsable.</p>

    <h2>Limitaciones de seguridad (transparencia)</h2>
    <ul>
      <li>La autenticación del administrador ocurre en el navegador: disuade el uso indebido casual, pero no detiene a alguien con control del equipo y de las herramientas de desarrollo.</li>
      <li>El cifrado protege frente a la lectura casual y a copias del almacenamiento, no frente a código malicioso que se ejecute en la propia página ni frente a quien controla el navegador abierto.</li>
      <li>No hay respaldo central: si se borra el almacenamiento del navegador, los datos se pierden.</li>
      <li>Los CSV exportados quedan bajo la responsabilidad de quien los descarga.</li>
    </ul>

    <h2 id="contacto">Contacto y reporte de problemas</h2>
    <p>Para ejercer tus derechos o reportar un problema de seguridad, contacta al docente responsable de la asignatura o al correo del equipo del proyecto. No incluyas datos de salud en el mensaje.</p>
  </article>
</template>

<style scoped>
.privacidad {
  max-width: 860px;
}

h2 {
  margin-top: 20px;
}
</style>
