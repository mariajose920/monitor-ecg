<script setup>
</script>

<template>
  <div class="app-container">
    <header>
      <h1>Plataforma de Monitorización ECG</h1>
      <nav>
        <a href="#login">Inicio de Sesión</a> | 
        <a href="#medicion">Medición</a> | 
        <a href="#educacion">Educación</a> | 
        <a href="#admin">Admin</a>
      </nav>
    </header>

    <main>
      <h2>Bienvenido al sistema de Bioinstrumentación Avanzada</h2>
      <p>Aquí se visualizarán las señales de frecuencia cardíaca obtenidas desde tu ESP32/Arduino con el sensor AD8232.</p>
      
      <div class="status-box">
        <p>Estado del sensor: <strong>Desconectado</strong></p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  font-family: Arial, sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}
header {
  border-bottom: 2px solid #ccc;
  padding-bottom: 10px;
  margin-bottom: 20px;
}
h1 {
  color: #2c3e50;
}
nav a {
  margin-right: 10px;
  color: #42b983;
  text-decoration: none;
  font-weight: bold;
}
.status-box {
  margin-top: 20px;
  padding: 15px;
  background-color: #f8d7da;
  color: #721c24;
  border-radius: 5px;
  border: 1px solid #f5c6cb;
}
</style>
