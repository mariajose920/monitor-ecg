<template>
  <footer class="app-footer">
    <div class="container row">
      <span class="muted small">Proyecto académico · Uso educativo · <strong>No es un dispositivo médico</strong> ni realiza diagnósticos.</span>
      <span class="links">
        <RouterLink to="/privacidad">Aviso de privacidad</RouterLink>
        <RouterLink :to="{ name: 'privacidad', hash: '#contacto' }">Reportar un problema</RouterLink>
      </span>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  border-top: 1px solid var(--border);
  background: var(--bg-elev);
  padding: 14px 0;
}

.row {
  justify-content: space-between;
}

.links {
  display: flex;
  gap: 16px;
}
</style>
