// Variables de la Web Serial API
let port;
let reader;
let inputStream;
let keepReading = false;

// Variables de UI
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusValue = document.getElementById('statusValue');
const bpmValue = document.getElementById('bpmValue');
const leadsOffBox = document.getElementById('leadsOffBox');

// Variables de datos para el gráfico
const MAX_DATA_POINTS = 1000; // a 250Hz, esto representa 4 segundos de datos
let timeData = new Array(MAX_DATA_POINTS).fill(0);
let ecgData = new Array(MAX_DATA_POINTS).fill(0);
let startTime = 0;
let isFirstData = true;

// Configuración de uPlot (Gráfico de alto rendimiento)
const opts = {
    width: document.querySelector('.chart-container').clientWidth - 40,
    height: 400,
    axes: [
        { stroke: "#a0a0a0", grid: { stroke: "#333", width: 1 } },
        { stroke: "#a0a0a0", grid: { stroke: "#333", width: 1 } }
    ],
    scales: {
        x: { time: false }, // Mostraremos milisegundos relativos
        y: { auto: true, range: [0, 1024] } // El ADC de Arduino UNO es 0-1023
    },
    series: [
        {}, // Eje X (Tiempo)
        {
            show: true,
            stroke: "#69f0ae",
            width: 2,
            label: "ECG Raw"
        }
    ]
};

let uplot = new uPlot(opts, [timeData, ecgData], document.getElementById('ecgChart'));

// Redimensionar gráfico al cambiar el tamaño de ventana
window.addEventListener("resize", () => {
    uplot.setSize({
        width: document.querySelector('.chart-container').clientWidth - 40,
        height: 400
    });
});

// Eventos de botones
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);

async function connect() {
    if (!('serial' in navigator)) {
        alert("Tu navegador no soporta la Web Serial API. Usa Google Chrome o Microsoft Edge.");
        return;
    }

    try {
        // Solicitar puerto al usuario (Arduino usa generalmente 115200 según tu código)
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });

        statusValue.textContent = "Conectado";
        statusValue.className = "value status-connected";
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        
        keepReading = true;
        readSerial();
    } catch (error) {
        console.error("Error al conectar:", error);
    }
}

async function disconnect() {
    keepReading = false;
    
    if (reader) {
        await reader.cancel();
    }
    if (port) {
        await port.close();
    }
    
    statusValue.textContent = "Desconectado";
    statusValue.className = "value status-disconnected";
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
}

// Lector asíncrono para el puerto serie
async function readSerial() {
    // TextDecoderStream decodifica los bytes a texto
    const textDecoder = new TextDecoderStream();
    inputStream = port.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();

    let buffer = "";

    try {
        while (keepReading) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            
            buffer += value;
            let lines = buffer.split('\n');
            
            // Mantener el último fragmento incompleto en el buffer
            buffer = lines.pop(); 
            
            let needChartUpdate = false;

            for (let line of lines) {
                line = line.trim();
                // Ignorar encabezados o líneas vacías
                if (line === "" || line.startsWith("t_ms")) continue;

                // Formato CSV esperado: t_ms, ecg_raw, leads_off, bpm
                const parts = line.split(',');
                if (parts.length === 4) {
                    const t_ms = parseFloat(parts[0]);
                    const ecg_raw = parseInt(parts[1]);
                    const leads_off = parseInt(parts[2]);
                    const bpm = parseFloat(parts[3]);

                    if (isFirstData) {
                        startTime = t_ms;
                        isFirstData = false;
                    }

                    // Actualizar datos para el gráfico
                    // Usamos tiempo relativo en segundos
                    const relativeTime = (t_ms - startTime) / 1000.0;
                    
                    timeData.push(relativeTime);
                    ecgData.push(ecg_raw);
                    
                    // Mantener tamaño fijo de la ventana
                    timeData.shift();
                    ecgData.shift();
                    
                    needChartUpdate = true;

                    // Actualizar UI de BPM
                    if (bpm > 0) {
                        bpmValue.textContent = Math.round(bpm);
                    }

                    // Actualizar UI de Leads-off
                    if (leads_off === 1) {
                        leadsOffBox.classList.remove('hidden');
                        ecgData[ecgData.length - 1] = 512; // Línea plana si se desconectó
                    } else {
                        leadsOffBox.classList.add('hidden');
                    }
                }
            }

            // Actualizar gráfico en lote para no saturar la CPU
            if (needChartUpdate) {
                uplot.setData([timeData, ecgData]);
            }
        }
    } catch (error) {
        console.error("Error leyendo del puerto:", error);
    } finally {
        reader.releaseLock();
    }
}
