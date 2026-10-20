<script setup>
import { useSettingsStore } from '@/stores/settings.js'
import { ref } from 'vue'
import { CONSENT_VERSION } from '@/stores/users.js'
import { cloudEnabled, deleteAllMyCloudData } from '@/services/cloud/cloudSync.js'
import { audit } from '@/services/audit/auditService.js'
import { notify } from '@/services/notifications/notifier.js'
import BaseDialog from '@/components/common/BaseDialog.vue'

/** SEC-19: aviso de privacidad completo (ruta pública /privacidad). ISO/IEC 27001:2013 A.18.1.4. */
const settings = useSettingsStore()
const confirmar = ref(false)
const borrando = ref(false)
const resultado = ref('')

/** SUG-06: derecho de supresión en la nube para la identidad (anónima) de este navegador. */
async function borrarNube() {
  borrando.value = true
  try {
    const r = await deleteAllMyCloudData()
    resultado.value = r ? `Se eliminaron ${r.sesiones} sesión(es) y ${r.incidentes} notificación(es) de la nube.` : 'La nube no está configurada.'
    await audit('CLOUD_DATA_DELETED', 'system', { sesiones: r?.sesiones ?? 0 })
    notify(resultado.value, { tipo: 'ok' })
  } catch (e) {
    notify(e.message || 'No se pudo borrar en la nube.', { tipo: 'error' })
  } finally {
    borrando.value = false
    confirmar.value = false
  }
}
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

    <h2>Uso de la cámara del celular</h2>
    <p>Si eliges la fuente "Cámara del celular", la app usa la cámara trasera y el flash solo para medir tu pulso (fotopletismografía). Se calcula el promedio de color de una zona central pequeña y de ahí solo una señal numérica: <strong>las imágenes nunca se guardan ni se envían</strong>. La cámara y el flash se apagan al terminar, al cambiar de pestaña o al bloquear la pantalla, y puedes revocar el permiso en los ajustes del navegador. Se registran en la auditoría solo los eventos de inicio, fin o rechazo (sin valores de salud). ISO/IEC 27001:2013 A.18.1.4.</p>

    <h2>Base legal</h2>
    <p>Consentimiento expreso, informado, libre y revocable del participante, exigido para datos sensibles de salud (Ley 19.628 sobre protección de la vida privada y Ley 21.719 de protección de datos personales de Chile; Ley 20.584 como referencia de confidencialidad de datos de salud; RGPD art. 9 como buena práctica).</p>
    <p class="muted small">Control de referencia: ISO/IEC 27001:2013 A.18.1.1 (legislación aplicable) y A.18.1.4 (protección y privacidad de la información de carácter personal). Política de seguridad: <RouterLink to="/seguridad">/seguridad</RouterLink>.</p>

    <h2 id="cuentas">Cuentas, pacientes y publicación de monitoreos</h2>
    <p>
      Puedes usar la app <strong>sin cuenta</strong> (todo queda cifrado solo en este dispositivo y no se sube nada) o <strong>con cuenta</strong>
      (correo y contraseña, Supabase Auth). Con cuenta, tus <strong>pacientes</strong> (seudónimos «Paciente N») y tus monitoreos se guardan en la nube y
      <strong>solo tú los ves</strong>: el administrador de la app tampoco accede a los perfiles de tus pacientes (minimización).
    </p>
    <p>
      Cada monitoreo es <strong>privado</strong> por defecto. Si marcas la casilla de consentimiento puedes hacerlo <strong>público</strong>: cualquier persona con una cuenta
      podrá verlo en solo lectura (pestaña «Comunidad»). Se publica la señal, el BPM, la actividad y la fecha (UTC), siempre como <strong>«Paciente anónimo»</strong>.
      No se publican etiqueta, alias, nombre ni nota del monitoreo, ni tu cuenta. Los datos opcionales del paciente (rango de edad, peso, actividad habitual) solo se
      incluyen con una segunda casilla expresa. Puedes volver a privado cuando quieras: deja de ser visible de inmediato y el cambio queda registrado.
    </p>
    <p>
      <strong>Base legal de la publicación:</strong> consentimiento expreso, informado, específico y revocable (Ley 19.628 y Ley 21.719); retirarlo es tan fácil como darlo.
      Los datos de salud publicados son <em>Confidencial-Sensible</em> aunque estén seudonimizados: publica solo con el consentimiento de la persona medida.
      Puedes eliminar tus datos en la nube o tu cuenta completa en cualquier momento. Al cerrar sesión puedes quitar los datos de tu cuenta de este equipo.
    </p>

    <h2>Dónde se guardan y quién accede</h2>
    <p>En este navegador y equipo, cifrados con AES-GCM 256 (Web Crypto) en IndexedDB. Si el proyecto tiene la nube configurada, se replica una copia seudonimizada en Supabase (PostgreSQL con TLS, cifrado en reposo y Row Level Security: cada cuenta solo ve lo suyo —y lo que otras cuentas publican de forma anónima—; el administrador autenticado puede ver monitoreos pero no los perfiles de pacientes. Sin cuenta no se sube nada). No hay analítica ni telemetría y no se ceden datos a terceros. Supabase y Vercel actúan como proveedores en la nube (ISO/IEC 27001:2013 A.15.1).</p>

    <h2>Retención</h2>
    <p><strong>Sesiones locales (en este equipo):</strong> se borran automáticamente a los <strong>{{ settings.retencionDias }} días</strong> (plazo configurable por el administrador, 30 días por defecto, máximo 180).</p>
    <p><strong>Monitoreos en la nube:</strong> se conservan <strong>365 días desde su fecha de inicio</strong>, salvo que los borres antes; luego se eliminan automáticamente. Las cuentas sin acceso durante 24 meses se avisan y después se eliminan.</p>

    <h2>Transferencia internacional</h2>
    <p>Si la nube está activa, la copia seudonimizada se aloja en la región elegida al crear el proyecto Supabase (por defecto fuera de Chile, p. ej. EE. UU.) y el sitio se sirve desde la red de Vercel. Esto se informa en el consentimiento, se minimizan los datos (solo seudónimos) y los proveedores declaran cifrado en tránsito y en reposo. Si no aceptas la transferencia, la app funciona en modo 100 % local (sin variables de la nube).</p>

    <h2>Tus derechos y cómo ejercerlos</h2>
    <table class="derechos">
      <caption class="sr-only">Derechos del titular y vía de ejercicio</caption>
      <thead><tr><th scope="col">Derecho</th><th scope="col">Cómo ejercerlo en la app</th></tr></thead>
      <tbody>
        <tr><th scope="row">Acceso</th><td>Sección Sesiones: ver tus mediciones y su detalle.</td></tr>
        <tr><th scope="row">Rectificación</th><td>Participantes → editar datos opcionales; para otros datos, contacta al responsable.</td></tr>
        <tr><th scope="row">Supresión</th><td>Participantes → "Eliminar mis datos" (local y su réplica) y el botón de abajo para todo lo de este navegador en la nube.</td></tr>
        <tr><th scope="row">Oposición / retiro del consentimiento</th><td>Participantes → retirar consentimiento (borra de inmediato los datos opcionales).</td></tr>
        <tr><th scope="row">Portabilidad</th><td>Sesiones → exportar CSV (formato abierto y legible por máquina).</td></tr>
      </tbody>
    </table>
    <p><strong>Plazo de respuesta:</strong> las acciones de la app son inmediatas; las solicitudes al responsable se atienden en un máximo de 30 días corridos. Si no quedas conforme puedes recurrir a la autoridad de protección de datos que establezca la ley.</p>

    <section class="borrado-nube" aria-labelledby="borrar-nube">
      <h3 id="borrar-nube">Eliminar mis datos en la nube</h3>
      <p v-if="!cloudEnabled" class="muted small">La nube no está configurada en este despliegue: tus datos solo existen en este navegador.</p>
      <template v-else>
        <p class="small">Borra en Supabase todas las sesiones (y sus muestras) y las notificaciones de incidentes creadas desde este navegador. No afecta a otros participantes.</p>
        <button class="btn danger" :disabled="borrando" data-testid="borrar-nube" @click="confirmar = true">Eliminar mis datos en la nube</button>
        <p v-if="resultado" class="small" role="status">{{ resultado }}</p>
      </template>
    </section>

    <BaseDialog v-if="confirmar" titulo="¿Eliminar tus datos en la nube?" @cerrar="confirmar = false">
      <p>Esta acción es irreversible. Las copias locales de este navegador no se tocan.</p>
      <template #acciones>
        <button class="btn ghost" @click="confirmar = false">Cancelar</button>
        <button class="btn danger" :disabled="borrando" @click="borrarNube">Sí, eliminar</button>
      </template>
    </BaseDialog>

    <h2>Limitaciones de seguridad (transparencia)</h2>
    <ul>
      <li>La autenticación del administrador ocurre en el navegador: disuade el uso indebido casual, pero no detiene a alguien con control del equipo y de las herramientas de desarrollo.</li>
      <li>El cifrado protege frente a la lectura casual y a copias del almacenamiento, no frente a código malicioso que se ejecute en la propia página ni frente a quien controla el navegador abierto.</li>
      <li>Sin nube configurada no hay respaldo central: si se borra el almacenamiento del navegador, los datos se pierden.</li>
      <li>Los CSV exportados quedan bajo la responsabilidad de quien los descarga.</li>
    </ul>

    <h2 id="contacto">Contacto y reporte de problemas</h2>
    <p>Para ejercer tus derechos, contacta al docente responsable de la asignatura o al correo del equipo del proyecto. Para reportar un problema de seguridad usa el formulario de la <RouterLink :to="{ name: 'seguridad', hash: '#reportar' }">página de Seguridad</RouterLink> (ISO/IEC 27001:2013 A.16.1.2/A.16.1.3). No incluyas datos de salud en el mensaje.</p>
  </article>
</template>

<style scoped>
.privacidad {
  max-width: 860px;
}

h2 {
  margin-top: 20px;
}

.derechos {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
}

.derechos th,
.derechos td {
  text-align: left;
  border-bottom: 1px solid var(--border);
  padding: 6px 8px;
  vertical-align: top;
}

.borrado-nube {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
}
</style>
