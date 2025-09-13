// =======================================================
// ===== 1. CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE =====
// =======================================================
const firebaseConfig = {
    apiKey: "AIzaSyAovfm0PWP5f6rvSmDva5ZQLOAcOdDNCgk",
    authDomain: "dashboard-operaciones-a9996.firebaseapp.com",
    projectId: "dashboard-operaciones-a9996",
    storageBucket: "dashboard-operaciones-a9996.appspot.com",
    messagingSenderId: "788099450381",
    appId: "1:788099450381:web:95cd9fa3e96ec9397a3744"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Crear instancias de los servicios
const auth = firebase.auth();
const db = firebase.firestore();

// =====================================================
// ===== 2. LÓGICA DE AUTENTICACIÓN Y ESTADO GLOBAL =====
// =====================================================
let currentUserId = null;

const authSection = document.getElementById('authSection');
const appContainer = document.querySelector('.app-container');
const authError = document.getElementById('authError');

// El "corazón" de la app: escucha si un usuario inicia o cierra sesión
auth.onAuthStateChanged(user => {
    if (user) {
        // Usuario ha iniciado sesión
        currentUserId = user.uid;
        authSection.style.display = 'none';
        appContainer.style.display = 'block';

        // Una vez autenticado, cargamos todos sus datos
        loadOperations();
        loadWallyOperations();
        loadUserRatings();
        loadTheme();
        loadWallyValorInicial();
        loadConfig(); // Load user configuration
        
        // Inicializar selectores de fecha al cargar la app
        document.getElementById('selectedDate').value = currentDate;
        document.getElementById('wallySelectedDate').value = currentWallyDate;

    } else {
        // No hay usuario conectado
        currentUserId = null;
        authSection.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

function registerUser() {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    authError.textContent = '';

    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            console.log('Usuario registrado:', userCredential.user);
        })
        .catch(error => {
            authError.textContent = 'Error: ' + error.message;
        });
}

function loginUser() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    authError.textContent = '';

    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            console.log('Usuario ha iniciado sesión:', userCredential.user);
        })
        .catch(error => {
            authError.textContent = 'Error: ' + error.message;
        });
}

function logoutUser() {
    auth.signOut().then(() => {
        console.log('Sesión cerrada');
        // Limpiamos los datos locales al salir
        operations = [];
        wallyOperations = [];
        userRatings = {};
        userConfig = {}; // Clear user config
        renderTable();
        renderWallyTables();
        renderRatingsTable();
    });
}

function toggleAuthForms() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    authError.textContent = '';
    
    if (loginForm.style.display === 'none') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

// ===================================================
// ===== 3. REFACTORIZACIÓN DE FUNCIONES DE DATOS =====
// ===================================================

// ===== VARIABLES GLOBALES (Ahora actúan como caché local) =====
let operations = [];
let wallyOperations = [];
let userRatings = {}; // La estructura se mantiene, pero se carga de Firestore
let userProfiles = {}; // New: Store user notes and stats
let userConfig = {}; // New: Store user configuration
let editingIndex = -1; // Se mantiene para la edición en la UI
let editingWallyIndex = -1;
let currentDate = new Date().toISOString().split('T')[0];
let currentWallyDate = new Date().toISOString().split('T')[0];
let lastSavedUser = ''; // Para guardar el usuario de la última operación guardada
let lastSavedOperationType = ''; // Para saber si fue operación principal o Wally

// Variables para el cálculo de lotes y pendientes
let currentLotsData = new Map(); // Almacena el estado actual de los lotes
let currentPendingData = {
    recompra: 0,
    reventa: 0,
    recompraOps: [],
    reventaOps: []
};


// --- Funciones para Operaciones Principales ---

function loadOperations() {
    if (!currentUserId) return;
    
    // onSnapshot nos da datos en TIEMPO REAL. 
    // Si cambias un dato en otro navegador, se actualiza aquí automáticamente.
    db.collection('users').doc(currentUserId).collection('operations')
      .orderBy('timestamp', 'desc')
      .onSnapshot(snapshot => {
          operations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // Include doc.id
          updateHistorySelector();
          updateSummary(); // Llama a updateSummary que a su vez llama a applyFIFOForDate y renderTable
      }, error => console.error("Error al cargar operaciones:", error));
}

// Modificar la función saveOperation()
function saveOperation() {
    if (!currentUserId) return;
    
    const operation = {
        usuario: document.getElementById('usuario').value,
        referencia: document.getElementById('referencia').value,
        operacion: document.getElementById('operacion').value,
        tasa: parseFloat(document.getElementById('tasa').value),
        metodoPago: document.getElementById('metodoPago').value,
        montoUsdc: parseFloat(document.getElementById('montoUsdc').value),
        montoBs: parseFloat(document.getElementById('montoBs').value),
        comisionVes: parseFloat(document.getElementById('comisionVes').value) || 0,
        total: parseFloat(document.getElementById('total').value),
        ves: parseFloat(document.getElementById('ves').value) || 0,
        usdc: parseFloat(document.getElementById('usdc').value) || 0,
        lote: document.getElementById('lote').value,
        estatus: document.getElementById('estatus').value,
        fecha: currentDate,
        timestamp: Date.now()
    };

    if (!operation.usuario || !operation.referencia || !operation.operacion || 
        isNaN(operation.tasa) || isNaN(operation.montoUsdc) || !operation.metodoPago || !operation.estatus) {
        showToast('Por favor, complete todos los campos obligatorios.', 'error');
        return;
    }
    
    const operationId = editingIndex > -1 ? operations[editingIndex].id : db.collection('users').doc(currentUserId).collection('operations').doc().id; // Generate new ID if not editing
    operation.id = operationId;

    db.collection('users').doc(currentUserId).collection('operations').doc(operationId).set(operation, { merge: true })
        .then(() => {
            console.log("Operación guardada en Firestore");
            closeModal();
            showToast('Operación guardada con éxito', 'success'); // Notificación de éxito
            
            lastSavedUser = operation.usuario;
            lastSavedOperationType = 'main';
            openRatingModal(operation.usuario);

            if (window.aiCenter) {
                if (editingIndex >= 0) {
                    window.notifyAIEditOperation(operation);
                } else {
                    window.notifyAINewOperation(operation);
                }
            }
        })
        .catch(error => {
            console.error("Error al guardar operación:", error);
            showToast('Error al guardar operación', 'error'); // Notificación de error
        });
}

// Modificar la función deleteOperation()
function deleteOperation(index) {
    if (!currentUserId || !confirm('¿Está seguro de eliminar esta operación?')) return;
    
    const operationId = operations[index].id;
    db.collection('users').doc(currentUserId).collection('operations').doc(operationId).delete()
        .then(() => {
            console.log("Operación eliminada de Firestore");
            showToast('Operación eliminada', 'info'); // Notificación de eliminación
        })
        .catch(error => {
            console.error("Error al eliminar operación:", error);
            showToast('Error al eliminar operación', 'error'); // Notificación de error
        });
}

// --- Funciones para Wally Tech (Aplicar la misma lógica) ---

function loadWallyOperations() {
    if (!currentUserId) return;
    db.collection('users').doc(currentUserId).collection('wallyOperations')
      .orderBy('timestamp', 'desc')
      .onSnapshot(snapshot => {
          wallyOperations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // Include doc.id
          updateWallyHistorySelector();
          renderWallyTables();
          updateWallySummary();
      }, error => console.error("Error al cargar operaciones Wally:", error));
}

// Modificar la función saveWallyOperation()
function saveWallyOperation() {
    if (!currentUserId) return;
    const operacion = document.getElementById('wallyOperacion').value;
    let operation = {
        usuario: document.getElementById('wallyUsuario').value,
        referencia: document.getElementById('wallyReferencia').value,
        operacion: operacion,
        metodo: document.getElementById('wallyMetodo').value,
        fecha: currentWallyDate,
        timestamp: Date.now()
    };

    if (operacion === 'Compra') {
        operation.reciboUsdc = parseFloat(document.getElementById('reciboUsdc').value);
        operation.tasaCompra = parseFloat(document.getElementById('tasaCompra').value);
        operation.envioUsd = parseFloat(document.getElementById('envioUsd').value);
        operation.gananciaUsdc = parseFloat(document.getElementById('gananciaUsdc').value);
    } else if (operacion === 'Venta') {
        operation.envioUsdc = parseFloat(document.getElementById('envioUsdcVenta').value);
        operation.tasaVenta = parseFloat(document.getElementById('tasaVenta').value);
        operation.reciboUsd = parseFloat(document.getElementById('reciboUsdCalculado').value);
        operation.gananciaUsd = parseFloat(document.getElementById('gananciaUsd').value);
    }

    if (!operation.usuario || !operation.referencia || !operation.operacion || !operation.metodo || 
        (operation.operacion === 'Compra' && (isNaN(operation.reciboUsdc) || isNaN(operation.tasaCompra))) ||
        (operation.operacion === 'Venta' && (isNaN(operation.envioUsdc) || isNaN(operation.tasaVenta)))) {
        showToast('Por favor, complete todos los campos obligatorios.', 'error');
        return;
    }

    const operationId = editingWallyIndex > -1 ? wallyOperations[editingWallyIndex].id : db.collection('users').doc(currentUserId).collection('wallyOperations').doc().id; // Generate new ID if not editing
    operation.id = operationId;

    db.collection('users').doc(currentUserId).collection('wallyOperations').doc(operationId).set(operation, { merge: true })
        .then(() => {
            console.log("Operación Wally guardada en Firestore");
            closeWallyModal();
            showToast('Operación Wally guardada con éxito', 'success'); // Notificación de éxito

            lastSavedUser = operation.usuario;
            lastSavedOperationType = 'wally';
            openRatingModal(operation.usuario);
        })
        .catch(error => {
            console.error("Error al guardar operación Wally:", error);
            showToast('Error al guardar operación Wally', 'error'); // Notificación de error
        });
}

// Modificar la función deleteWallyOperation()
function deleteWallyOperation(index) {
    if (!currentUserId || !confirm('¿Está seguro de eliminar esta operación Wally?')) return;
    
    const operationId = wallyOperations[index].id;
    db.collection('users').doc(currentUserId).collection('wallyOperations').doc(operationId).delete()
        .then(() => {
            console.log("Operación Wally eliminada de Firestore");
            showToast('Operación Wally eliminada', 'info'); // Notificación de eliminación
        })
        .catch(error => {
            console.error("Error al eliminar operación Wally:", error);
            showToast('Error al eliminar operación Wally', 'error'); // Notificación de error
        });
}

// --- Funciones para Calificaciones (Un poco diferente) ---

function loadUserRatings() {
    if (!currentUserId) return;
    db.collection('users').doc(currentUserId).collection('ratings').onSnapshot(snapshot => {
        userRatings = {}; // Reiniciamos
        snapshot.forEach(doc => {
            userRatings[doc.id] = doc.data().ratings; // El ID del doc es el nombre de usuario
        });
        renderRatingsTable();
    });
}

function saveUserRatings() {
    if (!currentUserId) return;
    // Guardamos cada usuario calificado como un documento separado
    for (const userName in userRatings) {
        db.collection('users').doc(currentUserId).collection('ratings').doc(userName)
          .set({ ratings: userRatings[userName] });
    }
}

// --- Funciones de almacenamiento específico (Wally Valor Inicial) ---

function saveWallyValorInicial() {
    if (!currentUserId) return;
    const input = document.getElementById("wallyValorInicialInput");
    const value = parseFloat(input.value) || 0;
    const dateKey = `valorInicial_${currentWallyDate}`;

    // Guardamos esto en un documento especial de configuración del usuario
    db.collection('users').doc(currentUserId).collection('settings').doc('wally').set({ [dateKey]: value.toFixed(2) }, { merge: true })
        .then(() => {
            input.readOnly = true;
            document.getElementById("editWallyIniBtn").style.display = "inline";
            updateWallySummary();
        })
        .catch(error => console.error("Error al guardar valor inicial Wally:", error));
}

function loadWallyValorInicial() {
    if (!currentUserId) return;
    const input = document.getElementById("wallyValorInicialInput");
    const dateKey = `valorInicial_${currentWallyDate}`;

    db.collection('users').doc(currentUserId).collection('settings').doc('wally').get()
        .then(doc => {
            if (doc.exists && doc.data()[dateKey]) {
                input.value = doc.data()[dateKey];
                input.readOnly = true;
                document.getElementById("editWallyIniBtn").style.display = "inline";
            } else {
                // Lógica para buscar el valor del día anterior si este no existe
                const prevDayActualValue = localStorage.getItem(`wallyValorActual_${getWallyPreviousDate(currentWallyDate)}`);
                if (prevDayActualValue) {
                    input.value = prevDayActualValue;
                    // También lo guardamos en Firestore para el día actual si se carga del día anterior
                    db.collection('users').doc(currentUserId).collection('settings').doc('wally').set({ [dateKey]: prevDayActualValue }, { merge: true });
                    input.readOnly = true;
                    document.getElementById('editWallyIniBtn').style.display = 'inline';
                } else {
                    input.value = '0.00';
                    input.readOnly = false;
                    document.getElementById('editWallyIniBtn').style.display = 'none';
                }
            }
        })
        .catch(error => console.error("Error al cargar valor inicial Wally:", error));
}

// ========================================================
// ===== 4. CÓDIGO ORIGINAL (con pequeños ajustes) =====
// ========================================================
// Aquí va el resto de tu código JavaScript. La mayoría de las funciones
// de la UI, cálculos y renderizado (como renderTable, updateSummary, openModal, etc.)
// no necesitan grandes cambios, ya que ahora operan sobre los arrays locales
// que son actualizados en tiempo real por los listeners de Firestore.

// Funciones de navegación entre secciones
function switchToWally() {
    document.getElementById('mainSection').classList.remove('active');
    document.getElementById('ratingsSection').classList.remove('active');
    document.getElementById('wallySection').classList.add('active');
    currentSection = 'wally';
    loadWallyOperations(); 
}

function switchToMain() {
    document.getElementById('wallySection').classList.remove('active');
    document.getElementById('ratingsSection').classList.remove('active');
    document.getElementById('mainSection').classList.add('active');
    currentSection = 'main';
    loadOperations();
}

function switchToRatings() {
    document.getElementById('mainSection').classList.remove('active');
    document.getElementById('wallySection').classList.remove('active');
    document.getElementById('ratingsSection').classList.add('active');
    currentSection = 'ratings';
    renderRatingsTable(); // Asegurarse de renderizar la tabla de calificaciones
}

// Funciones de tema
function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeButtons(newTheme);
}

function updateThemeButtons(theme) {
    const icons = document.querySelectorAll('[id^="themeIcon"]');
    const texts = document.querySelectorAll('[id^="themeText"]');
    
    icons.forEach(icon => {
        icon.textContent = theme === 'light' ? '🌙' : '☀️';
    });
    
    texts.forEach(text => {
        text.textContent = theme === 'light' ? 'Modo Oscuro' : 'Modo Claro';
    });
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeButtons(savedTheme);
}

// ===== MODIFICACIÓN: Funciones del modal principal =====
function openModal() {
    editingIndex = -1;
    document.getElementById('modalTitle').textContent = 'Agregar Nueva Operación';
    clearForm();
    populatePaymentMethods(); // Populate payment methods on modal open
    document.getElementById('operationModal').classList.add('show');
    // Asegurarse de que la sección de información adicional esté colapsada al abrir el modal
    document.getElementById('additionalInfoSection').classList.remove('active');
}

function closeModal() {
    document.getElementById('operationModal').classList.remove('show');
    clearForm();
}

// Función para alternar secciones colapsables (ahora se usa en el modal principal también)
function toggleCollapsibleSection(headerElement) {
    const section = headerElement.closest('.collapsible-section');
    section.classList.toggle('active');
}

// Modificar la función clearForm para el nuevo diseño del modal
function clearForm() {
    const form = document.getElementById('operationModal');
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.value = '';
        input.classList.remove('disabled-field');
        input.readOnly = false;
    });

    // Limpiar los displays de cálculo
    document.getElementById('displayMontoBs').textContent = '0.00';
    document.getElementById('displayComision').textContent = '0.00';
    document.getElementById('displayTotal').textContent = '0.00';

    // Asegurarse de que la sección de información adicional esté colapsada
    document.getElementById('additionalInfoSection').classList.remove('active');
}

// ===== MODIFICACIÓN: Funciones del modal Wally =====
function openWallyModal() {
    editingWallyIndex = -1;
    document.getElementById('wallyModalTitle').textContent = 'Agregar Operación Wally Tech';
    clearWallyForm();
    document.getElementById('wallyModal').classList.add('show');
}

function closeWallyModal() {
    document.getElementById('wallyModal').classList.remove('show');
    clearWallyForm();
}


function clearWallyForm() {
    const form = document.getElementById('wallyModal');
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.value = '';
    });
    updateWallyFields();
}

// Funciones de cálculo principal (CONSOLIDADO)
function calculateAll() {
    const tasa = parseFloat(document.getElementById('tasa').value) || 0;
    const montoUsdc = parseFloat(document.getElementById('montoUsdc').value) || 0;
    const operacion = document.getElementById('operacion').value;
    const metodoPago = document.getElementById('metodoPago').value;
    
    const montoBs = tasa * montoUsdc;
    let comisionVes = 0;
    
    if (operacion === 'Compra' && metodoPago === 'Pagomovil') {
        comisionVes = montoBs * 0.003;
    }
    
    const total = montoBs + comisionVes;
    
    // Actualizar displays
    document.getElementById('displayMontoBs').textContent = montoBs.toFixed(2);
    document.getElementById('displayComision').textContent = comisionVes.toFixed(2);
    document.getElementById('displayTotal').textContent = total.toFixed(2);
    
    // Actualizar campos ocultos para compatibilidad con saveOperation
    document.getElementById('montoBs').value = montoBs.toFixed(2);
    document.getElementById('comisionVes').value = comisionVes.toFixed(2);
    document.getElementById('total').value = total.toFixed(2);
}

function updateFeeField() {
    // Esta función ahora solo llama a calculateAll para recalcular todo
    calculateAll();
}

// Las funciones calculateMontoBs y calculateTotal ya no son necesarias individualmente
// function calculateMontoBs() { ... }
// function calculateFee() { ... }
// function calculateTotal() { ... }


// Funciones de cálculo Wally
function updateWallyFields() {
    const operacion = document.getElementById('wallyOperacion').value;
    
    const groups = ['reciboUsdcGroup', 'tasaCompraGroup', 'envioUsdGroup', 'gananciaUsdcGroup', 
                   'envioUsdcVentaGroup', 'tasaVentaGroup', 'reciboUsdCalculadoGroup', 'gananciaUsdGroup'];
    
    groups.forEach(groupId => {
        document.getElementById(groupId).style.display = 'none';
    });

    if (operacion === 'Compra') {
        document.getElementById('reciboUsdcGroup').style.display = 'block';
        document.getElementById('tasaCompraGroup').style.display = 'block';
        document.getElementById('envioUsdGroup').style.display = 'block';
        document.getElementById('gananciaUsdcGroup').style.display = 'block';
    } else if (operacion === 'Venta') {
        document.getElementById('envioUsdcVentaGroup').style.display = 'block';
        document.getElementById('tasaVentaGroup').style.display = 'block';
        document.getElementById('reciboUsdCalculadoGroup').style.display = 'block';
        document.getElementById('gananciaUsdGroup').style.display = 'block';
    }
}

function calculateWallyCompra() {
    const reciboUsdc = parseFloat(document.getElementById('reciboUsdc').value) || 0;
    const tasaCompra = parseFloat(document.getElementById('tasaCompra').value) || 0;
    
    const envioUsd = reciboUsdc * tasaCompra;
    document.getElementById('envioUsd').value = envioUsd.toFixed(2);
    
    const gananciaUsdc = (reciboUsdc - envioUsd).toFixed(4); 
    document.getElementById('gananciaUsdc').value = gananciaUsdc;
}

function calculateWallyVenta() {
    const envioUsdcVenta = parseFloat(document.getElementById('envioUsdcVenta').value) || 0;
    const tasaVenta = parseFloat(document.getElementById('tasaVenta').value) || 0;
    
    const reciboUsdCalculado = envioUsdcVenta * tasaVenta;
    document.getElementById('reciboUsdCalculado').value = reciboUsdCalculado.toFixed(2);
    
    const gananciaUsd = (reciboUsdCalculado - envioUsdcVenta).toFixed(4); 
    document.getElementById('gananciaUsd').value = gananciaUsd;
}

async function pasteSpecial() {
    try {
        const text = await navigator.clipboard.readText();
        
        const refMatch = text.match(/-\s*([a-z0-9]{8})/i);
        const usuarioMatch = text.match(/Contraparte:\s*([A-Z0-9\.]+)/i);
        const tasaMatch = text.match(/Precio:\s*([\d\.]+)/i);
        const estatusMatch = text.match(/Transacción\s+completada/i);

        // Regex para Compra: Monto recibido: X.XX USDC
        const montoRecibidoUsdcMatch = text.match(/Monto recibido:\s*([\d\.,]+)\s*USDC/i);
        // Regex para Venta: Monto enviado: X.XX USDC
        const montoEnviadoUsdcMatch = text.match(/Monto enviado:\s*([\d\.,]+)\s*USDC/i);

        if (usuarioMatch) document.getElementById("usuario").value = usuarioMatch[1];
        if (refMatch) document.getElementById("referencia").value = refMatch[1];
        if (tasaMatch) document.getElementById("tasa").value = tasaMatch[1].replace(',', '.'); // Reemplazar coma por punto

        if (montoRecibidoUsdcMatch) {
            // Es una operación de Compra
            document.getElementById("operacion").value = "Compra";
            document.getElementById("montoUsdc").value = montoRecibidoUsdcMatch[1].replace(',', '.');
        } else if (montoEnviadoUsdcMatch) {
            // Es una operación de Venta
            document.getElementById("operacion").value = "Venta";
            document.getElementById("montoUsdc").value = montoEnviadoUsdcMatch[1].replace(',', '.');
        } else {
            showToast("No se pudo determinar el tipo de operación (Compra/Venta) o el monto USDC.", "warning");
            return; // Salir si no se puede determinar el tipo de operación
        }

        if (estatusMatch) document.getElementById("estatus").value = "Completado";

        calculateAll(); // Llamar a la función consolidada
        showToast("Pegado especial exitoso.", "success");
    } catch (err) {
        showToast("No se pudo leer el portapapeles o el formato es incorrecto.", "error");
        console.error(err);
    }
}

async function pasteSpecialWally() {
    try {
        const text = await navigator.clipboard.readText();
        
        const refMatch = text.match(/-\s*([a-z0-9]{8})/i);
        const usuarioMatch = text.match(/Contraparte:\s*([A-Z0-9\.]+)/i);
        const montoEnviadoUsdMatch = text.match(/Monto enviado:\s*([\d\.]+)\s*USD/i);
        const montoRecibidoUsdcMatch = text.match(/Monto recibido:\s*([\d\.]+)\s*USDC/i);
        const montoEnviadoUsdcMatch = text.match(/Monto enviado:\s*([\d\.]+)\s*USDC/i);
        const montoRecibidoUsdMatch = text.match(/Monto recibido:\s*([\d\.]+)\s*USD/i);
        const tasaMatch = text.match(/Precio:\s*([\d\.]+)/i);

        if (usuarioMatch) document.getElementById("wallyUsuario").value = usuarioMatch[1];
        if (refMatch) document.getElementById("wallyReferencia").value = refMatch[1];
        if (tasaMatch) {
            document.getElementById("tasaCompra").value = tasaMatch[1];
            document.getElementById("tasaVenta").value = tasaMatch[1];
        }

        if (montoEnviadoUsdMatch && montoRecibidoUsdcMatch) {
            document.getElementById("wallyOperacion").value = "Compra";
            document.getElementById("wallyMetodo").value = "Wally";
            updateWallyFields();
            document.getElementById("reciboUsdc").value = montoRecibidoUsdcMatch[1];
            document.getElementById("tasaCompra").value = tasaMatch[1];
            calculateWallyCompra();
        } else if (montoEnviadoUsdcMatch && montoRecibidoUsdMatch) {
            document.getElementById("wallyOperacion").value = "Venta";
            document.getElementById("wallyMetodo").value = "Syklo";
            updateWallyFields();
            document.getElementById("envioUsdcVenta").value = montoEnviadoUsdcMatch[1];
            document.getElementById("tasaVenta").value = tasaMatch[1];
            calculateWallyVenta();
        } else {
            showToast("Formato no reconocido para Wally.", "warning");
        }

    } catch (err) {
        showToast("No se pudo leer el portapapeles.", "error");
        console.error(err);
    }
}

// Funciones de renderizado principal
function renderTable() {
    const tbody = document.getElementById('operationsTable');
    const currentOps = operations.filter(op => op.fecha === currentDate);
    
    const searchTerm = document.getElementById('searchOperations').value.toLowerCase();
    const filterOperacion = document.getElementById('filterOperacion').value;
    const filterMetodoPago = document.getElementById('filterMetodoPago').value;
    const filterEstatus = document.getElementById('filterEstatus').value;

    const filteredOps = currentOps.filter(op => {
        const matchesSearch = op.usuario.toLowerCase().includes(searchTerm) || 
                              op.referencia.toLowerCase().includes(searchTerm);
        const matchesOperacion = filterOperacion === '' || op.operacion === filterOperacion;
        const matchesMetodoPago = filterMetodoPago === '' || op.metodoPago === filterMetodoPago;
        const matchesEstatus = filterEstatus === '' || op.estatus === filterEstatus;

        return matchesSearch && matchesOperacion && matchesMetodoPago && matchesEstatus;
    });

    tbody.innerHTML = filteredOps.map((op, index) => {
        const globalIndex = operations.indexOf(op);
        const avgRating = calculateAverageRating(op.usuario);
        const ratingHtml = avgRating > 0 ? `<span class="user-rating">${avgRating.toFixed(1)} <span class="star-icon">★</span></span>` : '';

        return `
            <tr class="${op.operacion.toLowerCase()}">
                <td><span class="clickable-username" onclick="openUserProfileModal('${op.usuario}')">${op.usuario}</span> ${ratingHtml}</td>
                <td>${op.referencia}</td>
                <td>${op.operacion}</td>
                <td>${op.tasa.toFixed(2)}</td>
                <td>${op.metodoPago}</td>
                <td>${op.montoUsdc.toFixed(2)}</td>
                <td>${op.montoBs.toFixed(2)}</td>
                <td>${op.comisionVes.toFixed(2)}</td>
                <td>${op.total.toFixed(2)}</td>
                <td>${(op.ves || 0).toFixed(2)}</td>
                <td>${(op.usdc || 0).toFixed(6)}</td>
                <td>
                    <div class="lote-scroll">${op.lote || ''}</div>
                </td>
                <td><span class="status-${op.estatus.toLowerCase().replace(' ', '-')}">${op.estatus}</span></td>
                <td>
                    <button class="edit-btn" onclick="editOperation(${globalIndex})">Editar</button>
                    <button class="delete-btn" onclick="deleteOperation(${globalIndex})">Eliminar</button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterOperations() {
    renderTable();
}

// Funciones de renderizado Wally
function renderWallyTables() {
    const currentOps = wallyOperations.filter(op => op.fecha === currentWallyDate);
    
    const searchTerm = document.getElementById('searchWallyOperations').value.toLowerCase();
    const filterOperacion = document.getElementById('filterWallyOperacion').value;
    const filterMetodo = document.getElementById('filterWallyMetodo').value;

    const filteredWallyOps = currentOps.filter(op => {
        const matchesSearch = (op.usuario && op.usuario.toLowerCase().includes(searchTerm)) || 
                              (op.referencia && op.referencia.toLowerCase().includes(searchTerm));
        const matchesOperacion = filterOperacion === '' || op.operacion === filterOperacion;
        const matchesMetodo = filterMetodo === '' || op.metodo === filterMetodo;

        return matchesSearch && matchesOperacion && matchesMetodo;
    });

    const compras = filteredWallyOps.filter(op => op.operacion === 'Compra');
    const ventas = filteredWallyOps.filter(op => op.operacion === 'Venta');
    
    document.getElementById('wallyCompraTable').innerHTML = compras.map((op) => {
        const globalIndex = wallyOperations.indexOf(op);
        const avgRating = calculateAverageRating(op.usuario);
        const ratingHtml = avgRating > 0 ? `<span class="user-rating">${avgRating.toFixed(1)} <span class="star-icon">★</span></span>` : '';

        return `
            <tr>
                <td><span class="clickable-username" onclick="openUserProfileModal('${op.usuario}')">${op.usuario || ''}</span> ${ratingHtml}</td>
                <td>${op.referencia || ''}</td>
                <td>${(Number(op.reciboUsdc) || 0).toFixed(2)}</td>
                <td>${(Number(op.tasaCompra) || 0).toFixed(3)}</td>
                <td>${(Number(op.envioUsd) || 0).toFixed(2)}</td>
                <td>${(Number(op.gananciaUsdc) || 0).toFixed(4)}</td>
                <td>
                    <button class="edit-btn" onclick="editWallyOperation(${globalIndex})">Editar</button>
                    <button class="delete-btn" onclick="deleteWallyOperation(${globalIndex})">Eliminar</button>
                </td>
            </tr>
        `;
    }).join('');

    document.getElementById('wallyVentaTable').innerHTML = ventas.map((op) => {
        const globalIndex = wallyOperations.indexOf(op);
        const avgRating = calculateAverageRating(op.usuario);
        const ratingHtml = avgRating > 0 ? `<span class="user-rating">${avgRating.toFixed(1)} <span class="star-icon">★</span></span>` : '';

        return `
            <tr>
                <td><span class="clickable-username" onclick="openUserProfileModal('${op.usuario}')">${op.usuario || ''}</span> ${ratingHtml}</td>
                <td>${op.referencia || ''}</td>
                <td>${(Number(op.envioUsdc) || 0).toFixed(2)}</td>
                <td>${(Number(op.tasaVenta) || 0).toFixed(3)}</td>
                <td>${(Number(op.reciboUsd) || 0).toFixed(2)}</td>
                <td>${(Number(op.gananciaUsd) || 0).toFixed(4)}</td>
                <td>
                    <button class="edit-btn" onclick="editWallyOperation(${globalIndex})">Editar</button>
                    <button class="delete-btn" onclick="deleteWallyOperation(${globalIndex})">Eliminar</button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterWallyOperations() {
    renderWallyTables();
}

function editWallyOperation(index) {
    if (typeof index !== 'number' || index < 0 || index >= wallyOperations.length) return;
    editingWallyIndex = index;
    const op = wallyOperations[index];

    document.getElementById('wallyModalTitle').textContent = 'Editar Operación Wally Tech';
    document.getElementById('wallyUsuario').value = op.usuario || '';
    document.getElementById('wallyReferencia').value = op.referencia || '';
    document.getElementById('wallyOperacion').value = op.operacion || '';
    document.getElementById('wallyMetodo').value = op.metodo || '';
    updateWallyFields();

    if (op.operacion === 'Compra') {
        document.getElementById('reciboUsdc').value = op.reciboUsdc != null ? op.reciboUsdc : '';
        document.getElementById('tasaCompra').value = op.tasaCompra != null ? op.tasaCompra : '';
        document.getElementById('envioUsd').value = op.envioUsd != null ? Number(op.envioUsd).toFixed(2) : '';
        document.getElementById('gananciaUsdc').value = op.gananciaUsdc != null ? Number(op.gananciaUsdc).toFixed(4) : '';
    } else if (op.operacion === 'Venta') {
        document.getElementById('envioUsdcVenta').value = op.envioUsdc != null ? op.envioUsdc : '';
        document.getElementById('tasaVenta').value = op.tasaVenta != null ? op.tasaVenta : '';
        document.getElementById('reciboUsdCalculado').value = op.reciboUsd != null ? Number(op.reciboUsd).toFixed(2) : '';
        document.getElementById('gananciaUsd').value = op.gananciaUsd != null ? Number(op.gananciaUsd).toFixed(4) : '';
    }

    document.getElementById('wallyModal').classList.add('show');
}

function applyFIFOForDate(fecha) {
    const ops = operations
        .filter(x => x.fecha === fecha)
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Resetear propiedades de lotes para el cálculo actual
    ops.forEach(o => {
        o._gainVes = 0;
        o._gainUsdc = 0;
        o._assignedLots = []; // Lotes a los que esta operación de compra contribuye
        o._remainingUsdc = (o.operacion === 'Compra') ? (Number(o.montoUsdc) || 0) : 0; // Solo para compras
        o._lotConsumed = 0; // Cuánto de esta compra ha sido consumido por ventas
        o._lotTotal = (o.operacion === 'Compra') ? (Number(o.montoUsdc) || 0) : 0; // Total de la compra para el lote
    });

    let purchaseQueue = ops
        .filter(o => o.operacion === 'Compra' && (Number(o.montoUsdc) || 0) > 0)
        .map(o => ({
            op: o,
            remaining: Number(o.montoUsdc) || 0,
            tasa: Number(o.tasa) || 0
        }));

    const sales = ops
        .filter(o => o.operacion === 'Venta' && (Number(o.montoUsdc) || 0) > 0)
        .map(o => ({
            op: o,
            montoUsdc: Number(o.montoUsdc) || 0,
            tasa: Number(o.tasa) || 0,
            comisionVes: Number(o.comisionVes) || 0,
            timestamp: o.timestamp || 0
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

    let lotCounter = 1;
    let currentLotsMap = new Map(); // Para almacenar el estado de los lotes en esta ejecución

    sales.forEach(sale => {
        let remainingToMatch = sale.montoUsdc;
        const lotId = `L${lotCounter++}`;
        sale.op._assignedLots = sale.op._assignedLots || [];
        sale.op._gainVes = sale.op._gainVes || 0;
        sale.op._gainUsdc = sale.op._gainUsdc || 0;
        sale.op.lote = lotId; // Asignar el lote a la venta

        // Inicializar el lote en el mapa de lotes actuales
        currentLotsMap.set(lotId, {
            id: lotId,
            montoTotal: 0, // Se llenará con las compras asociadas
            montoConsumido: 0,
            faltante: 100,
            estado: 'activo',
            comprasAsociadas: [],
            ventasAsociadas: []
        });
        const currentLot = currentLotsMap.get(lotId);
        currentLot.ventasAsociadas.push({
            id: sale.op.id,
            monto: sale.montoUsdc,
            tasa: sale.tasa
        });

        while (remainingToMatch > 0 && purchaseQueue.length > 0) {
            const head = purchaseQueue[0];
            const consume = Math.min(remainingToMatch, head.remaining);

            const costVes = consume * (head.tasa || 0);
            const revenueVes = consume * (sale.tasa || 0);
            const commissionPortion = sale.comisionVes * (consume / (sale.montoUsdc || 1));

            const gainVes = revenueVes - costVes - commissionPortion;
            const divisor = head.tasa || sale.tasa || 1;
            const gainUsdc = gainVes / divisor;

            sale.op._gainVes += gainVes;
            sale.op._gainUsdc += gainUsdc;

            head.op._gainVes = (head.op._gainVes || 0) + gainVes;
            head.op._gainUsdc = (head.op._gainUsdc || 0) + gainUsdc;
            head.op._assignedLots = head.op._assignedLots || [];
            
            // Actualizar el lote de la compra
            head.op._lotConsumed = (head.op._lotConsumed || 0) + consume;

            // Formato para el campo lote de la compra: L1$monto$
            const lotEntryForPurchase = `${lotId}$${consume.toFixed(2)}$`;
            head.op._assignedLots.push(lotEntryForPurchase);

            // Actualizar el lote actual en el mapa
            currentLot.montoTotal += consume; // Sumar el monto de la compra al total del lote
            currentLot.montoConsumido += consume; // Sumar el monto consumido por esta venta
            currentLot.comprasAsociadas.push({
                id: head.op.id,
                monto: consume,
                tasa: head.tasa
            });

            head.remaining -= consume;
            head.op._remainingUsdc = head.remaining;
            remainingToMatch -= consume;

            if (head.remaining <= 0) {
                purchaseQueue.shift();
            }
        }

        if (remainingToMatch > 0) {
            // Si queda algo por emparejar, significa que no hay compras suficientes.
            // La ganancia para esta porción es 0, ya que no hay un costo de compra asociado.
            // Esto ya está cubierto por la lógica de la IA de "Recompra Crítica".
            sale.op._gainVes += 0;
            sale.op._gainUsdc += 0;
        }
    });

    // Finalizar el cálculo de lotes y actualizar el campo 'lote' de las compras
    ops.forEach(o => {
        if (o.operacion === 'Compra') {
            if (o._assignedLots && o._assignedLots.length > 0) {
                o.lote = o._assignedLots.join(',');
            } else {
                o.lote = ''; // Si no contribuyó a ningún lote, el campo lote está vacío
            }
        }
        o.ves = Number((o._gainVes || 0).toFixed(2));
        o.usdc = Number((o._gainUsdc || 0).toFixed(6));

        // Limpiar propiedades temporales
        delete o._gainVes;
        delete o._gainUsdc;
        delete o._assignedLots;
        delete o._remainingUsdc;
        delete o._lotConsumed;
        delete o._lotTotal;
    });

    // Calcular el faltante y estado final de los lotes
    currentLotsMap.forEach(lot => {
        if (lot.montoTotal > 0) {
            lot.faltante = ((lot.montoTotal - lot.montoConsumido) / lot.montoTotal) * 100;
            lot.estado = lot.faltante <= 0.01 ? 'cerrado' : 'activo'; // Considerar cerrado si es casi 0
        } else {
            // Lote creado por una venta sin compras asociadas aún
            lot.faltante = 100;
            lot.estado = 'activo';
        }
    });

    currentLotsData = currentLotsMap; // Actualizar la variable global de lotes

    // Calcular pendientes
    let totalComprado = 0;
    let totalVendido = 0;
    let recompraOps = [];
    let reventaOps = [];

    ops.forEach(op => {
        if (op.operacion === 'Compra') {
            totalComprado += (Number(op.montoUsdc) || 0);
        } else if (op.operacion === 'Venta') {
            totalVendido += (Number(op.montoUsdc) || 0);
        }
    });

    const recompraPendiente = Math.max(0, totalVendido - totalComprado);
    const reventaPendiente = Math.max(0, totalComprado - totalVendido);

    // Identificar operaciones que contribuyen a pendientes
    if (recompraPendiente > 0) {
        let tempVendido = totalVendido;
        ops.filter(op => op.operacion === 'Venta').sort((a, b) => b.timestamp - a.timestamp).forEach(op => {
            if (tempVendido > totalComprado) {
                const amount = Math.min(tempVendido - totalComprado, (Number(op.montoUsdc) || 0));
                recompraOps.push({
                    id: op.id,
                    usuario: op.usuario,
                    referencia: op.referencia,
                    montoUsdc: amount,
                    fecha: op.fecha
                });
                tempVendido -= amount;
            }
        });
    }

    if (reventaPendiente > 0) {
        let tempComprado = totalComprado;
        ops.filter(op => op.operacion === 'Compra').sort((a, b) => b.timestamp - a.timestamp).forEach(op => {
            if (tempComprado > totalVendido) {
                const amount = Math.min(tempComprado - totalVendido, (Number(op.montoUsdc) || 0));
                reventaOps.push({
                    id: op.id,
                    usuario: op.usuario,
                    referencia: op.referencia,
                    montoUsdc: amount,
                    fecha: op.fecha
                });
                tempComprado -= amount;
            }
        });
    }

    currentPendingData = {
        recompra: recompraPendiente,
        reventa: reventaPendiente,
        recompraOps: recompraOps,
        reventaOps: reventaOps
    };

    if (window.aiCenter) {
        window.notifyAIRecalculation();
    }
}


function updateSummary() {
    const currentOps = operations.filter(op => op.fecha === currentDate);
    const compras = currentOps.filter(op => op.operacion === 'Compra');
    const ventas = currentOps.filter(op => op.operacion === 'Venta');
    
    const promCompra = compras.length > 0 ? 
        compras.reduce((sum, op) => sum + (Number(op.tasa) || 0), 0) / compras.length : 0;
    const promVenta = ventas.length > 0 ? 
        ventas.reduce((sum, op) => sum + (Number(op.tasa) || 0), 0) / ventas.length : 0;
    
    const brecha = promVenta > 0 && promCompra > 0 ? 
        ((promVenta - promCompra) / promCompra * 100) : 0;
    
    document.getElementById('promCompra').textContent = promCompra.toFixed(2);
    document.getElementById('promVenta').textContent = promVenta.toFixed(2);
    document.getElementById('brecha').textContent = brecha.toFixed(2) + '%';
    
    applyFIFOForDate(currentDate); // Esto actualiza las propiedades _gainVes, _gainUsdc y lote en las operaciones

    const gananciasVesSoloCompras = currentOps
        .filter(op => op.operacion === 'Compra')
        .reduce((sum, op) => sum + (Number(op.ves) || 0), 0);

    const gananciasUsdcSoloCompras = currentOps
        .filter(op => op.operacion === 'Compra')
        .reduce((sum, op) => sum + (Number(op.usdc) || 0), 0);

    document.getElementById('ganancias').innerHTML = `
        <div>${gananciasVesSoloCompras.toFixed(2)} VES</div>
        <div>${gananciasUsdcSoloCompras.toFixed(2)} USDC</div>
    `;

    document.getElementById('totalOps').textContent = currentOps.length;
    
    // Actualizar nuevos summary-items
    const activeLotsCount = Array.from(currentLotsData.values()).filter(lot => lot.estado === 'activo').length;
    document.getElementById('activeLotsSummary').textContent = activeLotsCount;
    
    const totalPending = currentPendingData.recompra + currentPendingData.reventa;
    document.getElementById('pendingSummary').textContent = `${totalPending.toFixed(2)} USDC`;

    renderTable(); // Renderizar la tabla después de que los lotes se hayan calculado
    updateProfitGoalProgress(gananciasVesSoloCompras); // Update profit goal progress
}

function updateWallySummary() {
    const currentOps = wallyOperations.filter(op => op.fecha === currentWallyDate);
    const compras = currentOps.filter(op => op.operacion === 'Compra');
    const ventas = currentOps.filter(op => op.operacion === 'Venta');

    const totalEnvioUsd_fromCompras = compras.reduce((s, op) => s + (Number(op.envioUsd) || 0), 0);
    const totalReciboUsdc_fromCompras = compras.reduce((s, op) => s + (Number(op.reciboUsdc) || 0), 0);

    const totalEnvioUsdc_fromVentas = ventas.reduce((s, op) => s + (Number(op.envioUsdc) || 0), 0);
    const totalReciboUsd_fromVentas = ventas.reduce((s, op) => s + (Number(op.reciboUsd) || 0), 0);

    const iniValue = parseFloat(document.getElementById('wallyValorInicialInput').value) || 0; // Leer del input
    const valAct = iniValue + totalReciboUsdc_fromCompras + totalReciboUsd_fromVentas - totalEnvioUsd_fromCompras - totalEnvioUsdc_fromVentas;

    document.getElementById("wallyValorActual").textContent = `${valAct.toFixed(2)}`;
    
    localStorage.setItem(`wallyValorActual_${currentWallyDate}`, valAct.toFixed(2));
    // No guardar en Firestore aquí, ya que el valor actual es calculado y no persistente directamente

    const totalGananciaUsdc = compras.reduce((s, op) => s + (Number(op.gananciaUsdc) || 0), 0);
    const totalGananciaUsd = ventas.reduce((s, op) => s + (Number(op.gananciaUsd) || 0), 0);

    document.getElementById("wallyGanancias").textContent =
        `${totalGananciaUsdc.toFixed(2)} USDC / ${totalGananciaUsd.toFixed(2)} USD`;
}

// Modificar la función editOperation para el nuevo diseño del modal
function editOperation(index) {
    editingIndex = index;
    const op = operations[index];
    
    document.getElementById('modalTitle').textContent = 'Editar Operación';
    document.getElementById('usuario').value = op.usuario;
    document.getElementById('referencia').value = op.referencia;
    document.getElementById('operacion').value = op.operacion;
    document.getElementById('tasa').value = op.tasa;
    document.getElementById('metodoPago').value = op.metodoPago;
    document.getElementById('montoUsdc').value = op.montoUsdc;
    
    // Los campos montoBs, comisionVes, total ahora son calculados y mostrados en el display
    document.getElementById('montoBs').value = op.montoBs;
    document.getElementById('comisionVes').value = op.comisionVes;
    document.getElementById('total').value = op.total;

    document.getElementById('ves').value = op.ves;
    document.getElementById('usdc').value = op.usdc;
    document.getElementById('lote').value = op.lote;
    document.getElementById('estatus').value = op.estatus;
    
    calculateAll(); // Recalcular y mostrar los valores en el display
    
    document.getElementById('operationModal').classList.add('show');
    // Asegurarse de que la sección de información adicional esté desplegada al editar
    document.getElementById('additionalInfoSection').classList.add('active');
}

function getPreviousDate(dateString) {
    const date = new Date(dateString);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
}

function updateHistorySelector() {
    const dates = [...new Set(operations.map(op => op.fecha))].sort().reverse();
    const selector = document.getElementById('historySelector');
    
    selector.innerHTML = '<option value="">Ver historial por fecha</option>' +
        dates.map(date => `<option value="${date}">${date}</option>`).join('');
}

function updateWallyHistorySelector() {
    const dates = [...new Set(wallyOperations.map(op => op.fecha))].sort().reverse();
    const selector = document.getElementById('wallyHistorySelector');
    
    selector.innerHTML = '<option value="">Ver historial por fecha</option>' +
        dates.map(date => `<option value="${date}">${date}</option>`).join('');
}

function loadHistoryDate() {
    const selectedDate = document.getElementById('historySelector').value;
    if (selectedDate) {
        document.getElementById('selectedDate').value = selectedDate;
        currentDate = selectedDate;
        loadOperations();
    }
}

function loadWallyHistoryDate() {
    const selectedDate = document.getElementById('wallyHistorySelector').value;
    if (selectedDate) {
        document.getElementById('wallySelectedDate').value = selectedDate;
        currentWallyDate = selectedDate;
        loadWallyOperations();
    }
}

document.getElementById('selectedDate').addEventListener('change', function() {
    currentDate = this.value; // Actualizar currentDate con la fecha seleccionada
    loadOperations();
    updateHistorySelector();
});

document.getElementById('wallySelectedDate').addEventListener('change', function() {
    currentWallyDate = this.value; // Actualizar currentWallyDate con la fecha seleccionada
    loadWallyOperations();
    updateWallyHistorySelector();
});

// ===== MODIFICACIÓN: Evento para cerrar modales y panel IA =====
window.onclick = function(event) {
    const operationModal = document.getElementById('operationModal');
    const wallyModal = document.getElementById('wallyModal');
    const ratingModal = document.getElementById('ratingModal');
    const configModal = document.getElementById('configModal'); // New
    const userProfileModal = document.getElementById('userProfileModal'); // New
    const bankBreachModal = document.getElementById('bankBreachModal'); // New
    const lotDetailsModal = document.getElementById('lotDetailsModal'); // New
    const pendingDetailsModal = document.getElementById('pendingDetailsModal'); // New
    const aiPanel = document.getElementById('aiPanel');
    
    // Close operation modal if clicked outside
    if (event.target === operationModal) {
        closeModal();
    }
    // Close Wally modal if clicked outside
    if (event.target === wallyModal) {
        closeWallyModal();
    }
    // Close rating modal if clicked outside
    if (event.target === ratingModal) {
        closeRatingModal();
    }
    // Close config modal if clicked outside
    if (event.target === configModal) {
        closeConfigModal();
    }
    // Close user profile modal if clicked outside
    if (event.target === userProfileModal) {
        closeUserProfileModal();
    }
    // Close bank breach modal if clicked outside
    if (event.target === bankBreachModal) {
        closeBankBreachModal();
    }
    // Close lot details modal if clicked outside
    if (event.target === lotDetailsModal) {
        closeLotDetailsModal();
    }
    // Close pending details modal if clicked outside
    if (event.target === pendingDetailsModal) {
        closePendingDetailsModal();
    }
    
    // Check if clicked outside AI operations center
    if (!document.getElementById('aiOperationsCenter').contains(event.target) && 
        aiPanel.classList.contains('show')) {
        if (window.aiCenter) window.aiCenter.close();
    }
}

function editWallyValorInicial() {
    const input = document.getElementById("wallyValorInicialInput");
    const editBtn = document.getElementById("editWallyIniBtn");
    input.readOnly = false;
    input.focus();
    editBtn.style.display = "none";
}

function getWallyPreviousDate(dateString) {
    const date = new Date(dateString);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
}

// ===== SISTEMA DE CALIFICACIÓN DE USUARIOS =====
let currentRatingUser = '';
let currentRatingOperationId = null; // Para identificar la operación que se está calificando
let selectedRatings = {
    transaction: 0,
    speed: 0,
    diligence: 0
};

function resetStars() {
    document.querySelectorAll('.rating-stars').forEach(container => {
        container.querySelectorAll('.star').forEach(star => {
            star.classList.remove('selected');
        });
    });
    selectedRatings = { transaction: 0, speed: 0, diligence: 0 }; // Ensure internal state is reset
}

document.querySelectorAll('.rating-stars').forEach(container => {
    container.addEventListener('click', function(event) {
        if (event.target.classList.contains('star')) {
            const value = parseInt(event.target.dataset.value);
            const parent = event.target.parentNode;
            const ratingType = parent.id.replace('rating', '').toLowerCase(); // e.g., 'transaction', 'speed'

            parent.querySelectorAll('.star').forEach(star => {
                if (parseInt(star.dataset.value) <= value) {
                    star.classList.add('selected');
                } else {
                    star.classList.remove('selected');
                }
            });
            selectedRatings[ratingType] = value; // Store the selected value
        }
    });
});

// ===== MODIFICACIÓN: Funciones del modal de calificación =====
function openRatingModal(userName) {
    currentRatingUser = userName;
    document.getElementById('ratingUserName').textContent = userName;
    document.getElementById('ratingModal').classList.add('show');
    resetStars();
}

function closeRatingModal() {
    document.getElementById('ratingModal').classList.remove('show');
    currentRatingUser = '';
    currentRatingOperationId = null;
    selectedRatings = { transaction: 0, speed: 0, diligence: 0 }; // Reset selected ratings
}

function submitRating() {
    const transactionRating = selectedRatings.transaction;
    const speedRating = selectedRatings.speed;
    const diligenceRating = selectedRatings.diligence;

    // Validate that at least one rating has been provided
    if (transactionRating === 0 && speedRating === 0 && diligenceRating === 0) {
        showToast('Por favor, califique al menos un aspecto.', 'warning');
        return;
    }

    const newRating = {
        transaction: transactionRating,
        speed: speedRating,
        diligence: diligenceRating,
        date: new Date().toISOString().split('T')[0],
        operationType: lastSavedOperationType 
    };

    if (!userRatings[currentRatingUser]) {
        userRatings[currentRatingUser] = [];
    }
    userRatings[currentRatingUser].push(newRating);
    saveUserRatings();
    closeRatingModal();
    showToast('Calificación guardada.', 'success');
}

function calculateAverageRating(userName) {
    if (!userRatings[userName] || userRatings[userName].length === 0) {
        return 0;
    }
    let totalSum = 0;
    let count = 0;
    userRatings[userName].forEach(r => {
        if (r.transaction > 0) { totalSum += r.transaction; count++; }
        if (r.speed > 0) { totalSum += r.speed; count++; }
        if (r.diligence > 0) { totalSum += r.diligence; count++; }
    });
    
    return count > 0 ? totalSum / count : 0;
}

function renderRatingsTable() {
    const tbody = document.getElementById('ratingsTableBody');
    tbody.innerHTML = '';

    const searchTerm = document.getElementById('searchRatings').value.toLowerCase();

    const users = Object.keys(userRatings).filter(user => user.toLowerCase().includes(searchTerm));

    users.sort((a, b) => calculateAverageRating(b) - calculateAverageRating(a)); // Ordenar por calificación promedio

    users.forEach(userName => {
        const ratings = userRatings[userName];
        const avgRating = calculateAverageRating(userName);
        const totalCount = ratings.length;

        let detailsHtml = `
            <button onclick="toggleRatingDetails('${userName}')">Ver Detalles</button>
            <div id="details-${userName}" style="display:none;">
                <ul>
        `;
        ratings.forEach((r, index) => {
            const displayTransaction = r.transaction > 0 ? `${r.transaction}★` : 'N/A';
            const displaySpeed = r.speed > 0 ? `${r.speed}★` : 'N/A';
            const displayDiligence = r.diligence > 0 ? `${r.diligence}★` : 'N/A';

            detailsHtml += `
                <li>
                    <strong>Fecha:</strong> ${r.date} (${r.operationType === 'main' ? 'Principal' : 'Wally'})<br>
                    Transacción: ${displayTransaction}, Rapidez: ${displaySpeed}, Diligencia: ${displayDiligence}
                </li>
            `;
        });
        detailsHtml += `
                </ul>
            </div>
        `;

        tbody.innerHTML += `
            <tr>
                <td><span class="clickable-username" onclick="openUserProfileModal('${userName}')">${userName}</span></td>
                <td>${avgRating.toFixed(2)} <span class="star-icon">★</span></td>
                <td>${totalCount}</td>
                <td>${detailsHtml}</td>
            </tr>
        `;
    });
}

function filterRatings() {
    renderRatingsTable();
}

// ===== MÓDULO DE CONFIGURACIÓN DE USUARIO =====
const defaultPaymentMethods = ["Pagomovil", "Banesco", "Venezuela", "Bancamiga", "BNC"];
const defaultAIThresholds = {
    brechaMin: 2.0,
    brechaMax: 4.0,
    muchoLotes: 3,
    recompraCritica: 100.00,
    reventaCritica: 100.00
};
const defaultProfitGoals = {
    daily: 500.00
};

function openConfigModal() {
    document.getElementById('configModal').classList.add('show');
    loadConfigToModal();
}

function closeConfigModal() {
    document.getElementById('configModal').classList.remove('show');
}

function loadConfig() {
    if (!currentUserId) return;
    db.collection('users').doc(currentUserId).collection('settings').doc('userConfig').get()
        .then(doc => {
            if (doc.exists) {
                userConfig = doc.data();
            } else {
                userConfig = {
                    paymentMethods: defaultPaymentMethods,
                    aiThresholds: defaultAIThresholds,
                    profitGoals: defaultProfitGoals
                };
            }
            applyConfig();
        })
        .catch(error => {
            console.error("Error loading user config:", error);
            userConfig = {
                paymentMethods: defaultPaymentMethods,
                aiThresholds: defaultAIThresholds,
                profitGoals: defaultProfitGoals
            };
            applyConfig();
        });
}

function applyConfig() {
    // Apply AI thresholds
    if (window.aiCenter && userConfig.aiThresholds) {
        window.aiCenter.alertThresholds = { ...defaultAIThresholds, ...userConfig.aiThresholds };
    }
    // Populate payment methods dropdown
    populatePaymentMethods();
    // Update profit goal display
    updateProfitGoalProgress();
}

function loadConfigToModal() {
    // Load Payment Methods
    const paymentList = document.getElementById('frequentPaymentMethodsList');
    paymentList.innerHTML = '';
    const methodsToDisplay = userConfig.paymentMethods || defaultPaymentMethods;
    methodsToDisplay.forEach(method => {
        addPaymentMethodToList(method, paymentList);
    });
    makeSortable(paymentList);

    // Load AI Parameters
    const aiThresholds = userConfig.aiThresholds || defaultAIThresholds;
    document.getElementById('aiBrechaMin').value = aiThresholds.brechaMin;
    document.getElementById('aiBrechaMax').value = aiThresholds.brechaMax;
    document.getElementById('aiMuchoLotes').value = aiThresholds.muchoLotes;
    document.getElementById('aiRecompraCritica').value = aiThresholds.recompraCritica;
    document.getElementById('aiReventaCritica').value = aiThresholds.reventaCritica;

    // Load Profit Goals
    const profitGoals = userConfig.profitGoals || defaultProfitGoals;
    document.getElementById('dailyProfitGoal').value = profitGoals.daily;
}

function addPaymentMethodToList(method, listElement) {
    const li = document.createElement('li');
    li.dataset.method = method;
    li.draggable = true; // Make list items draggable
    li.innerHTML = `
        <span class="handle">☰</span>
        <span>${method}</span>
        <button class="remove-btn" onclick="this.parentNode.remove()">❌</button>
    `;
    listElement.appendChild(li);
}

function makeSortable(listElement) {
    let draggingItem = null;

    listElement.addEventListener('dragstart', (e) => {
        draggingItem = e.target;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', draggingItem.innerHTML);
        draggingItem.classList.add('dragging');
    });

    listElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(listElement, e.clientY);
        const currentElement = e.target;
        if (currentElement.nodeName === 'LI' && currentElement !== draggingItem) {
            if (afterElement == null) {
                listElement.appendChild(draggingItem);
            } else {
                listElement.insertBefore(draggingItem, afterElement);
            }
        }
    });

    listElement.addEventListener('dragend', () => {
        draggingItem.classList.remove('dragging');
        draggingItem = null;
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: -Infinity }).element;
    }
}

function saveConfig() {
    if (!currentUserId) return;

    // Save Payment Methods
    const paymentListItems = document.querySelectorAll('#frequentPaymentMethodsList li');
    const savedPaymentMethods = Array.from(paymentListItems).map(li => li.dataset.method);

    // Save AI Parameters
    const aiConfig = {
        brechaMin: parseFloat(document.getElementById('aiBrechaMin').value) || defaultAIThresholds.brechaMin,
        brechaMax: parseFloat(document.getElementById('aiBrechaMax').value) || defaultAIThresholds.brechaMax,
        muchoLotes: parseInt(document.getElementById('aiMuchoLotes').value) || defaultAIThresholds.muchoLotes,
        recompraCritica: parseFloat(document.getElementById('aiRecompraCritica').value) || defaultAIThresholds.recompraCritica,
        reventaCritica: parseFloat(document.getElementById('aiReventaCritica').value) || defaultAIThresholds.reventaCritica
    };

    // Save Profit Goals
    const profitGoals = {
        daily: parseFloat(document.getElementById('dailyProfitGoal').value) || defaultProfitGoals.daily
    };

    userConfig = {
        paymentMethods: savedPaymentMethods,
        aiThresholds: aiConfig,
        profitGoals: profitGoals
    };

    db.collection('users').doc(currentUserId).collection('settings').doc('userConfig').set(userConfig)
        .then(() => {
            showToast('Configuración guardada con éxito.', 'success');
            applyConfig(); // Re-apply config to update AI and dropdowns
            closeConfigModal();
        })
        .catch(error => {
            console.error("Error saving user config:", error);
            showToast('Error al guardar configuración.', 'error');
        });
}

function populatePaymentMethods() {
    const selectElement = document.getElementById('metodoPago');
    selectElement.innerHTML = '<option value="">Seleccionar método...</option>'; // Clear existing options

    const methods = userConfig.paymentMethods || defaultPaymentMethods;
    const allMethods = new Set(methods.concat(defaultPaymentMethods)); // Ensure all default methods are available

    // Add preferred methods first
    methods.forEach(method => {
        const option = document.createElement('option');
        option.value = method;
        option.textContent = method;
        selectElement.appendChild(option);
    });

    // Add any default methods not in preferred list
    defaultPaymentMethods.forEach(method => {
        if (!methods.includes(method)) {
            const option = document.createElement('option');
            option.value = method;
            option.textContent = method;
            selectElement.appendChild(option);
        }
    });
}

function updateProfitGoalProgress(currentDailyProfit = null) {
    const dailyGoal = userConfig.profitGoals ? userConfig.profitGoals.daily : defaultProfitGoals.daily;
    
    if (currentDailyProfit === null) {
        // If not provided, calculate from current operations
        const todayOps = operations.filter(op => op.fecha === currentDate);
        currentDailyProfit = todayOps
            .filter(op => op.operacion === 'Compra') // Assuming profit is primarily from buy operations
            .reduce((sum, op) => sum + (Number(op.ves) || 0), 0);
    }

    document.getElementById('currentDailyProfit').textContent = `${currentDailyProfit.toFixed(2)} VES`;
    document.getElementById('dailyGoal').textContent = `${dailyGoal.toFixed(2)} VES`;

    const progressBar = document.getElementById('dailyProgressBar');
    let progressPercentage = (currentDailyProfit / dailyGoal) * 100;
    progressPercentage = Math.min(Math.max(progressPercentage, 0), 100); // Clamp between 0 and 100

    progressBar.style.width = `${progressPercentage}%`;
    if (progressPercentage >= 100) {
        progressBar.style.background = 'linear-gradient(90deg, #48bb78, #2f855a)'; // Darker green for completion
    } else {
        progressBar.style.background = 'linear-gradient(90deg, var(--success), #38a169)';
    }
}


// ===== PERFILES DE CONTRAPARTE (MINI-CRM) =====
let currentProfileUserName = '';

function openUserProfileModal(userName) {
    currentProfileUserName = userName;
    document.getElementById('profileUserName').textContent = userName;
    document.getElementById('userProfileModal').classList.add('show');
    
    loadUserProfileData(userName);
}

function closeUserProfileModal() {
    document.getElementById('userProfileModal').classList.remove('show');
    currentProfileUserName = '';
}

async function loadUserProfileData(userName) {
    // Load Ratings
    const avgRating = calculateAverageRating(userName);
    const totalRatings = userRatings[userName] ? userRatings[userName].length : 0;
    document.getElementById('profileAvgRating').textContent = `${avgRating.toFixed(2)} ★`;
    document.getElementById('profileTotalRatings').textContent = totalRatings;

    // Load Operations History and calculate statistics
    const userOperations = operations.filter(op => op.usuario === userName);
    const userWallyOperations = wallyOperations.filter(op => op.usuario === userName);
    const allUserOps = [...userOperations, ...userWallyOperations].sort((a, b) => b.timestamp - a.timestamp);

    let totalUsdcVolume = 0;
    let totalVesVolume = 0;
    let numOps = allUserOps.length;
    let lastOpDate = 'N/A';

    const historyTableBody = document.getElementById('profileHistoryTable').querySelector('tbody');
    historyTableBody.innerHTML = '';

    allUserOps.forEach(op => {
        if (op.operacion === 'Compra' || op.operacion === 'Venta') { // Main operations
            totalUsdcVolume += (op.montoUsdc || 0);
            totalVesVolume += (op.montoBs || 0);
            historyTableBody.innerHTML += `
                <tr>
                    <td>${op.fecha}</td>
                    <td>${op.operacion}</td>
                    <td>${(op.montoUsdc || 0).toFixed(2)}</td>
                    <td>${(op.montoBs || 0).toFixed(2)}</td>
                    <td><span class="status-${op.estatus.toLowerCase().replace(' ', '-')}">${op.estatus}</span></td>
                </tr>
            `;
        } else { // Wally operations
            if (op.operacion === 'Compra') {
                totalUsdcVolume += (op.reciboUsdc || 0);
                totalVesVolume += (op.envioUsd || 0); // Assuming USD is equivalent to VES for volume tracking
                historyTableBody.innerHTML += `
                    <tr>
                        <td>${op.fecha}</td>
                        <td>Wally Compra</td>
                        <td>${(op.reciboUsdc || 0).toFixed(2)}</td>
                        <td>${(op.envioUsd || 0).toFixed(2)} USD</td>
                        <td>Completado</td>
                    </tr>
                `;
            } else if (op.operacion === 'Venta') {
                totalUsdcVolume += (op.envioUsdc || 0);
                totalVesVolume += (op.reciboUsd || 0); // Assuming USD is equivalent to VES for volume tracking
                historyTableBody.innerHTML += `
                    <tr>
                        <td>${op.fecha}</td>
                        <td>Wally Venta</td>
                        <td>${(op.envioUsdc || 0).toFixed(2)}</td>
                        <td>${(op.reciboUsd || 0).toFixed(2)} USD</td>
                        <td>Completado</td>
                    </tr>
                `;
            }
        }
        if (lastOpDate === 'N/A') {
            lastOpDate = op.fecha;
        }
    });

    document.getElementById('profileTotalUsdc').value = totalUsdcVolume.toFixed(2);
    document.getElementById('profileTotalVes').value = totalVesVolume.toFixed(2);
    document.getElementById('profileNumOps').value = numOps;
    document.getElementById('profileLastOpDate').value = lastOpDate;

    // Load Notes
    db.collection('users').doc(currentUserId).collection('userProfiles').doc(userName).get()
        .then(doc => {
            if (doc.exists) {
                document.getElementById('profileNotes').value = doc.data().notes || '';
            } else {
                document.getElementById('profileNotes').value = '';
            }
        })
        .catch(error => console.error("Error loading user profile notes:", error));
}

function saveProfileNotes() {
    if (!currentUserId || !currentProfileUserName) return;
    const notes = document.getElementById('profileNotes').value;

    db.collection('users').doc(currentUserId).collection('userProfiles').doc(currentProfileUserName).set({ notes: notes }, { merge: true })
        .then(() => {
            showToast('Notas guardadas.', 'success');
        })
        .catch(error => {
            console.error("Error saving user profile notes:", error);
            showToast('Error al guardar notas.', 'error');
        });
}


// ===== SISTEMA DE INTELIGENCIA ARTIFICIAL =====
class AIOperationsCenter {
    constructor() {
        this.notifications = [];
        this.alerts = [];
        this.isOpen = false;
        this.processedOperations = new Set();
        this.lastOperationCount = 0;
        this.lastLotStates = new Map(); // Ahora se sincroniza con currentLotsData
        this.lastMetrics = {
            brecha: 0,
            ganancias: { ves: 0, usdc: 0 },
            operationsCount: 0
        };
        // Default thresholds, will be overwritten by userConfig
        this.alertThresholds = {
            brechaMin: 2,
            brechaMax: 4,
            muchoLotes: 3,
            recompraCritica: 100,
            reventaCritica: 100
        };
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadNotifications();
        this.startMonitoring();
    }

    setupEventListeners() {
        document.getElementById('aiToggleBtn').onclick = () => this.toggle();
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    // ===== MODIFICACIÓN: Abrir panel IA con transición =====
    open() {
        document.getElementById('aiPanel').classList.add('show');
        this.isOpen = true;
        this.clearNotificationBadge();
        this.updateMetrics();
        this.renderNotifications();
    }

    // ===== MODIFICACIÓN: Cerrar panel IA con transición =====
    close() {
        document.getElementById('aiPanel').classList.remove('show');
        this.isOpen = false;
    }


    analyzeCurrentState() {
        if (typeof operations !== 'undefined' && typeof currentDate !== 'undefined') {
            const todayOps = operations.filter(op => op.fecha === currentDate);
            
            if (todayOps.length > this.lastOperationCount) {
                const newOperations = todayOps.slice(this.lastOperationCount);
                newOperations.forEach(op => {
                    this.processNewOperation(op);
                });
            }
            
            this.analyzeLotChanges(currentLotsData); // Usar currentLotsData global
            this.analyzeBreach(todayOps);
            this.analyzeGainsSynchronized(todayOps);
            this.analyzePendingBalances(currentPendingData); // Usar currentPendingData global
            this.lastOperationCount = todayOps.length;
            this.updateMetrics();
        } else {
            this.updateMetrics(); 
        }
    }

    processNewOperation(operation) {
        const operationKey = `${operation.fecha}-${operation.usuario}-${operation.operacion}-${operation.montoUsdc}-${operation.tasa}-${operation.timestamp}`;
        if (this.processedOperations.has(operationKey)) return;
        this.processedOperations.add(operationKey);

        const gananciaUsdc = parseFloat(operation.usdc) || 0;
        const gananciaVes = parseFloat(operation.ves) || 0;
        
        this.addNotification('success', 
            `${operation.operacion} Registrada`, 
            `${operation.usuario}: ${operation.operacion} de ${operation.montoUsdc} USDC a ${operation.tasa}`, {
            usuario: operation.usuario,
            monto: `${operation.montoUsdc} USDC`,
            tasa: operation.tasa,
            gananciaUsdc: `${gananciaUsdc.toFixed(4)} USDC`,
            gananciaVes: `${gananciaVes.toFixed(2)} VES`
        });
    }

    analyzeLotChanges(currentLotsMap) {
        const previousLots = this.lastLotStates;
        
        previousLots.forEach((prevLot, lotId) => {
            const currentLot = currentLotsMap.get(lotId);
            if (prevLot.estado === 'activo' && (!currentLot || currentLot.estado === 'cerrado')) {
                const lotKey = `closed_${lotId}`;
                if (!this.processedOperations.has(lotKey)) {
                    this.processedOperations.add(lotKey);
                    // La ganancia ya está calculada en applyFIFOForDate y almacenada en las operaciones
                    // Aquí solo necesitamos el resumen del lote
                    const totalGainVes = operations.filter(op => op.lote && op.lote.includes(`${lotId}$`))
                                                .reduce((sum, op) => sum + (Number(op.ves) || 0), 0);
                    const totalGainUsdc = operations.filter(op => op.lote && op.lote.includes(`${lotId}$`))
                                                .reduce((sum, op) => sum + (Number(op.usdc) || 0), 0);

                    this.addNotification('success', 
                        '✅ Lote Completado', 
                        `Lote ${lotId} cerrado completamente.`, {
                        loteId: lotId,
                        gananciaTotal: `${totalGainVes.toFixed(2)} VES / ${totalGainUsdc.toFixed(4)} USDC`,
                        estado: 'Cerrado'
                    });
                }
            }
        });

        currentLotsMap.forEach((currentLot, lotId) => {
            const prevLot = previousLots.get(lotId);
            if (!prevLot) { // Nuevo lote
                const lotKey = `new_${lotId}`;
                if (!this.processedOperations.has(lotKey)) {
                    this.processedOperations.add(lotKey);
                    this.addNotification('info', 
                        '📦 Nuevo Lote Creado', 
                        `Lote ${lotId} iniciado con ${currentLot.montoTotal.toFixed(2)} USDC.`, {
                        loteId: lotId,
                        montoInicial: `${currentLot.montoTotal.toFixed(2)} USDC`,
                        estado: 'Activo'
                    });
                }
            } else if (prevLot.faltante !== currentLot.faltante && currentLot.estado === 'activo') { // Progreso del lote
                const progressKey = `progress_${lotId}_${currentLot.faltante.toFixed(1)}`;
                if (!this.processedOperations.has(progressKey)) {
                    this.processedOperations.add(progressKey);
                    this.addNotification('info', 
                        '📊 Progreso de Lote', 
                        `Lote ${lotId}: ${currentLot.montoConsumido.toFixed(2)}/${currentLot.montoTotal.toFixed(2)} USDC consumidos (${(100 - currentLot.faltante).toFixed(1)}% completado).`, {
                        loteId: lotId,
                        consumido: `${currentLot.montoConsumido.toFixed(2)} USDC`,
                        total: `${currentLot.montoTotal.toFixed(2)} USDC`,
                        progreso: `${(100 - currentLot.faltante).toFixed(1)}%`
                    });
                }
            }
        });

        const lotesActivos = Array.from(currentLotsMap.values()).filter(lote => lote.estado === 'activo').length;
        const prevLotesActivos = Array.from(previousLots.values()).filter(lote => lote.estado === 'activo').length;
        if (lotesActivos >= this.alertThresholds.muchoLotes && prevLotesActivos < this.alertThresholds.muchoLotes) {
            this.addNotification('warning', 
                '⚠️ Muchos Lotes Activos', 
                `Tienes ${lotesActivos} lotes en progreso. Considera enfocar en completar ventas.`, {
                lotesActivos: lotesActivos,
                recomendacion: 'Priorizar ventas para cerrar lotes'
            });
        }

        this.lastLotStates = new Map(currentLotsMap); // Actualizar el estado de los lotes para la próxima comparación
    }

    analyzeBreach(operations) {
        const compras = operations.filter(op => op.operacion === 'Compra');
        const ventas = operations.filter(op => op.operacion === 'Venta');
        if (compras.length === 0 || ventas.length === 0) return;

        const promCompra = compras.reduce((sum, op) => sum + parseFloat(op.tasa), 0) / compras.length;
        const promVenta = ventas.reduce((sum, op) => sum + parseFloat(op.tasa), 0) / ventas.length;
        const brecha = ((promVenta - promCompra) / promCompra * 100);

        const cambioBrecha = Math.abs(brecha - this.lastMetrics.brecha);
        if (cambioBrecha > 1) {
            if (brecha < this.alertThresholds.brechaMin) {
                this.addAlert('warning', 'Brecha Baja Detectada', 
                    `La brecha bajó a ${brecha.toFixed(2)}%. Considera ajustar tasas.`, {
                    brecha: `${brecha.toFixed(2)}%`,
                    promCompra: promCompra.toFixed(2),
                    promVenta: promVenta.toFixed(2)
                });
            } else if (brecha > this.alertThresholds.brechaMax) {
                this.addAlert('success', 'Oportunidad: Brecha Alta', 
                    `Excelente brecha de ${brecha.toFixed(2)}%. ¡Buen momento para operar!`, {
                    brecha: `${brecha.toFixed(2)}%`,
                    promCompra: promCompra.toFixed(2),
                    promVenta: promVenta.toFixed(2)
                });
            }
        }

        this.lastMetrics.brecha = brecha;
    }

    analyzeGainsSynchronized(operations) {
        const compras = operations.filter(op => op.operacion === 'Compra');
        const gananciasVes = compras.reduce((sum, op) => sum + (parseFloat(op.ves) || 0), 0);
        const gananciasUsdc = compras.reduce((sum, op) => sum + (parseFloat(op.usdc) || 0), 0);

        const cambioVes = Math.abs(gananciasVes - this.lastMetrics.ganancias.ves);
        const cambioUsdc = Math.abs(gananciasUsdc - this.lastMetrics.ganancias.usdc);

        if (cambioVes > 5 || cambioUsdc > 0.01) {
            this.addNotification('info', 
                '💰 Ganancias Actualizadas', 
                `Ganancias del día actualizadas`, {
                gananciaVes: `${gananciasVes.toFixed(2)} VES`,
                gananciaUsdc: `${gananciasUsdc.toFixed(4)} USDC`,
                cambio: `+${cambioVes.toFixed(2)} VES / +${cambioUsdc.toFixed(4)} USDC`
            });
        }

        this.lastMetrics.ganancias = { ves: gananciasVes, usdc: gananciasUsdc };
    }

    analyzePendingBalances(pendingData) {
        const recompraPendiente = pendingData.recompra;
        const reventaPendiente = pendingData.reventa;

        if (recompraPendiente > this.alertThresholds.recompraCritica && 
            !this.processedOperations.has(`recompra_critica_${currentDate}`)) {
            this.addAlert('danger', '🚨 Recompra Crítica', 
                `Necesitas recomprar ${recompraPendiente.toFixed(2)} USDC para equilibrar tus ventas.`, {
                monto: `${recompraPendiente.toFixed(2)} USDC`,
                tipo: 'Recompra'
            });
            this.processedOperations.add(`recompra_critica_${currentDate}`);
        } else if (recompraPendiente === 0 && this.processedOperations.has(`recompra_critica_${currentDate}`)) {
            this.addAlert('success', '✅ Recompra Equilibrada', 
                'Ya no hay recompra pendiente. Tus operaciones están equilibradas.', {
                monto: '0 USDC',
                tipo: 'Recompra'
            });
            this.processedOperations.delete(`recompra_critica_${currentDate}`);
        }

        if (reventaPendiente > this.alertThresholds.reventaCritica && 
            !this.processedOperations.has(`reventa_critica_${currentDate}`)) {
            this.addAlert('warning', '⚠️ Reventa Pendiente', 
                `Tienes ${reventaPendiente.toFixed(2)} USDC comprados sin vender. Considera revender.`, {
                monto: `${reventaPendiente.toFixed(2)} USDC`,
                tipo: 'Reventa'
            });
            this.processedOperations.add(`reventa_critica_${currentDate}`);
        } else if (reventaPendiente === 0 && this.processedOperations.has(`reventa_critica_${currentDate}`)) {
            this.addAlert('success', '✅ Reventa Equilibrada', 
                'Ya no hay reventa pendiente. Tus operaciones están equilibradas.', {
                monto: '0 USDC',
                tipo: 'Reventa'
            });
            this.processedOperations.delete(`reventa_critica_${currentDate}`);
        }
    }

    addNotification(type, title, content, metrics = null) {
        const notificationKey = `${title}-${content}`;
        const existingToday = this.notifications.find(n => 
            n.date === new Date().toISOString().split('T')[0] && 
            `${n.title}-${n.content}` === notificationKey
        );

        if (existingToday && Date.now() - new Date(existingToday.time).getTime() < 30000) {
            return;
        }

        const notification = {
            id: Date.now(),
            type: type,
            title: title,
            content: content,
            metrics: metrics,
            time: new Date(),
            date: new Date().toISOString().split('T')[0]
        };

        this.notifications.unshift(notification);
        const today = notification.date;
        const todayNotifications = this.notifications.filter(n => n.date === today);
        
        if (todayNotifications.length > 20) {
            this.notifications = this.notifications.filter(n => 
                n.date !== today || todayNotifications.slice(0, 20).includes(n)
            );
        }

        this.renderNotifications();
        this.saveNotifications();
        this.updateBadge();
        this.updateSystemStatus(type);
    }

    addAlert(type, title, content, metrics = null) {
        const alertKey = `${title}-${content}`;
        const existingToday = this.alerts.find(a => 
            a.date === new Date().toISOString().split('T')[0] && 
            `${a.title}-${a.content}` === alertKey
        );

        if (existingToday && Date.now() - new Date(existingToday.time).getTime() < 30000) {
            return;
        }

        const alert = {
            id: Date.now(),
            type: type,
            title: title,
            content: content,
            metrics: metrics,
            time: new Date(),
            date: new Date().toISOString().split('T')[0]
        };

        this.alerts.unshift(alert);
        const today = alert.date;
        const todayAlerts = this.alerts.filter(a => a.date === today);
        
        if (todayAlerts.length > 10) { 
            this.alerts = this.alerts.filter(a => 
                a.date !== today || todayAlerts.slice(0, 10).includes(a)
            );
        }

        this.renderNotifications();
        this.saveNotifications();
        this.updateBadge();
        this.updateSystemStatus(type);
    }

    renderNotifications() {
        const container = document.getElementById('aiNotifications');
        const today = new Date().toISOString().split('T')[0];
        const todayAlerts = this.alerts.filter(n => n.date === today);
        const todayNotifications = this.notifications.filter(n => n.date === today);

        let htmlContent = '';

        const iconMap = {
            info: '💡',
            success: '✅',
            warning: '⚠️',
            danger: '🚨'
        };

        if (todayAlerts.length > 0) {
            htmlContent += `
                <div class="notification-section">
                    <h4>${iconMap['danger']} Alertas Críticas</h4>
                    ${todayAlerts.map(alert => `
                        <div class="notification ${alert.type}">
                            <div class="notification-header">
                                <div class="notification-title">
                                    <span>${iconMap[alert.type]}</span>
                                    ${alert.title}
                                </div>
                                <div class="notification-time">${alert.time.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            <div class="notification-content">
                                ${alert.content}
                            </div>
                            ${alert.metrics ? `
                                <div class="notification-metrics">
                                    ${Object.entries(alert.metrics)
                                        .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
                                        .join('')}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (todayNotifications.length > 0) {
            htmlContent += `
                <div class="notification-section">
                    <h4>${iconMap['info']} Notificaciones Generales</h4>
                    ${todayNotifications.map(notification => `
                        <div class="notification ${notification.type}">
                            <div class="notification-header">
                                <div class="notification-title">
                                    <span>${iconMap[notification.type]}</span>
                                    ${notification.title}
                                </div>
                                <div class="notification-time">${notification.time.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            <div class="notification-content">
                                ${notification.content}
                            </div>
                            ${notification.metrics ? `
                                <div class="notification-metrics">
                                    ${Object.entries(notification.metrics)
                                        .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
                                        .join('')}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (todayAlerts.length === 0 && todayNotifications.length === 0) {
            htmlContent = `
                <div class="notification info">
                    <div class="notification-header">
                        <div class="notification-title">
                            <span>📊</span>
                            Sin Alertas Nuevas
                        </div>
                        <div class="notification-time">Hoy</div>
                    </div>
                    <div class="notification-content">
                        Sistema monitoreando activamente. Se te notificará de cambios importantes.
                    </div>
                </div>
            `;
        }

        container.innerHTML = htmlContent;
    }

    updateBadge() {
        const badge = document.getElementById('aiNotificationBadge');
        const today = new Date().toISOString().split('T')[0];
        const todayCount = this.alerts.filter(n => n.date === today).length + this.notifications.filter(n => n.date === today).length;

        if (todayCount > 0 && !this.isOpen) {
            badge.style.display = 'flex';
            badge.textContent = Math.min(todayCount, 99);
        } else {
            badge.style.display = 'none';
        }
    }

    updateSystemStatus(alertType) {
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const toggleBtn = document.getElementById('aiToggleBtn');

        toggleBtn.classList.remove('has-alerts', 'critical');
        indicator.className = 'status-indicator';

        const currentCriticality = this.alerts.some(a => a.type === 'danger') ? 'danger' :
                                   this.alerts.some(a => a.type === 'warning') ? 'warning' :
                                   'info';

        if (currentCriticality === 'danger') {
            indicator.classList.add('critical');
            statusText.textContent = 'Alerta Crítica - Requiere Atención';
            toggleBtn.classList.add('critical');
        } else if (currentCriticality === 'warning') {
            indicator.classList.add('warning');
            statusText.textContent = 'Advertencia Detectada';
            toggleBtn.classList.add('has-alerts');
        } else {
            statusText.textContent = 'Sistema Activo - Monitoreando';
        }
    }

    updateMetrics() {
        try {
            if (typeof operations !== 'undefined' && typeof currentDate !== 'undefined') {
                const todayOps = operations.filter(op => op.fecha === currentDate);
                const compras = todayOps.filter(op => op.operacion === 'Compra');
                const ventas = todayOps.filter(op => op.operacion === 'Venta');

                let brecha = 0;
                if (compras.length > 0 && ventas.length > 0) {
                    const promCompra = compras.reduce((sum, op) => sum + parseFloat(op.tasa), 0) / compras.length;
                    const promVenta = ventas.reduce((sum, op) => sum + parseFloat(op.tasa), 0) / ventas.length;
                    brecha = ((promVenta - promCompra) / promCompra * 100);
                }
                
                document.getElementById('currentGap').textContent = `${brecha.toFixed(2)}%`;
                
                const gananciasVes = compras.reduce((sum, op) => sum + (parseFloat(op.ves) || 0), 0);
                const gananciasUsdc = compras.reduce((sum, op) => sum + (parseFloat(op.usdc) || 0), 0);
                
                document.getElementById('dailyProfitAI').innerHTML = `
                    <div>${gananciasVes.toFixed(2)} VES</div>
                    <div>${gananciasUsdc.toFixed(2)} USDC</div>
                `;

                const gapElement = document.getElementById('currentGap');
                gapElement.className = 'metric-value';
                
                if (brecha < this.alertThresholds.brechaMin) {
                    gapElement.classList.add('negative');
                } else if (brecha > this.alertThresholds.brechaMax) {
                    gapElement.classList.add('positive');
                } else {
                    gapElement.classList.add('warning');
                }
            } else {
                document.getElementById('currentGap').textContent = '0%';
                document.getElementById('dailyProfitAI').innerHTML = '0 VES<br>0 USDC';
            }
        } catch (error) {
            console.error("Error updating AI metrics:", error);
            document.getElementById('currentGap').textContent = '0%';
            document.getElementById('dailyProfitAI').innerHTML = '0 VES<br>0 USDC';
        }
    }

    clearNotificationBadge() {
        if (this.isOpen) {
            document.getElementById('aiNotificationBadge').style.display = 'none';
        }
    }

    saveNotifications() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const todayNotifications = this.notifications.filter(n => n.date === today);
            const todayAlerts = this.alerts.filter(a => a.date === today);

            const dataToSave = {
                notifications: todayNotifications,
                alerts: todayAlerts,
                processedOperations: Array.from(this.processedOperations),
                lastLotStates: Array.from(this.lastLotStates.entries())
            };
            localStorage.setItem(`aiStoredData_${today}`, JSON.stringify(dataToSave));
        } catch (error) {
            console.error('Error saving AI data to localStorage:', error);
        }
    }

    loadNotifications() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const storedData = localStorage.getItem(`aiStoredData_${today}`);
            if (storedData) {
                const parsedData = JSON.parse(storedData);
                this.notifications = (parsedData.notifications || [])
                    .map(n => ({
                        ...n,
                        time: new Date(n.time)
                    }));
                this.alerts = (parsedData.alerts || [])
                    .map(a => ({
                        ...a,
                        time: new Date(a.time)
                    }));
                this.processedOperations = new Set(parsedData.processedOperations || []);
                this.lastLotStates = new Map(parsedData.lastLotStates || []);
                this.renderNotifications();
                this.updateBadge();
            }
        } catch (error) {
            console.error('Error loading AI data from localStorage:', error);
        }
    }

    startMonitoring() {
        this.analyzeCurrentState();
        setInterval(() => {
            this.analyzeCurrentState();
        }, 5000);
    }

    onOperationAdded(operation) {
        this.lastOperationCount = 0; 
        this.analyzeCurrentState();
    }

    onOperationEdited(operation) {
        const operationKeyPattern = `${operation.fecha}-${operation.usuario}-${operation.operacion}-${operation.montoUsdc}-${operation.tasa}`;
        Array.from(this.processedOperations).forEach(key => {
            if (key.startsWith(operationKeyPattern)) {
                this.processedOperations.delete(key);
            }
        });
        
        this.addNotification('info', 'Operación Modificada', 
            `Se editó la operación de ${operation.usuario} (Ref: ${operation.referencia || 'N/A'})`, {
            usuario: operation.usuario,
            referencia: operation.referencia || 'N/A'
        });
        
        this.analyzeCurrentState();
    }

    onOperationsRecalculated() {
        // No limpiar processedOperations aquí, ya que las operaciones no se "reinician"
        // Solo se recalcula el estado de lotes y pendientes
        this.analyzeCurrentState();
        this.addNotification('info', 'Sistema Recalculado', 'Todas las operaciones han sido re-analizadas.');
    }

    resetDaily() {
        this.notifications = [];
        this.alerts = [];
        this.processedOperations.clear();
        this.lastLotStates.clear();
        this.lastOperationCount = 0;
        this.renderNotifications();
        this.updateBadge();
        this.addNotification('info', 'Nuevo Día', 'El sistema ha sido reiniciado para el día de hoy.');
    }
}

function clearNotifications() {
    if (window.aiCenter) {
        const today = new Date().toISOString().split('T')[0];
        window.aiCenter.notifications = window.aiCenter.notifications.filter(n => n.date !== today);
        window.aiCenter.alerts = window.aiCenter.alerts.filter(a => a.date !== today);
        window.aiCenter.renderNotifications();
        window.aiCenter.updateBadge();
        
        localStorage.removeItem(`aiStoredData_${today}`);
        window.aiCenter.processedOperations.clear();
        window.aiCenter.lastLotStates.clear();
        window.aiCenter.lastOperationCount = 0;
    }
}

// Removed toggleAISettings as it's replaced by openConfigModal
// function toggleAISettings() { ... }

document.addEventListener('DOMContentLoaded', function() {
    window.aiCenter = new AIOperationsCenter();
    
    const today = new Date().toISOString().split('T')[0];
    const lastDateKey = 'aiLastProcessedDate';
    const lastProcessedDate = localStorage.getItem(lastDateKey);
    
    if (lastProcessedDate && lastProcessedDate !== today) {
        window.aiCenter.resetDaily();
        localStorage.setItem(lastDateKey, today);
    } else if (!lastProcessedDate) {
        localStorage.setItem(lastDateKey, today);
    }
});

window.AIOperationsCenter = AIOperationsCenter;

window.notifyAINewOperation = function(operation) {
    if (window.aiCenter) {
        window.aiCenter.onOperationAdded(operation);
    }
};

window.notifyAIEditOperation = function(operation) {
    if (window.aiCenter) {
        window.aiCenter.onOperationEdited(operation);
    }
};

window.notifyAIRecalculation = function() {
    if (window.aiCenter) {
        window.aiCenter.onOperationsRecalculated();
    }
};

// Función para mostrar un Toast
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.error('Toast container not found!');
        return;
    }

    const toast = document.createElement('div');
    toast.classList.add('toast', type);

    let icon = '';
    if (type === 'success') {
        icon = '✅';
    } else if (type === 'error') {
        icon = '❌';
    } else if (type === 'info') {
        icon = 'ℹ️';
    } else if (type === 'warning') {
        icon = '⚠️';
    }

    toast.innerHTML = `<span class="icon">${icon}</span><span>${message}</span>`;
    toastContainer.appendChild(toast);

    // Forzar reflow para la animación
    void toast.offsetWidth; 
    toast.classList.add('show');

    // Eliminar el toast después de un tiempo
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide'); // Añadir clase para animación de salida
        toast.addEventListener('transitionend', () => {
            toast.remove();
        }, { once: true }); // Eliminar solo después de que la transición termine
    }, 3000); // 3 segundos
}

// ===== NUEVAS FUNCIONES PARA BRECHA POR BANCO (MODIFICADO) =====

function openBankBreachModal() {
    document.getElementById('bankBreachModal').classList.add('show');
    const bankBreaches = calculateBankBreaches();
    renderBankBreachesCards(bankBreaches);
}

function closeBankBreachModal() {
    document.getElementById('bankBreachModal').classList.remove('show');
}

function calculateBankBreaches() {
    const currentOps = operations.filter(op => op.fecha === currentDate);
    const bankData = {};

    currentOps.forEach(op => {
        if (!bankData[op.metodoPago]) {
            bankData[op.metodoPago] = {
                compras: [],
                ventas: []
            };
        }
        if (op.operacion === 'Compra') {
            bankData[op.metodoPago].compras.push(op.tasa);
        } else if (op.operacion === 'Venta') {
            bankData[op.metodoPago].ventas.push(op.tasa);
        }
    });

    const results = [];
    for (const method in bankData) {
        const compras = bankData[method].compras;
        const ventas = bankData[method].ventas;

        const promCompra = compras.length > 0 ? compras.reduce((sum, tasa) => sum + tasa, 0) / compras.length : 0;
        const promVenta = ventas.length > 0 ? ventas.reduce((sum, tasa) => sum + tasa, 0) / ventas.length : 0;
        
        const brecha = promVenta > 0 && promCompra > 0 ? ((promVenta - promCompra) / promCompra * 100) : 0;

        results.push({
            metodo: method,
            promCompra: promCompra,
            promVenta: promVenta,
            brecha: brecha
        });
    }
    return results;
}

function renderBankBreachesCards(bankBreaches) {
    const cardsContainer = document.getElementById('bankBreachCards');
    cardsContainer.innerHTML = '';

    if (bankBreaches.length === 0) {
        cardsContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No hay datos de brecha por método de pago para la fecha seleccionada.</p>';
        return;
    }

    bankBreaches.forEach(data => {
        let cardClass = '';
        if (data.brecha > userConfig.aiThresholds.brechaMax) {
            cardClass = 'breach-positive';
        } else if (data.brecha < userConfig.aiThresholds.brechaMin) {
            cardClass = 'breach-negative';
        } else {
            cardClass = 'breach-neutral';
        }

        const card = document.createElement('div');
        card.classList.add('info-card', cardClass);
        card.innerHTML = `
            <div class="info-card-title">${data.metodo}</div>
            <div class="info-card-value">${data.brecha.toFixed(2)}%</div>
            <div class="info-card-details">
                <span><span class="label">Prom. Compra:</span> <span class="value">${data.promCompra.toFixed(2)}</span></span>
                <span><span class="label">Prom. Venta:</span> <span class="value">${data.promVenta.toFixed(2)}</span></span>
            </div>
        `;
        cardsContainer.appendChild(card);
    });
}

// ===== NUEVAS FUNCIONES PARA DETALLES DE LOTES (MODIFICADO) =====

function openLotDetailsModal() {
    document.getElementById('lotDetailsModal').classList.add('show');
    renderLotDetailsCards();
}

function closeLotDetailsModal() {
    document.getElementById('lotDetailsModal').classList.remove('show');
}

function renderLotDetailsCards() {
    const cardsContainer = document.getElementById('lotDetailsCards');
    cardsContainer.innerHTML = '';

    const activeLots = Array.from(currentLotsData.values()).filter(lot => lot.estado === 'activo');

    if (activeLots.length === 0) {
        cardsContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No hay lotes activos para la fecha seleccionada.</p>';
        return;
    }

    activeLots.forEach(lot => {
        const card = document.createElement('div');
        card.classList.add('info-card');
        card.innerHTML = `
            <div class="info-card-title">Lote ID: ${lot.id}</div>
            <div class="info-card-value">${(100 - lot.faltante).toFixed(2)}%</div>
            <div class="info-card-details">
                <span><span class="label">Monto Total:</span> <span class="value">${lot.montoTotal.toFixed(2)} USDC</span></span>
                <span><span class="label">Consumido:</span> <span class="value">${lot.montoConsumido.toFixed(2)} USDC</span></span>
                <span><span class="label">Faltante:</span> <span class="value">${lot.faltante.toFixed(2)}%</span></span>
                <span><span class="label">Estado:</span> <span class="value">${lot.estado === 'activo' ? 'Activo' : 'Cerrado'}</span></span>
            </div>
        `;
        cardsContainer.appendChild(card);
    });
}

// ===== NUEVAS FUNCIONES PARA DETALLES DE PENDIENTES (MODIFICADO) =====

function openPendingDetailsModal() {
    document.getElementById('pendingDetailsModal').classList.add('show');
    renderPendingDetails();
}

function closePendingDetailsModal() {
    document.getElementById('pendingDetailsModal').classList.remove('show');
}

function renderPendingDetails() {
    document.getElementById('pendingRepurchaseSummary').textContent = `${currentPendingData.recompra.toFixed(2)} USDC`;
    document.getElementById('pendingResaleSummary').textContent = `${currentPendingData.reventa.toFixed(2)} USDC`;

    const repurchaseList = document.getElementById('pendingRepurchaseList');
    repurchaseList.innerHTML = '';
    if (currentPendingData.recompraOps.length === 0) {
        repurchaseList.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No hay operaciones de recompra pendiente.</p>';
    } else {
        currentPendingData.recompraOps.forEach(op => {
            const item = document.createElement('div');
            item.classList.add('operation-list-item');
            item.innerHTML = `
                <div><span class="op-label">Tipo:</span> <span class="op-value">Venta</span></div>
                <div><span class="op-label">Ref:</span> <span class="op-value">${op.referencia}</span></div>
                <div><span class="op-label">Monto:</span> <span class="op-value">${op.montoUsdc.toFixed(2)} USDC</span></div>
                <div><span class="op-label">Fecha:</span> <span class="op-value">${op.fecha}</span></div>
            `;
            repurchaseList.appendChild(item);
        });
    }

    const resaleList = document.getElementById('pendingResaleList');
    resaleList.innerHTML = '';
    if (currentPendingData.reventaOps.length === 0) {
        resaleList.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No hay operaciones de reventa pendiente.</p>';
    } else {
        currentPendingData.reventaOps.forEach(op => {
            const item = document.createElement('div');
            item.classList.add('operation-list-item');
            item.innerHTML = `
                <div><span class="op-label">Tipo:</span> <span class="op-value">Compra</span></div>
                <div><span class="op-label">Ref:</span> <span class="op-value">${op.referencia}</span></div>
                <div><span class="op-label">Monto:</span> <span class="op-value">${op.montoUsdc.toFixed(2)} USDC</span></div>
                <div><span class="op-label">Fecha:</span> <span class="op-value">${op.fecha}</span></div>
            `;
            resaleList.appendChild(item);
        });
    }
}