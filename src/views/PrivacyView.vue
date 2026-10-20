<script setup>
import { useSettingsStore } from '@/stores/settings.js'
import { CONSENT_VERSION } from '@/services/privacidad/consentimiento.js'
import { responsable } from '@/services/privacidad/responsable.js'
import {
  NUBE_PROVEEDOR, NUBE_REGION, HOSTING_PROVEEDOR, RETENCION_NUBE_DIAS, INACTIVIDAD_CUENTA_MESES, PLAZO_RESPUESTA_DIAS, INACTIVIDAD_SESION_MIN,
  SE_ENVIA_A_LA_NUBE, NUNCA_SALE_DEL_DISPOSITIVO, LO_PUBLICO, DERECHOS, CIFRADO_LOCAL_ALCANCE,
} from '@/data/privacidad.js'

/** SEC-19 / C-02: aviso de privacidad (ruta pública /privacidad). Describe lo que el sistema hace de verdad. ISO/IEC 27001:2013 A.18.1.4. */
const settings = useSettingsStore()
</script>

<template>
  <article class="card privacidad">
    <h1>Aviso de privacidad</h1>
    <p class="muted small">Versión del consentimiento vigente: {{ CONSENT_VERSION }}</p>

    <h2>Responsable del tratamiento y contacto</h2>
    <p data-testid="responsable">
      <strong>{{ responsable.nombre }}</strong>, a cargo del proyecto "Monitor ECG" de la asignatura de Programación Web.
      <template v-if="responsable.correo">Contacto para ejercer tus derechos: <a :href="`mailto:${responsable.correo}`">{{ responsable.correo }}</a>.</template>
      <template v-else>El correo de contacto aún no está configurado en este despliegue; mientras tanto, dirígete al docente de la asignatura.</template>
      Para reportar un problema de seguridad usa el formulario de la <RouterLink :to="{ name: 'seguridad', hash: '#reportar' }">página de Seguridad</RouterLink> (no incluyas datos de salud en el mensaje).
    </p>

    <h2>Finalidad</h2>
    <p>Exclusivamente académica: demostrar la adquisición, visualización y comparación de señales ECG con un sensor AD8232. El sistema <strong>no es un dispositivo médico</strong> ni realiza diagnósticos.</p>

    <h2>Menores de edad</h2>
    <p>La aplicación <strong>no está dirigida a menores de 18 años</strong>. Al crear una cuenta declaras ser mayor de edad y, al crear cada paciente, declaras que la persona medida lo es. No midas ni registres a menores.</p>

    <h2>Datos que se tratan</h2>
    <ul>
      <li>Seudónimo generado por el sistema («Paciente N»). No se piden nombre, RUT, teléfono, fecha de nacimiento ni fotos. Con cuenta, tu correo y contraseña (gestionados por Supabase Auth).</li>
      <li>Señal ECG, BPM y actividad realizada durante la medición (datos de salud: Confidencial-Sensible).</li>
      <li>Opcionales y solo con consentimiento: rango de edad, peso y nivel de actividad física habitual.</li>
      <li>Alias y notas (texto libre): son opcionales, <strong>no escribas nombres reales ni RUT</strong>, y solo existen en este dispositivo.</li>
      <li>Registro de auditoría técnico (sin valores de ECG, BPM, edad ni peso).</li>
    </ul>

    <h2>Uso de la cámara del celular</h2>
    <p>Si eliges la fuente "Cámara del celular", la app usa la cámara trasera y el flash solo para medir tu pulso (fotopletismografía). Se calcula el promedio de color de una zona central pequeña y de ahí solo una señal numérica: <strong>las imágenes nunca se guardan ni se envían</strong>. La cámara y el flash se apagan al terminar, al cambiar de pestaña o al bloquear la pantalla, y puedes revocar el permiso en los ajustes del navegador.</p>

    <h2>Base legal</h2>
    <p>Consentimiento expreso, informado, libre y revocable de la persona medida, exigido para datos sensibles de salud (Ley 19.628 y Ley 21.719 de protección de datos personales de Chile; Ley 20.584 como referencia de confidencialidad de datos de salud). Control de referencia: ISO/IEC 27001:2013 A.18.1.1 y A.18.1.4. Política de seguridad: <RouterLink to="/seguridad">/seguridad</RouterLink>.</p>

    <h2 id="cuentas">Sin cuenta, con cuenta y nube opcional</h2>
    <ul>
      <li><strong>Sin cuenta:</strong> todo queda cifrado solo en este dispositivo. No se envían datos de pacientes ni de monitoreos a ningún servidor.</li>
      <li><strong>Con cuenta:</strong> sigues guardando todo en este dispositivo. <strong>La nube es opcional y viene apagada</strong> («Guardar mis datos en la nube», en <RouterLink to="/cuenta">Mi cuenta</RouterLink>); la activas o apagas por cuenta.</li>
      <li><strong>Borradores:</strong> un monitoreo sin guardar nunca se envía. Solo al pulsar «Guardar monitoreo» (con la nube activada) se sube.</li>
    </ul>
    <h3>Qué se envía a la nube y cuándo</h3>
    <ul>
      <li v-for="t in SE_ENVIA_A_LA_NUBE" :key="t">{{ t }}</li>
    </ul>
    <h3>Qué nunca sale del dispositivo</h3>
    <ul>
      <li v-for="t in NUNCA_SALE_DEL_DISPOSITIVO" :key="t">{{ t }}</li>
    </ul>

    <h2>Qué significa «público»</h2>
    <p>
      Cada monitoreo es <strong>privado</strong> por defecto. Publicarlo exige tener la nube activada, que el paciente haya declarado ser mayor de edad y una autorización expresa <em>por monitoreo</em> de la persona medida.
      <strong>Quién lo ve:</strong> {{ LO_PUBLICO.quien }} <strong>Qué se publica:</strong> {{ LO_PUBLICO.que }} {{ LO_PUBLICO.no }}
      Puedes volver a privado cuando quieras (deja de ser visible de inmediato) y, si el paciente retira su consentimiento, vuelve a privado automáticamente. Cualquier cuenta puede reportar un monitoreo público y el administrador puede retirarlo.
    </p>

    <h2>Quién accede</h2>
    <p>La cuenta propietaria. El personal administrador no ve datos de salud ajenos: solo puede hacerlo de forma excepcional, con un motivo escrito, y cada acceso queda registrado y es visible para el titular. {{ NUBE_PROVEEDOR }} y {{ HOSTING_PROVEEDOR }} actúan como proveedores (encargados del tratamiento). No hay analítica ni telemetría y no se ceden datos a terceros.</p>

    <h2>Transferencia internacional</h2>
    <p>Cuando activas la nube, la copia se aloja en {{ NUBE_REGION }}, fuera de Chile, y el sitio se sirve desde la red de {{ HOSTING_PROVEEDOR }}. El cifrado en tránsito (TLS) y en reposo lo declara el proveedor. Si no quieres esa transferencia, no actives la nube: la aplicación funciona completa en modo local.</p>

    <h2>Retención</h2>
    <p><strong>En este dispositivo:</strong> los monitoreos se borran automáticamente a los <strong>{{ settings.retencionDias }} días</strong> (configurable por el administrador, 30 días por defecto, máximo 180). Esta purga no borra la copia de la nube.</p>
    <p><strong>En la nube:</strong> {{ RETENCION_NUBE_DIAS }} días desde el inicio de cada monitoreo; luego se eliminan automáticamente. Puedes borrarlos antes. Las cuentas sin uso por {{ INACTIVIDAD_CUENTA_MESES }} meses se avisan y se eliminan mediante un procedimiento manual del responsable. Las copias de respaldo del proveedor pueden conservar datos ya borrados durante su propia ventana.</p>

    <h2>Tus derechos y cómo ejercerlos</h2>
    <table class="derechos">
      <caption class="sr-only">Derechos del titular y vía de ejercicio</caption>
      <thead><tr><th scope="col">Derecho</th><th scope="col">Cómo ejercerlo</th></tr></thead>
      <tbody>
        <tr v-for="[d, c] in DERECHOS" :key="d"><th scope="row">{{ d }}</th><td>{{ c }}</td></tr>
      </tbody>
    </table>
    <p><strong>Plazo de respuesta:</strong> las acciones de la app son inmediatas; las solicitudes al responsable se atienden en un máximo de {{ PLAZO_RESPUESTA_DIAS }} días corridos. Si no quedas conforme puedes recurrir a la autoridad de protección de datos que establezca la ley. Para borrar tus datos en la nube o tu cuenta ve a <RouterLink to="/cuenta">Mi cuenta</RouterLink> (pide tu contraseña).</p>

    <h2>Sesión y equipos compartidos</h2>
    <p>Al iniciar sesión puedes marcar «Estoy en un equipo compartido»: la sesión vive solo en la pestaña (se pierde al cerrarla), se cierra tras {{ INACTIVIDAD_SESION_MIN }} minutos sin actividad (con aviso un minuto antes; una medición en curso cuenta como actividad) y, al salir, se quitan de ese equipo los datos de tu cuenta. En un equipo personal la sesión se mantiene hasta que la cierres.</p>

    <h2>Limitaciones de seguridad (transparencia)</h2>
    <ul>
      <li><strong>Cifrado local:</strong> {{ CIFRADO_LOCAL_ALCANCE.protege }} {{ CIFRADO_LOCAL_ALCANCE.noProtege }} {{ CIFRADO_LOCAL_ALCANCE.recomendacion }}</li>
      <li>Con la nube activa, el administrador es una cuenta con un rol y un segundo factor (TOTP) que valida el servidor. Sin nube, el administrador local con PIN disuade el uso indebido casual, pero no detiene a quien controle el equipo.</li>
      <li>Sin nube no hay respaldo central: si se borra el almacenamiento del navegador, los datos se pierden. La copia en la nube es un respaldo y la base de lo público.</li>
      <li>Los CSV exportados quedan bajo la responsabilidad de quien los descarga.</li>
    </ul>
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
</style>
