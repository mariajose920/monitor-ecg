<script setup>
import { ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { CONSENT_VERSION } from '@/services/privacidad/consentimiento.js'
import { responsable } from '@/services/privacidad/responsable.js'
import {
  NUBE_PROVEEDOR, NUBE_REGION, RETENCION_NUBE_DIAS, PLAZO_RESPUESTA_DIAS, SE_ENVIA_A_LA_NUBE, NUNCA_SALE_DEL_DISPOSITIVO, LO_PUBLICO,
} from '@/data/privacidad.js'
import { useSettingsStore } from '@/stores/settings.js'

/**
 * SEC-16 / C-02: consentimiento informado antes de usar los campos opcionales de un paciente. Describe lo que el sistema hace de verdad
 * (qué se envía a la nube y cuándo, qué se queda en el dispositivo, qué es público, plazos, derechos, responsable). Casilla NO premarcada.
 * Si la versión del texto cambia (CONSENT_VERSION) se vuelve a pedir.
 */
defineProps({ etiqueta: { type: String, required: true }, reconsentimiento: { type: Boolean, default: false } })
const emit = defineEmits(['acepto', 'no-acepto'])
const settings = useSettingsStore()
const leido = ref(false)
</script>

<template>
  <BaseDialog titulo="Consentimiento informado" ancho="720px" @cerrar="emit('no-acepto')">
    <p><DataClassBadge level="sensitive" texto="Datos opcionales" /></p>
    <p>Paciente: <strong>{{ etiqueta }}</strong> · versión del texto {{ CONSENT_VERSION }}</p>
    <p v-if="reconsentimiento" class="alert warn" role="status">
      El texto del consentimiento cambió (versión {{ CONSENT_VERSION }}). Hasta que lo aceptes de nuevo no se usan ni se suben los datos opcionales de este paciente.
    </p>
    <ul class="lista">
      <li><strong>Finalidad:</strong> exclusivamente académica (asignatura de Programación Web / bioinstrumentación). El sistema <strong>no es un dispositivo médico ni hace diagnósticos</strong>.</li>
      <li><strong>Datos que se tratan:</strong> rango de edad, peso y nivel de actividad física habitual, todos opcionales, junto con las mediciones del paciente (señal ECG, BPM y actividad), que son datos de salud. El paciente se identifica solo por un seudónimo («Paciente N»).</li>
      <li><strong>Mayoría de edad:</strong> la persona medida declara ser mayor de 18 años; la aplicación no mide menores.</li>
      <li>
        <strong>Dónde se guardan:</strong> siempre en <strong>este equipo y navegador</strong>, cifrados. Ese cifrado es una barrera básica: no protege frente a quien controle el equipo ni frente a código malicioso en la página.
        <strong>Ningún dato de pacientes ni de monitoreos se envía a un servidor</strong> si usas la aplicación <em>sin cuenta</em> o si, con cuenta, dejas apagado «Guardar mis datos en la nube» (viene apagado; con cuenta solo viajan los datos de la propia cuenta y un registro de seguridad mínimo).
      </li>
      <li>
        <strong>Qué se envía a la nube, y cuándo:</strong> solo con cuenta y con ese interruptor activado.
        <ul>
          <li v-for="t in SE_ENVIA_A_LA_NUBE" :key="t">{{ t }}</li>
        </ul>
        <strong>Nunca sale del dispositivo:</strong>
        <ul>
          <li v-for="t in NUNCA_SALE_DEL_DISPOSITIVO" :key="t">{{ t }}</li>
        </ul>
      </li>
      <li><strong>Transferencia internacional:</strong> la copia en la nube la aloja {{ NUBE_PROVEEDOR }} en {{ NUBE_REGION }} y el sitio se sirve desde la red de Vercel; es decir, los datos de la nube salen de Chile.</li>
      <li>
        <strong>Quién accede:</strong> la cuenta propietaria. El personal administrador <strong>no ve</strong> datos de salud ajenos; solo puede hacerlo de forma excepcional, con un motivo escrito, y cada acceso queda registrado y visible para ti.
        Los proveedores (Supabase, Vercel) actúan como encargados del tratamiento.
      </li>
      <li>
        <strong>Publicación:</strong> es una decisión aparte, monitoreo por monitoreo, con otra autorización expresa. {{ LO_PUBLICO.quien }} {{ LO_PUBLICO.que }} Si retiras este consentimiento, lo publicado vuelve a privado.
      </li>
      <li>
        <strong>Plazos:</strong> en este equipo, los monitoreos se borran automáticamente a los {{ settings.retencionDias }} días (configurable por el administrador, máximo 180).
        En la nube, a los {{ RETENCION_NUBE_DIAS }} días desde el inicio de cada monitoreo. Las copias de respaldo del proveedor pueden conservar datos borrados durante su propia ventana.
      </li>
      <li><strong>Derechos y retiro:</strong> puedes acceder, rectificar, suprimir, oponerte, retirar este consentimiento cuando quieras (los datos opcionales se borran de inmediato, en el equipo y en la nube) y exportar tus datos. Respondemos solicitudes en un máximo de {{ PLAZO_RESPUESTA_DIAS }} días corridos.</li>
      <li>
        <strong>Responsable del tratamiento:</strong> {{ responsable.nombre }}<template v-if="responsable.correo"> · contacto: <a :href="`mailto:${responsable.correo}`">{{ responsable.correo }}</a></template><template v-else> (el correo de contacto se publica en el aviso de privacidad cuando el responsable lo configura)</template>.
      </li>
    </ul>
    <p class="muted small">Más detalles en el <RouterLink to="/privacidad" target="_blank">aviso de privacidad</RouterLink>. Si no aceptas, puedes medir igualmente sin datos opcionales.</p>
    <label class="check">
      <input v-model="leido" type="checkbox" data-testid="acepto-consentimiento">
      He leído esta información y, en nombre de la persona medida (mayor de edad), acepto el tratamiento de sus datos opcionales para fines académicos en las condiciones descritas.
    </label>
    <template #acciones>
      <button class="btn" @click="emit('no-acepto')">No acepto</button>
      <button class="btn primary" :disabled="!leido" data-testid="aceptar-consentimiento" @click="emit('acepto')">Acepto</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.lista li {
  margin-bottom: 6px;
}
</style>
