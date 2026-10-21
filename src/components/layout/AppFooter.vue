<template>
  <footer class="aeline-footer">
    <div class="container footer-content">
      <!-- Columna 1: Marca y descripción -->
      <div class="footer-col brand-col">
        <RouterLink to="/" class="footer-brand">
          <div class="footer-heart-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <span class="footer-brand-title">Cardio<span class="brand-accent">Monitor</span></span>
        </RouterLink>
        <p class="footer-desc">
          Plataforma biomédica interactiva para el registro, análisis y visualización de bioseñales cardíacas en tiempo real con microcontroladores ESP32 y sensores ópticos PPG / ECG.
        </p>
        <span class="footer-disclaimer">
          Proyecto académico · Uso educativo y de investigación · <strong>No es un dispositivo médico.</strong>
        </span>
      </div>

      <!-- Columna 2: Módulos -->
      <div class="footer-col">
        <h4 class="col-title">Plataforma</h4>
        <ul class="col-links">
          <li><RouterLink to="/monitor">Monitor en vivo</RouterLink></li>
          <li><RouterLink to="/pacientes">Participantes</RouterLink></li>
          <li><RouterLink to="/monitoreos">Historial de sesiones</RouterLink></li>
          <li><RouterLink to="/comparar">Comparador de señales</RouterLink></li>
          <li><RouterLink to="/aprende">Guía y teoría cardíaca</RouterLink></li>
        </ul>
      </div>

      <!-- Columna 3: Tecnología y Hardware -->
      <div class="footer-col">
        <h4 class="col-title">Tecnología</h4>
        <ul class="col-links">
          <li><span>ESP32 & Arduino</span></li>
          <li><span>Sensor MAX30100/102</span></li>
          <li><span>Electrocardiograma AD8232</span></li>
          <li><span>Web Serial a 115 200 bps</span></li>
          <li><span>Capturas en alta resolución</span></li>
        </ul>
      </div>

      <!-- Columna 4: Seguridad y Soporte -->
      <div class="footer-col">
        <h4 class="col-title">Seguridad & Normas</h4>
        <ul class="col-links">
          <li><RouterLink to="/privacidad">Aviso de privacidad</RouterLink></li>
          <li><RouterLink to="/seguridad">Política de seguridad</RouterLink></li>
          <li><RouterLink :to="{ name: 'seguridad', hash: '#reportar' }">Reportar un incidente</RouterLink></li>
          <li><span>Cumplimiento ISO 27001</span></li>
          <li><span>Cifrado Web Crypto</span></li>
        </ul>
      </div>
    </div>

    <!-- Barra inferior de copyright -->
    <div class="footer-bottom">
      <div class="container footer-bottom-inner">
        <span>© 2026 Cardio Monitor. Desarrollado para docencia e investigación biomédica.</span>
        <span>Uso académico exclusivo</span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.aeline-footer {
  background: #ffffff;
  border-top: 1px solid var(--border);
  margin-top: 80px;
  color: var(--text);
}

.footer-content {
  padding: 64px 24px 48px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 40px;
}

@media (min-width: 640px) {
  .footer-content {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .footer-content {
    grid-template-columns: 1.5fr 1fr 1fr 1fr;
    gap: 48px;
  }
}

.brand-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.footer-heart-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--accent);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.footer-brand-title {
  font-size: 1.2rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text);
}

.brand-accent {
  color: var(--accent);
}

.footer-desc {
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--text-muted);
  margin: 0;
  max-width: 36ch;
}

.footer-disclaimer {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.col-title {
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin: 0 0 18px;
  color: var(--text);
}

.col-links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 0.9rem;
}

.col-links a,
.col-links span {
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.15s ease;
}

.col-links a:hover {
  color: var(--accent);
}

.footer-bottom {
  border-top: 1px solid var(--border-subtle);
  padding: 24px 0;
  background: var(--bg);
}

.footer-bottom-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.82rem;
  color: var(--text-muted);
}
</style>
