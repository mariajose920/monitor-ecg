<script setup>
import SafetyBanner from '@/components/layout/SafetyBanner.vue'
import CapabilityNotice from '@/components/common/CapabilityNotice.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useCapabilities } from '@/composables/useCapabilities.js'
import { useUsersStore } from '@/stores/users.js'

const caps = useCapabilities()
const users = useUsersStore()

const stats = [
  { valor: '100 Hz', label: 'Muestreo continuo' },
  { valor: '12 bits', label: 'Resolución ADC ESP32' },
  { valor: '100%', label: 'Privacidad local' },
  { valor: '< 2 ms', label: 'Latencia de picos' },
]

const tarjetasMision = [
  {
    titulo: 'Sensor Óptico PPG',
    sub: 'MAX30100 / MAX30102',
    desc: 'Medición no invasiva de la onda de pulso por absorción de luz LED roja e infrarroja en la yema del dedo.',
    tag: 'Óptico',
    color: '#e11d48',
  },
  {
    titulo: 'Electrocardiografía',
    sub: 'Módulo AD8232',
    desc: 'Adquisición de biopotenciales bioeléctricos cardíacos con derivaciones bipolares e inmunidad al ruido.',
    tag: 'Bioeléctrico',
    color: '#0284c7',
  },
  {
    titulo: 'Docencia e Informes',
    sub: 'Capturas clínicas',
    desc: 'Generación instantánea de imágenes milimetradas de 1200×560 px listas para adjuntar en tu reporte académico.',
    tag: 'Académico',
    color: '#6366f1',
  },
]

const iniciativas = [
  {
    titulo: 'Osciloscopio en Vivo',
    desc: 'Visualización fluida con uPlot, congelamiento momentáneo y registro en segundo plano sin interrupciones.',
    to: '/monitor',
    tag: 'Tiempo Real',
    icon: 'pulse',
  },
  {
    titulo: 'Gestión de Pacientes',
    desc: 'Registro ético de participantes bajo seudónimos protegidos (SEC-05) y consentimiento informado.',
    to: '/pacientes',
    tag: 'Privacidad',
    icon: 'user',
  },
  {
    titulo: 'Historial y Exportación',
    desc: 'Filtros avanzados por fecha, participante y actividad, con descarga directa en formatos CSV y JSON.',
    to: '/monitoreos',
    tag: 'Registros',
    icon: 'download',
  },
]
</script>

<template>
  <div class="aeline-home">
    <!-- HERO BANNER estilo Aeline & Cardio: Gran contenedor curvo luminoso con elementos flotantes -->
    <section class="hero-canvas">
      <div class="hero-main-content">
        <!-- Badge superior con ícono orgánico -->
        <div class="hero-pill-badge">
          <AppIcon name="pulse" :size="15" />
          <span>TECNOLOGÍA BIOMÉDICA & DOCENCIA</span>
        </div>

        <!-- Título principal estilo Aeline con palabra destacada -->
        <h1 class="hero-headline">
          Monitorea el <span class="highlight-cardio">Corazón</span>,<br />
          Registra la Vida.
        </h1>

        <p class="hero-narrative">
          Plataforma web de adquisición en tiempo real para microcontroladores ESP32.
          Visualiza bioseñales PPG y ECG, calcula la frecuencia cardíaca instantánea y toma capturas clínicas de alta resolución para tus informes de laboratorio.
        </p>

        <!-- Barra de acción directa -->
        <div class="hero-action-bar">
          <RouterLink to="/monitor" class="btn primary">
            <span>Iniciar Monitoreo</span>
            <span class="arrow-icon" aria-hidden="true">→</span>
          </RouterLink>
          <RouterLink to="/aprende" class="btn secondary">
            <span>Ver cómo funciona</span>
          </RouterLink>
        </div>

        <!-- Información de estado / confianza -->
        <div class="hero-trust-row">
          <div class="active-dot"></div>
          <span class="trust-text">
            Muestreo a <strong>100 Hz</strong> vía Web Serial · Chrome y Edge · Sin drivers adicionales
          </span>
        </div>
      </div>

      <!-- Tarjetas biomédicas flotantes (lado derecho) -->
      <div class="hero-floating-cards">
        <div class="floating-spec-card">
          <div class="spec-thumb-icon cardio">
            <AppIcon name="heart" :size="20" filled />
          </div>
          <div class="spec-info">
            <h4>Frecuencia Cardíaca (BPM)</h4>
            <p>Detección de picos R y sistólicos en vivo</p>
          </div>
        </div>

        <div class="floating-spec-card">
          <div class="spec-thumb-icon cyan">
            <AppIcon name="pulse" :size="20" />
          </div>
          <div class="spec-info">
            <h4>Onda de Pulso PPG</h4>
            <p>Señal óptica del sensor MAX30100 a 115 200 bps</p>
          </div>
        </div>

        <div class="floating-spec-card">
          <div class="spec-thumb-icon indigo">
            <AppIcon name="camera" :size="20" />
          </div>
          <div class="spec-info">
            <h4>Capturas Clínicas PNG</h4>
            <p>Cuadrícula milimetrada lista para tu informe</p>
          </div>
        </div>
      </div>

      <!-- Fila inferior de estadísticas (Píldoras blancas) -->
      <div class="hero-stats-row">
        <div v-for="s in stats" :key="s.label" class="stat-pill-card">
          <span class="stat-number">{{ s.valor }}</span>
          <span class="stat-name">{{ s.label }}</span>
        </div>
      </div>
    </section>

    <!-- Alertas y estado del participante activo -->
    <section class="safety-section">
      <SafetyBanner />
      <CapabilityNotice />
      <div v-if="users.activeUser" class="alert info participant-banner">
        <AppIcon name="user" :size="18" />
        <span>Participante activo asignado: <strong>{{ users.activeUser.etiqueta }}</strong></span>
      </div>
    </section>

    <!-- SECCIÓN 2: Misión institucional -->
    <section class="mission-section">
      <div class="mission-left">
        <div class="section-pill-tag">
          <AppIcon name="pulse" :size="14" />
          <span>NUESTRA MISIÓN</span>
        </div>
        <h2 class="mission-title">
          Tecnología <span class="highlight-cardio">Cardiovascular</span>, Clara y Accesible.
        </h2>
        <p class="mission-text">
          Diseñado para estudiantes, docentes y laboratorios universitarios. Brinda una interfaz comprensible, rigurosa y segura
          para inspeccionar la fisiología del pulso cardíaco sin depender de equipos hospitalarios costosos.
        </p>

        <div class="mission-actions">
          <RouterLink to="/monitor" class="btn primary">
            <span>Abrir Monitor</span>
            <span aria-hidden="true">→</span>
          </RouterLink>
          <RouterLink to="/pacientes" class="btn secondary">
            <span>Gestionar Pacientes</span>
          </RouterLink>
        </div>
      </div>

      <!-- 3 tarjetas verticales altas -->
      <div class="mission-cards-grid">
        <div v-for="c in tarjetasMision" :key="c.titulo" class="mission-tall-card">
          <div class="tall-card-top" :style="{ background: c.color }">
            <span class="tall-card-tag">{{ c.tag }}</span>
          </div>
          <div class="tall-card-body">
            <h3>{{ c.titulo }}</h3>
            <h4>{{ c.sub }}</h4>
            <p>{{ c.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- BARRA DE TECNOLOGÍAS INTEGRADA -->
    <div class="tech-trust-bar">
      <span class="trust-label">TECNOLOGÍAS INTEGRADAS</span>
      <div class="tech-chips-list">
        <span class="tech-chip">ESP32 & Arduino</span>
        <span class="tech-chip">Web Serial API</span>
        <span class="tech-chip">MAX30100 PPG</span>
        <span class="tech-chip">AD8232 ECG</span>
        <span class="tech-chip">Web Crypto</span>
        <span class="tech-chip">Norma ISO 27001</span>
      </div>
    </div>

    <!-- SECCIÓN 3: Módulos de la plataforma + Banner CTA Cardio (sin verdes) -->
    <section class="initiatives-section">
      <div class="initiatives-header">
        <div class="section-pill-tag">
          <AppIcon name="activity" :size="14" />
          <span>MÓDULOS PRINCIPALES</span>
        </div>
        <h2 class="initiatives-title">Mediciones Precisas. Informes Profesionales.</h2>
        <p class="initiatives-lead">
          Pausa el gráfico para estudiar la morfología del pulso o genera instantáneas PNG con cuadrícula médica milimetrada
          para adjuntar en tus entregas académicas.
        </p>
      </div>

      <!-- 3 tarjetas de iniciativas espaciosas y equilibradas -->
      <div class="initiatives-cards">
        <div v-for="init in iniciativas" :key="init.titulo" class="card init-card card-hover">
          <div class="init-card-header">
            <div class="init-card-icon">
              <AppIcon :name="init.icon" :size="22" />
            </div>
            <span class="init-card-tag">{{ init.tag }}</span>
          </div>
          <h3 class="init-title">{{ init.titulo }}</h3>
          <p class="init-desc">{{ init.desc }}</p>
          <RouterLink :to="init.to" class="init-link">
            <span>Ingresar al módulo</span>
            <span class="init-arrow" aria-hidden="true">→</span>
          </RouterLink>
        </div>
      </div>

      <!-- Banner de llamada de atención temático Cardio Monitor (Pizarra oscuro + Carmesí) -->
      <div class="callout-card-cardio">
        <div class="callout-content">
          <span class="callout-tag">INICIO RÁPIDO</span>
          <h3>¿Listo para medir tu pulso cardíaco?</h3>
          <p>Conecta el microcontrolador a tu puerto USB, ubica tu dedo sobre el sensor y visualiza tu ritmo cardíaco en tiempo real.</p>
        </div>
        <div class="callout-actions">
          <RouterLink to="/monitor" class="btn primary callout-btn">
            <span>Comenzar ahora</span>
            <span aria-hidden="true">→</span>
          </RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.aeline-home {
  display: flex;
  flex-direction: column;
  gap: var(--gap-lg);
}

/* HERO CANVAS */
.hero-canvas {
  position: relative;
  background: linear-gradient(135deg, #f0f7fc 0%, #e8f3fa 50%, #f5f9fc 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 56px 44px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 40px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

@media (min-width: 960px) {
  .hero-canvas {
    grid-template-columns: 1.25fr 1fr;
    padding: 64px 52px;
  }
}

.hero-main-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  z-index: 2;
}

.hero-pill-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 6px 16px;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--accent);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}

.hero-headline {
  font-size: 2.8rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: var(--text);
  margin: 0;
}

@media (min-width: 960px) {
  .hero-headline {
    font-size: 3.5rem;
  }
}

.highlight-cardio {
  color: var(--accent);
  position: relative;
}

.hero-narrative {
  font-size: 1.05rem;
  line-height: 1.65;
  color: var(--text-muted);
  max-width: 54ch;
  margin: 4px 0 12px;
}

.hero-action-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.arrow-icon {
  transition: transform 0.2s ease;
}

.hero-action-bar a:hover .arrow-icon {
  transform: translateX(4px);
}

.hero-trust-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 0.86rem;
  color: var(--text-muted);
}

.active-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px rgba(225, 29, 72, 0.6);
}

/* Tarjetas flotantes estilo Aeline (derecha) */
.hero-floating-cards {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
  z-index: 2;
}

.floating-spec-card {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow);
  transition: transform 0.2s ease;
}

.floating-spec-card:hover {
  transform: translateY(-2px);
}

.spec-thumb-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.spec-thumb-icon.cardio {
  background: #ffe4e6;
  color: var(--accent);
}

.spec-thumb-icon.cyan {
  background: #e0f2fe;
  color: var(--info);
}

.spec-thumb-icon.indigo {
  background: #e0e7ff;
  color: #4f46e5;
}

.spec-info h4 {
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin: 0 0 3px;
  color: var(--text);
}

.spec-info p {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0;
}

/* Fila inferior de estadísticas */
.hero-stats-row {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  margin-top: 10px;
}

@media (min-width: 768px) {
  .hero-stats-row {
    grid-template-columns: repeat(4, 1fr);
  }
}

.stat-pill-card {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  box-shadow: var(--shadow-sm);
}

.stat-number {
  font-size: 1.7rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: var(--text);
}

.stat-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
}

/* Alertas */
.safety-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.participant-banner {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* SECCIÓN MISIÓN */
.mission-section {
  display: grid;
  grid-template-columns: 1fr;
  gap: 44px;
  align-items: center;
}

@media (min-width: 960px) {
  .mission-section {
    grid-template-columns: 1fr 1.35fr;
  }
}

.section-pill-tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card-tint);
  color: var(--accent);
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  margin-bottom: 12px;
}

.mission-title {
  font-size: 2.2rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin: 0 0 16px;
}

.mission-text {
  font-size: 1.02rem;
  line-height: 1.65;
  color: var(--text-muted);
  margin-bottom: 24px;
}

.mission-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

/* 3 Tarjetas altas */
.mission-cards-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
}

@media (min-width: 640px) {
  .mission-cards-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.mission-tall-card {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.mission-tall-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow);
}

.tall-card-top {
  height: 120px;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}

.tall-card-tag {
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.tall-card-body {
  padding: 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tall-card-body h3 {
  font-size: 1.1rem;
  font-weight: 800;
  margin: 0;
  color: var(--text);
}

.tall-card-body h4 {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--accent);
  margin: 0 0 6px;
}

.tall-card-body p {
  font-size: 0.85rem;
  line-height: 1.55;
  color: var(--text-muted);
  margin: 0;
}

/* Barra de tecnologías estilo Aeline ("Trusted by") */
.tech-trust-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 28px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.trust-label {
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--text-muted);
}

.tech-chips-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tech-chip {
  padding: 4px 14px;
  background: var(--bg-elev-2);
  border-radius: var(--radius-pill);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text);
}

/* SECCIÓN MÓDULOS / INICIATIVAS */
.initiatives-section {
  display: flex;
  flex-direction: column;
  gap: 36px;
  margin-top: 10px;
}

.initiatives-header {
  text-align: center;
  max-width: 680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.initiatives-title {
  font-size: 2.2rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1.2;
  margin: 10px 0 12px;
  color: var(--text);
}

.initiatives-lead {
  font-size: 1.05rem;
  line-height: 1.6;
  color: var(--text-muted);
  margin: 0;
}

.initiatives-cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  align-items: stretch;
}

@media (min-width: 768px) {
  .initiatives-cards {
    grid-template-columns: repeat(3, 1fr);
  }
}

.init-card {
  display: flex;
  flex-direction: column;
  padding: 32px 28px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  height: 100%;
  margin-top: 0 !important;
}

.init-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-hover);
  border-color: rgba(225, 29, 72, 0.25);
}

.init-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.init-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: #fff1f2;
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.init-card-tag {
  font-size: 0.74rem;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--text-muted);
  background: var(--bg-elev-2);
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  letter-spacing: 0.05em;
}

.init-title {
  font-size: 1.28rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin: 0 0 10px;
  color: var(--text);
}

.init-desc {
  font-size: 0.94rem;
  line-height: 1.6;
  color: var(--text-muted);
  margin-bottom: 24px;
  flex-grow: 1;
}

.init-link {
  margin-top: auto;
  font-size: 0.92rem;
  font-weight: 800;
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: gap 0.15s ease;
}

.init-link:hover .init-arrow {
  transform: translateX(4px);
}

.init-arrow {
  transition: transform 0.15s ease;
}

/* Banner CTA Cardio Monitor (Pizarra oscuro + Carmesí, sin verde) */
.callout-card-cardio {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border-radius: var(--radius-lg);
  padding: 40px 36px;
  color: #ffffff;
  box-shadow: 0 18px 42px -10px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
  gap: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

@media (min-width: 860px) {
  .callout-card-cardio {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 44px 52px;
  }
}

.callout-content {
  max-width: 620px;
}

.callout-tag {
  display: inline-block;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: #fb7185;
  background: rgba(225, 29, 72, 0.15);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  margin-bottom: 12px;
}

.callout-card-cardio h3 {
  font-size: 1.65rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  margin: 0 0 10px;
  color: #ffffff;
}

.callout-card-cardio p {
  font-size: 1.02rem;
  line-height: 1.6;
  margin: 0;
  color: rgba(255, 255, 255, 0.85);
}

.callout-actions {
  flex-shrink: 0;
}

.callout-btn {
  padding: 12px 28px;
  font-size: 1rem;
  white-space: nowrap;
}
</style>
