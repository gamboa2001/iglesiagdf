// (Antes se usaba Google Apps Script; ahora Realtime Database)

let todasLasCanciones = [];
let cancionesFiltradas = [];
let vistaActual = 'canciones'; // 'canciones' o 'repertorio'
let vistaCancionActual = 'letras';
let cargado = false;
let ultimaEdicionTimestamp = 0; // Guarda el momento de la última modificación local

// Notas para la transposición
const notas = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ADMIN: contraseña por defecto (cámbiala en producción)
const ADMIN_PASSWORD = 'admin123';
const EVENTOS_ESPECIALES_KEY = 'gdf_eventosEspeciales';

// -----------------------------
// Inicializar Firebase Realtime Database (si está configurado)
// Agrega `window.firebaseConfig = { ... }` en tu HTML antes de este script
// si aún no tienes el objeto de configuración.
try {
    if (window.firebase) {
        if (!firebase.apps || firebase.apps.length === 0) {
            if (window.firebaseConfig) {
                firebase.initializeApp(window.firebaseConfig);
                console.log('Firebase inicializado con window.firebaseConfig');
            } else {
                console.warn('No se encontró window.firebaseConfig — Realtime Database no inicializado.');
            }
        }
        // Referencia a Realtime Database (null si no disponible)
        window.db = (firebase.database) ? firebase.database() : null;
        if (window.db) console.log('Referencia a Realtime Database creada: `db`.');
    } else {
        console.warn('Firebase SDK no cargado — asegúrate de incluir firebase-app-compat.js y firebase-database-compat.js en tu HTML.');
    }
} catch (e) {
    console.error('Error inicializando Realtime Database:', e);
}

/* ========================================
   Funciones para gestionar vistas
   ======================================== */
function detectarVistaDesdeURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const vista = urlParams.get('vista');
    if (vista === 'repertorio' || vista === 'canciones') {
        vistaActual = vista;
        mostrarSeccion(vista);
    } else {
        // Si no hay parámetro o es inválido, mostrar 'canciones'
        mostrarSeccion('canciones');
    }
    actualizarTabActivoBottomNav();
}

function actualizarTabActivoBottomNav() {
    // Actualizar las clases de los tabs en el bottom-nav
    const tabs = document.querySelectorAll('.bottom-nav .tab-item');
    tabs.forEach(tab => {
        const href = tab.getAttribute('href');
        if (href) {
            if ((vistaActual === 'repertorio' && href.includes('?vista=repertorio')) ||
                (vistaActual === 'canciones' && href.includes('?vista=canciones'))) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        }
    });
}

function isAdmin() {
    return localStorage.getItem('gdf_isAdmin') === 'true';
}

function setAdmin(flag) {
    localStorage.setItem('gdf_isAdmin', flag ? 'true' : 'false');
    actualizarUIAdmin();
}

function actualizarUIAdmin() {
    const adminLinks = document.querySelectorAll('#link-admin');
    adminLinks.forEach(a => {
        if (isAdmin()) {
            a.innerText = 'Admin (Salir)';
            a.onclick = () => { logoutAdmin(); };
        } else {
            a.innerText = 'Admin';
            a.onclick = () => { abrirAdminLogin(); };
        }
    });

    // Mostrar/ocultar elementos marcados como data-admin-only
    const adminOnly = document.querySelectorAll('[data-admin-only="true"]');
    adminOnly.forEach(el => {
        if (isAdmin()) {
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    });

    // re-renderizar tarjetas para mostrar/ocultar controles admin
    filtrarYMostrar();
}

function abrirAdminLogin() {
    const modal = document.getElementById('modal-login-admin');
    if (modal) {
        modal.style.display = 'flex';
        document.body.classList.add('modal-abierto');
    }
}

function cerrarAdminLogin() {
    const modal = document.getElementById('modal-login-admin');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-abierto');
}

function abrirModalCirculoQuintas() {
    const modal = document.getElementById('modal-circulo-quintas');
    const boton = document.getElementById('btn-circulo-quintas');
    if (modal) {
        modal.style.display = 'flex';
        document.body.classList.add('modal-abierto');
        if (boton) boton.setAttribute('aria-expanded', 'true');
    }
}

function cerrarModalCirculoQuintas() {
    const modal = document.getElementById('modal-circulo-quintas');
    const boton = document.getElementById('btn-circulo-quintas');
    if (modal) modal.style.display = 'none';
    if (boton) boton.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('modal-abierto');
}

window.abrirModalCirculoQuintas = abrirModalCirculoQuintas;
window.cerrarModalCirculoQuintas = cerrarModalCirculoQuintas;

/* Escalas musicales para cada nota */
const ESCALAS_NOTAS = {
    'C': ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'],
    'C#': ['Do#', 'Re#', 'Mi#', 'Fa#', 'Sol#', 'La#', 'Si#'],
    'Db': ['Reb', 'Mib', 'Fab', 'Solb', 'Lab', 'Sib', 'Dob'],
    'D': ['Re', 'Mi', 'Fa#', 'Sol', 'La', 'Si', 'Do#'],
    'D#': ['Re#', 'Mi#', 'Fa##', 'Sol#', 'La#', 'Si#', 'Do##'],
    'Eb': ['Mib', 'Fab', 'Solb', 'Lab', 'Sib', 'Dob', 'Reb'],
    'E': ['Mi', 'Fa#', 'Sol#', 'La', 'Si', 'Do#', 'Re#'],
    'F': ['Fa', 'Sol', 'La', 'Sib', 'Do', 'Re', 'Mi'],
    'F#': ['Fa#', 'Sol#', 'La#', 'Si', 'Do#', 'Re#', 'Mi#'],
    'Gb': ['Solb', 'Lab', 'Sib', 'Dob', 'Reb', 'Mib', 'Fab'],
    'G': ['Sol', 'La', 'Si', 'Do', 'Re', 'Mi', 'Fa#'],
    'G#': ['Sol#', 'La#', 'Si#', 'Do#', 'Re#', 'Mi#', 'Fa##'],
    'Ab': ['Lab', 'Sib', 'Do', 'Reb', 'Mib', 'Fab', 'Solb'],
    'A': ['La', 'Si', 'Do#', 'Re', 'Mi', 'Fa#', 'Sol#'],
    'A#': ['La#', 'Si#', 'Do##', 'Re#', 'Mi#', 'Fa##', 'Sol##'],
    'Bb': ['Sib', 'Do', 'Re', 'Mib', 'Fa', 'Sol', 'La'],
    'B': ['Si', 'Do#', 'Re#', 'Mi', 'Fa#', 'Sol#', 'La#']
};

function abrirModalEscalaCancion() {
    const modal = document.getElementById('modal-escala-cancion');
    if (!modal) return;
    
    // Obtener el tono actual del elemento
    const tonoElement = document.getElementById('tono-actual');
    let tonoActual = tonoElement ? tonoElement.textContent.trim() : 'C';
    
    // Eliminar la 'm' del menor si existe para obtener la nota base
    const tonoBase = tonoActual.replace('m', '').trim();
    
    // Actualizar el título y descripción del modal
    const escalaTitleSpan = document.getElementById('escala-tono-nombre');
    const escalaDesc = document.getElementById('escala-descripcion');
    
    if (escalaTitleSpan) {
        escalaTitleSpan.textContent = tonoBase;
    }
    
    if (escalaDesc) {
        const tipoEscala = tonoActual.includes('m') ? 'menor (eólica)' : 'mayor (jónica)';
        escalaDesc.textContent = `Escala ${tipoEscala}. Notas que puedes usar en esta tonalidad.`;
    }
    
    // Generar la tabla de escala
    generarTablaEscala(tonoBase, tonoActual.includes('m'));
    
    modal.style.display = 'flex';
}

window.abrirModalEscalaCancion = abrirModalEscalaCancion;

function cerrarModalEscalaCancion() {
    const modal = document.getElementById('modal-escala-cancion');
    if (modal) modal.style.display = 'none';
}

window.cerrarModalEscalaCancion = cerrarModalEscalaCancion;

function generarTablaEscala(tonoBase, esmenor) {
    const tabla = document.getElementById('tabla-escala-cancion');
    if (!tabla) return;
    
    // Obtener las notas de la escala
    const notas = ESCALAS_NOTAS[tonoBase] || ESCALAS_NOTAS['C'];
    
    // Limpiar la tabla manteniendo solo la primera fila de encabezados
    const tbody = tabla.querySelector('tbody');
    if (tbody) {
        // Eliminar todas las filas excepto la primera
        const filas = Array.from(tbody.querySelectorAll('tr'));
        filas.slice(1).forEach(fila => fila.remove());
        
        // Crear la nueva fila con las notas
        const filaNotas = document.createElement('tr');
        
        // Celda de nombre
        const celdaNombre = document.createElement('td');
        celdaNombre.className = 'modo-name';
        celdaNombre.textContent = esmenor ? tonoBase + ' (m)' : tonoBase;
        filaNotas.appendChild(celdaNombre);
        
        // Celdas de notas
        notas.forEach(nota => {
            const celda = document.createElement('td');
            celda.textContent = nota;
            filaNotas.appendChild(celda);
        });
        
        tbody.appendChild(filaNotas);
    }
}

function intentarLogin(event) {
    event && event.preventDefault();
    const input = document.getElementById('admin-password-input');
    if (!input) return;
    const value = input.value || '';
    if (value === ADMIN_PASSWORD) {
        setAdmin(true);
        cerrarAdminLogin();
        alert('Acceso concedido: modo administrador activado.');
    } else {
        alert('Contraseña incorrecta.');
    }
}

function logoutAdmin() {
    setAdmin(false);
    alert('Sesión de administrador cerrada.');
}

// Función auxiliar para asegurar que todas las canciones tengan un ID numérico válido (incluso si la caché local es antigua)
function asegurarIDs(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.map((c, index) => {
        const idVal = (c.id !== undefined && c.id !== null && c.id !== '') ? Number(c.id) : (index + 1);
        return Object.assign({}, c, { id: isNaN(idVal) ? (index + 1) : idVal });
    });
}

// Detectar vista desde URL al cargar
detectarVistaDesdeURL();

// Inicializar autenticación anónima (si el SDK de Auth está disponible)
// y cargar los datos solo después de autenticación para cumplir reglas con `auth != null`.
try {
    if (window.firebase && firebase.auth) {
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                console.log('Usuario autenticado (anon/cred):', user && user.uid);
                // Cargar datos ahora que estamos autenticados
                try { obtenerDatosSheets(); } catch (e) { console.warn('Error llamando obtenerDatosSheets tras auth:', e); }
            } else {
                // Intentar inicio de sesión anónimo
                firebase.auth().signInAnonymously().then(() => {
                    console.log('Inicio de sesión anónimo solicitado');
                }).catch(err => {
                    console.warn('signInAnonymously falló:', err);
                    // Intentar cargar datos aunque falle (mostrará error si las reglas exigen auth)
                    try { obtenerDatosSheets(); } catch (e) { console.warn('Fallback obtenerDatosSheets error:', e); }
                });
            }
        });
    } else {
        // No hay Auth SDK; intentar cargar datos de todas formas (reglas públicas o error)
        obtenerDatosSheets();
    }
} catch (e) {
    console.warn('Error inicializando Auth flow:', e);
    try { obtenerDatosSheets(); } catch (er) { console.warn('Error fallback obtenerDatosSheets:', er); }
}

function obtenerDatosSheets(forzarRecarga) {
    // 1. Revisar si la caché tiene canciones sin ID y limpiarla si es necesario
    const cachedSongs = localStorage.getItem('gdf_canciones');
    if (cachedSongs) {
        try {
            const parsed = JSON.parse(cachedSongs);
            // Si ninguna canción tiene ID, la caché es vieja — borrarla
            const tieneTodosIDs = Array.isArray(parsed) && parsed.length > 0 && parsed.every(c => c.id !== undefined && c.id !== null && c.id !== '');
            if (tieneTodosIDs && !forzarRecarga) {
                todasLasCanciones = asegurarIDs(parsed);
                cargado = true;
                filtrarYMostrar();
            } else {
                // Caché inválida o forzar recarga — limpiar y esperar datos frescos
                console.log('Caché sin IDs detectada o recarga forzada — limpiando y recargando desde Realtime Database...');
                localStorage.removeItem('gdf_canciones');
                todasLasCanciones = [];
            }
        } catch (e) {
            console.error("Error al analizar canciones en caché:", e);
            localStorage.removeItem('gdf_canciones');
        }
    }

    // 2. Si editamos hace menos de 15 segundos, no pedir datos viejos a Sheets
    if (!forzarRecarga && Date.now() - ultimaEdicionTimestamp < 15000) {
        return;
    }

    // 3. Intentar leer desde Realtime Database si está disponible
    if (window.db && typeof window.db.ref === 'function') {
        try {
            // Usar listener 'once' para una lectura puntual que reemplaza la petición a Sheets
            window.db.ref('canciones').once('value').then(snapshot => {
                const val = snapshot.val();
                if (val) {
                    const arr = Object.keys(val).map((key, idx) => {
                        const item = Object.assign({}, val[key]);
                        // conservar un _key con la llave de Realtime y mantener compatibilidad con `id`
                        item._key = key;
                        if (item.id === undefined || item.id === null || item.id === '') item.id = idx + 1;
                        return item;
                    });
                    if (!forzarRecarga && Date.now() - ultimaEdicionTimestamp < 15000) return;
                    const dataStr = JSON.stringify(arr);
                    localStorage.setItem('gdf_canciones', dataStr);
                    todasLasCanciones = arr;
                    cargado = true;
                    filtrarYMostrar();
                    console.log('Datos cargados desde Realtime Database. Primera canción ID:', arr[0] && arr[0].id);
                } else {
                    // Sin datos en DB
                    if (todasLasCanciones.length === 0) {
                        const contenedor = document.getElementById('contenedor-tarjetas');
                        if (contenedor) {
                            contenedor.innerHTML = `<p style="text-align:center; color:red; font-weight:bold; padding:20px;">No hay canciones en la Realtime Database.</p>`;
                        }
                    }
                }
            }).catch(error => {
                console.error('Error al leer desde Realtime Database:', error);
                if (todasLasCanciones.length === 0) {
                    const contenedor = document.getElementById('contenedor-tarjetas');
                    if (contenedor) {
                        contenedor.innerHTML = `<p style="text-align:center; color:red; font-weight:bold; padding:20px;">Error al cargar el cancionero. Revisa la conexión con Realtime Database.</p>`;
                    }
                }
            });
        } catch (e) {
            console.error('Excepción leyendo Realtime Database:', e);
        }
    } else {
        console.warn('Realtime Database no disponible (window.db). No se cargaron canciones.');
    }
}


function mostrarSeccion(seccion) {
    vistaActual = seccion;
    const tituloLista = document.getElementById('titulo-lista');
    if (tituloLista) {
        tituloLista.innerText = seccion === 'repertorio' ? "Repertorio de la Semana" : "Todas las Canciones";
    }
    filtrarYMostrar();
}

function filtrarYMostrar() {
    if (vistaActual === 'repertorio') {
        cancionesFiltradas = todasLasCanciones.filter(c => c.repertorioSemanal === true || c.repertorioSemanal === "true");
    } else {
        cancionesFiltradas = [...todasLasCanciones];
    }
    
    const buscador = document.getElementById('buscador');
    if (buscador && buscador.value.trim() !== "") {
        const texto = buscador.value.toLowerCase();
        cancionesFiltradas = cancionesFiltradas.filter(c => 
            c.titulo.toLowerCase().includes(texto) || 
            c.artista.toLowerCase().includes(texto)
        );
    }

    // Ordenar por tipo (Alabanza, Adoración, Especial) y luego alfabéticamente por título
    const tiposOrden = { 'Alabanza': 0, 'Adoración': 1, 'Especial': 2 };
    cancionesFiltradas.sort((a, b) => {
        const tipoA = tiposOrden[a.tipo] !== undefined ? tiposOrden[a.tipo] : 99;
        const tipoB = tiposOrden[b.tipo] !== undefined ? tiposOrden[b.tipo] : 99;
        if (tipoA !== tipoB) return tipoA - tipoB;
        // Si el tipo es igual, ordenar por título alfabéticamente
        return (a.titulo || '').localeCompare((b.titulo || ''), 'es');
    });

    renderizarTarjetas(cancionesFiltradas);
}

function filtrarCanciones() {
    filtrarYMostrar();
}

/* ==========================================================================
   SISTEMA DE RENDERIZADO MIXTO (CARTAS EN REPERTORIO / FILAS EN CANCIONERO)
   ========================================================================== */
function renderizarTarjetas(lista) {
    const contenedor = document.getElementById('contenedor-tarjetas');
    if (!contenedor) return;

    if (lista.length === 0) {
        if (!cargado) {
            contenedor.innerHTML = `<p style="text-align:center; color:var(--texto-secundario); padding:20px;">
                <i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Cargando canciones...
            </p>`;
        } else {
            contenedor.innerHTML = `<p style="text-align:center; color:var(--texto-secundario); padding:20px;">No se encontraron canciones.</p>`;
        }
        return;
    }

    contenedor.innerHTML = "";

    // Conmutamos la clase del contenedor de acuerdo a la pestaña seleccionada
    if (vistaActual === 'repertorio') {
        contenedor.className = "modo-cartas";
    } else {
        contenedor.className = "modo-filas";
    }

    let tipoActual = null;

    lista.forEach(cancion => {
        // Agregar encabezado de tipo si cambió
        if (cancion.tipo !== tipoActual) {
            tipoActual = cancion.tipo;
            // En la vista de repertorio no mostramos los encabezados para Alabanza y Adoración
            const ocultarEncabezadoEnRepertorio = (vistaActual === 'repertorio') && (cancion.tipo === 'Alabanza' || cancion.tipo === 'Adoración');
            if (!ocultarEncabezadoEnRepertorio) {
                const headerTipo = document.createElement('div');
                headerTipo.style.cssText = 'padding: 15px 10px 10px 10px; margin-top: 20px; font-size: 1.3rem; font-weight: 700; color: var(--azul-identidad); border-bottom: 2px solid var(--borde-tarjeta);';
                headerTipo.textContent = cancion.tipo || 'Otros';
                contenedor.appendChild(headerTipo);
            }
        }
        const elemento = document.createElement('div');
        const enRepertorio = cancion.repertorioSemanal === true || cancion.repertorioSemanal === "true";
        const tieneVideo = cancion.videoLink && cancion.videoLink.trim() !== "";

        if (vistaActual === 'repertorio') {
            elemento.className = 'tarjeta-cancion';

            const badge = document.createElement('span');
            badge.className = 'badge-tono-tarjeta';
            badge.textContent = cancion.tonoOriginal || 'C';

            const title = document.createElement('h3');
            title.className = 'titulo-clickable';
            title.textContent = cancion.titulo || '';

            const artistP = document.createElement('p');
            artistP.innerHTML = `<i class="fa-solid fa-microphone"></i> ${cancion.artista || ''}`;

            const pie = document.createElement('div');
            pie.className = 'tarjeta-pie';

            const left = document.createElement('div');
            const tipoSpan = document.createElement('span');
            tipoSpan.className = 'badge-tipo';
            tipoSpan.textContent = cancion.tipo || 'Alabanza';
            left.appendChild(tipoSpan);
            if (cancion.director) {
                const dirSpan = document.createElement('span');
                dirSpan.style = 'font-size:0.85rem; color:var(--texto-secundario); margin-left:8px;';
                dirSpan.innerHTML = `<i class="fa-solid fa-user-check"></i> ${cancion.director}`;
                left.appendChild(dirSpan);
            }

            const right = document.createElement('div');
            right.style.display = 'flex';
            right.style.gap = '10px';
            right.style.alignItems = 'center';

            const btnLetra = document.createElement('button');
            btnLetra.className = 'btn-tarjeta-ver';
            btnLetra.title = 'Abrir solo letra';
            btnLetra.innerHTML = `<i class="fa-solid fa-file-lines"></i> <span>Letra</span>`;
            btnLetra.addEventListener('click', (e) => { e.stopPropagation(); abrirVistaCancion(cancion, 'letras'); });
            right.appendChild(btnLetra);

            const btnAcordes = document.createElement('button');
            btnAcordes.className = 'btn-tarjeta-ver';
            btnAcordes.title = 'Abrir letra con acordes';
            btnAcordes.innerHTML = `<i class="fa-solid fa-music"></i> <span>Letra + Acordes</span>`;
            btnAcordes.addEventListener('click', (e) => { e.stopPropagation(); abrirVistaCancion(cancion, 'acordes'); });
            right.appendChild(btnAcordes);

            if (tieneVideo) {
                const a = document.createElement('a');
                a.className = 'btn-tarjeta-video';
                a.href = cancion.videoLink;
                a.target = '_blank';
                a.title = 'Ver video de la canción';
                a.addEventListener('click', (e) => e.stopPropagation());
                a.innerHTML = `<i class="fa-brands fa-youtube" style="color: #ff0000; font-size: 1.2rem;"></i>`;
                right.appendChild(a);
            }

            if (isAdmin()) {
                const btnRep = document.createElement('button');
                btnRep.className = `btn-tarjeta-repertorio ${enRepertorio ? 'quitar' : 'agregar'}`;
                btnRep.title = enRepertorio ? 'Quitar del repertorio' : 'Añadir al repertorio';
                btnRep.innerHTML = `<i class="fa-solid ${enRepertorio ? 'fa-calendar-minus' : 'fa-calendar-plus'}"></i>`;
                btnRep.addEventListener('click', (e) => { e.stopPropagation(); alternarDesdeTarjeta(cancion.titulo, cancion.artista, enRepertorio, btnRep); });
                right.appendChild(btnRep);

                const btnEdit = document.createElement('button');
                btnEdit.className = 'btn-tarjeta-editar';
                btnEdit.title = 'Editar canción';
                btnEdit.innerHTML = `<i class="fa-solid fa-pen"></i>`;
                btnEdit.addEventListener('click', (e) => { e.stopPropagation(); abrirEditarCancion(cancion); });
                right.appendChild(btnEdit);
            }

            pie.appendChild(left);
            pie.appendChild(right);

            elemento.appendChild(badge);
            elemento.appendChild(title);
            elemento.appendChild(artistP);
            elemento.appendChild(pie);
        } else {
            elemento.className = 'fila-cancion';

            const colTono = document.createElement('div');
            colTono.className = 'col-tono';
            const badge = document.createElement('span');
            badge.className = 'badge-tono-tarjeta';
            badge.textContent = cancion.tonoOriginal || 'C';
            colTono.appendChild(badge);

            const colInfo = document.createElement('div');
            colInfo.className = 'col-info-cancion';
            const h3 = document.createElement('h3'); h3.textContent = cancion.titulo || '';
            const botonesVista = document.createElement('div');
            botonesVista.className = 'fila-vista-botones';

            const btnLetraFila = document.createElement('button');
            btnLetraFila.className = 'btn-tarjeta-ver';
            btnLetraFila.title = 'Abrir solo letra';
            btnLetraFila.innerHTML = `<i class="fa-solid fa-file-lines"></i> <span>Letra</span>`;
            btnLetraFila.addEventListener('click', (e) => { e.stopPropagation(); abrirVistaCancion(cancion, 'letras'); });
            botonesVista.appendChild(btnLetraFila);

            const btnAcordesFila = document.createElement('button');
            btnAcordesFila.className = 'btn-tarjeta-ver';
            btnAcordesFila.title = 'Abrir letra con acordes';
            btnAcordesFila.innerHTML = `<i class="fa-solid fa-music"></i> <span>Letra + Acordes</span>`;
            btnAcordesFila.addEventListener('click', (e) => { e.stopPropagation(); abrirVistaCancion(cancion, 'acordes'); });
            botonesVista.appendChild(btnAcordesFila);

            const p = document.createElement('p'); p.innerHTML = `<i class="fa-solid fa-microphone"></i> ${cancion.artista || ''}`;
            colInfo.appendChild(h3);
            colInfo.appendChild(botonesVista);
            colInfo.appendChild(p);

            const colTipo = document.createElement('div'); colTipo.className = 'col-tipo';
            const tipoSpan = document.createElement('span'); tipoSpan.className = 'badge-tipo'; tipoSpan.textContent = cancion.tipo || 'Alabanza'; colTipo.appendChild(tipoSpan);

            const colDirector = document.createElement('div'); colDirector.className = 'col-director';
            colDirector.innerHTML = cancion.director ? `<i class="fa-solid fa-user-check"></i> <span>${cancion.director}</span>` : '<span>Por asignar</span>';

            const colAcc = document.createElement('div'); colAcc.className = 'col-acciones';
            if (tieneVideo) {
                const a = document.createElement('a'); a.className = 'btn-tarjeta-video'; a.href = cancion.videoLink; a.target = '_blank'; a.title = 'Ver video de la canción'; a.addEventListener('click', (e)=> e.stopPropagation()); a.innerHTML = `<i class="fa-brands fa-youtube" style="color: #ff0000; font-size: 1.2rem;"></i>`; colAcc.appendChild(a);
            }
            if (isAdmin()) {
                const btnRep = document.createElement('button'); btnRep.className = `btn-tarjeta-repertorio ${enRepertorio ? 'quitar' : 'agregar'}`; btnRep.title = enRepertorio ? 'Quitar del repertorio' : 'Añadir al repertorio'; btnRep.innerHTML = `<i class="fa-solid ${enRepertorio ? 'fa-calendar-minus' : 'fa-calendar-plus'}"></i>`; btnRep.addEventListener('click', (e)=>{ e.stopPropagation(); alternarDesdeTarjeta(cancion.titulo, cancion.artista, enRepertorio, btnRep); }); colAcc.appendChild(btnRep);
                const btnEdit = document.createElement('button'); btnEdit.className = 'btn-tarjeta-editar'; btnEdit.title = 'Editar canción'; btnEdit.innerHTML = `<i class="fa-solid fa-pen"></i>`; btnEdit.addEventListener('click', (e)=>{ e.stopPropagation(); abrirEditarCancion(cancion); }); colAcc.appendChild(btnEdit);
            }

            elemento.appendChild(colTono);
            elemento.appendChild(colInfo);
            elemento.appendChild(colTipo);
            elemento.appendChild(colDirector);
            elemento.appendChild(colAcc);
        }

        elemento.addEventListener('click', () => abrirVistaCancion(cancion, 'letras'));
        contenedor.appendChild(elemento);
    });
}

function abrirVistaCancion(cancion, vista) {
    cancionSeleccionada = cancion;
    tonoDesplazamiento = 0;
    vistaCancionActual = vista;

    document.getElementById('cancion-titulo').innerText = cancion.titulo;
    document.getElementById('cancion-artista').innerText = cancion.artista;
    const controlesTono = document.getElementById('controles-tono-bloque');
    if (controlesTono) controlesTono.style.display = 'flex';

    actualizarBotonesVistaCancion();
    actualizarBadgeTonoModal();
    renderizarCuerpoCancion();

    const modal = document.getElementById('vista-cancion');
    if (modal) {
        modal.style.display = 'flex';
        document.body.classList.add('modal-abierto');
    }
}

// --- LOGICA DEL VISOR MODAL ---
let cancionSeleccionada = null;
let tonoDesplazamiento = 0;
let editingOriginal = null; // {titulo, artista} cuando estamos editando desde el modal

function verCancion(cancion) {
    cancionSeleccionada = cancion;
    tonoDesplazamiento = 0;
    vistaCancionActual = 'letras';
    
    document.getElementById('cancion-titulo').innerText = cancion.titulo;
    document.getElementById('cancion-artista').innerText = cancion.artista;
    
    const controlesTono = document.getElementById('controles-tono-bloque');
    if (controlesTono) controlesTono.style.display = 'flex';
    
    actualizarBotonesVistaCancion();
    actualizarBadgeTonoModal();
    renderizarCuerpoCancion();
    
    const modal = document.getElementById('vista-cancion');
    if (modal) {
        modal.style.display = 'flex';
        document.body.classList.add('modal-abierto');
    }
}

function cambiarVistaCancion(vista) {
    vistaCancionActual = vista;
    actualizarBotonesVistaCancion();
    renderizarCuerpoCancion();
}

function actualizarBotonesVistaCancion() {
    document.querySelectorAll('.btn-vista-cancion').forEach(btn => {
        const activa = btn.dataset.vista === vistaCancionActual;
        btn.classList.toggle('active', activa);
        btn.setAttribute('aria-pressed', activa ? 'true' : 'false');
    });
}

function regresarALista() {
    const modal = document.getElementById('vista-cancion');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-abierto');
}

function renderizarCuerpoCancion() {
    const pre = document.getElementById('cancion-cuerpo');
    if (!pre || !cancionSeleccionada) return;
    
    pre.classList.toggle('modo-acordes', vistaCancionActual === 'acordes');
    
    if (!cancionSeleccionada.letra) {
        pre.innerHTML = "Esta canción no tiene letra registrada.";
        return;
    }
    
    let textoProcesado = tonoDesplazamiento === 0 
        ? cancionSeleccionada.letra 
        : transponerTexto(cancionSeleccionada.letra, tonoDesplazamiento);

    if (vistaCancionActual === 'letras') {
        const textoSinAcordes = textoProcesado.replace(/\[[^\]]+\]/g, '').replace(/\n{3,}/g, '\n\n');
        pre.textContent = textoSinAcordes;
    } else {
        pre.innerHTML = textoProcesado.replace(/\[([^\]]+)\]/g, '<span class="acorde-resaltado">[$1]</span>');
    }
}

function cambiarTono(semitonos) {
    tonoDesplazamiento += semitonos;
    renderizarCuerpoCancion();
    actualizarBadgeTonoModal();
}

function actualizarBadgeTonoModal() {
    if (!cancionSeleccionada || !cancionSeleccionada.tonoOriginal) return;
    
    let tonoBaseTranspuesto = transponerNota(cancionSeleccionada.tonoOriginal, tonoDesplazamiento);
    let resultadoFinal = tonoBaseTranspuesto;
    
    const matchCompuesto = cancionSeleccionada.tonoOriginal.match(/^([A-G][#b]?m?[0-9]?)\s*[\(\/]\s*([A-G][#b]?m?[0-9]?)\s*\)?$/);
    
    if (matchCompuesto) {
        let notaUno = transponerNota(matchCompuesto[1], tonoDesplazamiento);
        let notaDos = transponerNota(matchCompuesto[2], tonoDesplazamiento);
        resultadoFinal = `${notaUno}(${notaDos})`;
    } else {
        if (cancionSeleccionada.relativo) {
            let relativoTranspuesto = transponerNota(cancionSeleccionada.relativo, tonoDesplazamiento);
            resultadoFinal = `${tonoBaseTranspuesto}(${relativoTranspuesto})`;
        }
    }
    
    document.getElementById('tono-actual').innerText = resultadoFinal;
}

function transponerTexto(texto, semitonos) {
    return texto.replace(/\[([A-G][#b]?[m]?[0-9]?(?:\/[A-G][#b]?)?)\]/g, (match, acorde) => {
        if (acorde.includes('/')) {
            const partes = acorde.split('/');
            return `[${transponerNotaAcorde(partes[0], semitonos)}/${transponerNotaAcorde(partes[1], semitonos)}]`;
        }
        return `[${transponerNotaAcorde(acorde, semitonos)}]`;
    });
}

function transponerNotaAcorde(acordeStr, semitonos) {
    const match = acordeStr.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return acordeStr;
    const notaBase = match[1];
    const extension = match[2];
    return transponerNota(notaBase, semitonos) + extension;
}

function transponerNota(nota, semitonos) {
    let notaLimpia = nota.split('(')[0].split('/')[0].trim();
    let notaNormalizada = notaLimpia.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
    
    let esMenor = notaNormalizada.includes('m') ? 'm' : '';
    let notaSinM = notaNormalizada.replace('m', '');
    
    let index = Array.isArray(notas) ? notas.indexOf(notaSinM) : -1;
    if (index === -1) return nota;
    
    let nuevoIndex = (index + semitonos) % 12;
    if (nuevoIndex < 0) nuevoIndex += 12;
    
    return notas[nuevoIndex] + esMenor;
}

// --- GESTIÓN DE REPERTORIO SEMANAL ---
function alternarDesdeTarjeta(titulo, artista, estadoActual, boton) {
    boton.disabled = true;
    const iconoOriginal = estadoActual ? 'fa-calendar-minus' : 'fa-calendar-plus';
    boton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    
    const nuevoEstado = !estadoActual;
    const datosModificados = {
        action: "editarRepertorio", 
        titulo: titulo,
        artista: artista,
        repertorioSemanal: nuevoEstado
    };

    // Si hay Realtime Database, actualizar allí; si no, restaurar estado y recargar
    if (window.db && typeof window.db.ref === 'function') {
        // Buscar por título+artista y obtener la llave de Realtime si existe
        const tituloNorm = (titulo || '').trim().toLowerCase();
        const artistaNorm = (artista || '').trim().toLowerCase();
        let index = todasLasCanciones.findIndex(c => {
            const t = (c.titulo || '').trim().toLowerCase();
            const a = (c.artista || '').trim().toLowerCase();
            return t === tituloNorm && a === artistaNorm;
        });
        if (index === -1) {
            index = todasLasCanciones.findIndex(c => (c.titulo || '').trim().toLowerCase() === tituloNorm);
        }

        const cancionLocal = index !== -1 ? todasLasCanciones[index] : null;
        const key = cancionLocal && cancionLocal._key ? cancionLocal._key : null;

        if (key) {
            window.db.ref('canciones/' + key).update({ repertorioSemanal: nuevoEstado })
                .then(() => {
                    if (index !== -1) todasLasCanciones[index].repertorioSemanal = nuevoEstado;
                    try { boton.disabled = false; boton.innerHTML = `<i class="fa-solid ${nuevoEstado ? 'fa-calendar-minus' : 'fa-calendar-plus'}"></i>`; } catch (e) {}
                    filtrarYMostrar();
                })
                .catch(err => {
                    console.error('Error actualizando Realtime Database:', err);
                    alert('No se pudo guardar en Realtime Database.');
                    try { boton.disabled = false; boton.innerHTML = `<i class="fa-solid ${iconoOriginal}"></i>`; } catch (e) {}
                });
        } else {
            console.warn('alternarDesdeTarjeta: no se encontró la canción local con clave DB, recargando lista', { titulo, artista });
            // Forzar recarga de datos para mantener consistencia
            setTimeout(obtenerDatosSheets, 800);
            try { boton.disabled = false; boton.innerHTML = `<i class="fa-solid ${iconoOriginal}"></i>`; } catch (e) {}
        }
    } else {
        console.warn('Realtime Database no disponible - no se pudo actualizar repertorio.');
        alert('Realtime Database no disponible.');
        try { boton.disabled = false; boton.innerHTML = `<i class="fa-solid ${iconoOriginal}"></i>`; } catch (e) {}
    }
}

// --- FUNCIONES PARA EL MODAL DE CREACIÓN ---
function abrirModalNuevaCancion() {
    if (!isAdmin()) {
        // Si no es admin, abrir modal de login en su lugar
        abrirAdminLogin();
        return;
    }

    const form = document.getElementById('form-nueva-cancion');
    // Sólo resetear el formulario si NO estamos en modo edición
    if (form && !editingOriginal) form.reset(); 
    
    const boton = document.getElementById('btn-guardar-nueva');
    if (boton && !editingOriginal) boton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar`;

    const modalForm = document.getElementById('modal-nueva-cancion');
    if (modalForm) modalForm.style.display = 'flex';
}

function cerrarModalNuevaCancion() {
    const modalForm = document.getElementById('modal-nueva-cancion');
    if (modalForm) modalForm.style.display = 'none';
    // limpiar estado de edición cuando se cierra
    editingOriginal = null;
    const boton = document.getElementById('btn-guardar-nueva');
    if (boton) boton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar`;
}

function cerrarModalEditarCancion() {
    const modalForm = document.getElementById('modal-editar-cancion');
    if (modalForm) modalForm.style.display = 'none';
    // limpiar estado de edición cuando se cierra
    editingOriginal = null;
    const boton = document.getElementById('btn-guardar-editar');
    if (boton) boton.innerHTML = `<i class="fa-solid fa-pen"></i> Actualizar Canción`;
}

function guardarNuevaCancion(event) {
    event && event.preventDefault();
    if (!isAdmin()) {
        alert('Solo administradores pueden crear o editar canciones.');
        cerrarModalNuevaCancion();
        return;
    }
    
    const boton = document.getElementById('btn-guardar-nueva');
    if (boton) {
        boton.disabled = true;
        boton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;
    }

    const getValById = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };

    const letraVal = document.getElementById('nueva-letra') ? document.getElementById('nueva-letra').value : (document.getElementById('nuevo-letra') ? document.getElementById('nuevo-letra').value : '');

    const payloadBase = {
        titulo: getValById('nuevo-titulo'),
        artista: getValById('nuevo-artista'),
        tonoOriginal: getValById('nuevo-tono'),
        tipo: document.getElementById('nuevo-tipo') ? document.getElementById('nuevo-tipo').value : 'Alabanza',
        director: getValById('nuevo-director') || "Por asignar",
        letra: letraVal,
        videoLink: getValById('nuevo-video')
    };

    const isEditing = editingOriginal !== null;
    const datos = isEditing ? Object.assign({ action: 'editar', originalTitulo: editingOriginal.titulo, originalArtista: editingOriginal.artista }, payloadBase) : Object.assign({ action: 'crear' }, payloadBase);

    // Si estamos creando una canción nueva, añadirla de inmediato al estado local
    if (!isEditing && payloadBase.titulo) {
        const nuevaObj = Object.assign({ repertorioSemanal: false }, payloadBase);
        todasLasCanciones.push(nuevaObj);
        localStorage.setItem('gdf_canciones', JSON.stringify(todasLasCanciones));
        filtrarYMostrar();
    }

    if (window.db && typeof window.db.ref === 'function') {
        // Crear nueva entrada en Realtime Database
        const ref = window.db.ref('canciones').push();
        ref.set(Object.assign({ repertorioSemanal: false }, payloadBase))
            .then(() => {
                console.log('Canción guardada en Realtime Database.');
                cerrarModalNuevaCancion();
                editingOriginal = null;
                if (boton) { boton.disabled = false; boton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar`; }
                alert(isEditing ? '¡Canción actualizada con éxito!' : '¡Canción enviada con éxito!');
                setTimeout(() => { obtenerDatosSheets(); }, 1200);
            })
            .catch(error => {
                console.error('Error al crear/editar canción en Realtime Database:', error);
                alert('Hubo un problema al guardar la canción en Realtime Database.');
                editingOriginal = null;
                if (boton) { boton.disabled = false; boton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar`; }
            });
    } else {
        console.warn('Realtime Database no disponible. No se pudo guardar la canción.');
        alert('Realtime Database no disponible.');
        if (boton) { boton.disabled = false; boton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar`; }
    }
}

// Abrir modal con datos para editar una canción (identificada por título+artista)
function abrirEditarCancion(tituloOrCancion, artista) {
    if (!isAdmin()) {
        abrirAdminLogin();
        return;
    }

    // Puede recibir un objeto canción o (titulo, artista)
    let cancion = null;
    if (typeof tituloOrCancion === 'object' && tituloOrCancion !== null) {
        cancion = tituloOrCancion;
    } else {
        const titulo = tituloOrCancion;
        console.log('abrirEditarCancion called with', { titulo, artista });
        let index = todasLasCanciones.findIndex(c => c.titulo === titulo && c.artista === artista);
        if (index === -1) index = todasLasCanciones.findIndex(c => c.titulo === titulo);
        if (index === -1) {
            const tituloNorm = (titulo || '').trim().toLowerCase();
            index = todasLasCanciones.findIndex(c => (c.titulo || '').trim().toLowerCase() === tituloNorm);
        }
        if (index === -1) {
            alert('No se encontró la canción para editar. (intenta recargar la página)');
            console.warn('abrirEditarCancion: not found', { titulo, artista, cancionesCount: todasLasCanciones.length });
            return;
        }
        cancion = todasLasCanciones[index];
    }
    const form = document.getElementById('form-editar-cancion');
    if (!form) return;
    document.getElementById('editar-titulo').value = cancion.titulo || '';
    document.getElementById('editar-artista').value = cancion.artista || '';
    document.getElementById('editar-tono').value = cancion.tonoOriginal || '';
    document.getElementById('editar-tipo').value = cancion.tipo || 'Alabanza';
    document.getElementById('editar-director').value = cancion.director || '';
    const videoInput = document.getElementById('editar-video');
    if (videoInput) videoInput.value = cancion.videoLink || '';
    document.getElementById('editar-letra').value = cancion.letra || '';

    // Guardar referencia para acciones de edición (incluye la clave de Realtime DB en `_key` si existe)
    editingOriginal = { id: cancion.id, _key: cancion._key || null, titulo: cancion.titulo, artista: cancion.artista };
    const boton = document.getElementById('btn-guardar-editar');
    if (boton) boton.innerHTML = `<i class="fa-solid fa-pen"></i> Actualizar Canción`;
    
    // Abrir modal de edición
    const modalForm = document.getElementById('modal-editar-cancion');
    if (modalForm) modalForm.style.display = 'flex';
}

// Función específica para guardar cambios de edición
function guardarEditarCancion(event) {
    event && event.preventDefault();
    if (!isAdmin()) {
        alert('Solo administradores pueden editar canciones.');
        cerrarModalEditarCancion();
        abrirAdminLogin();
        return;
    }

    const boton = document.getElementById('btn-guardar-editar');
    if (boton) {
        boton.disabled = true;
        boton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;
    }

    const origTitulo = (editingOriginal && editingOriginal.titulo) ? editingOriginal.titulo : (document.getElementById('editar-titulo') ? document.getElementById('editar-titulo').value.trim() : '');
    const origArtista = (editingOriginal && editingOriginal.artista) ? editingOriginal.artista : (document.getElementById('editar-artista') ? document.getElementById('editar-artista').value.trim() : '');

    const payloadBase = {
        titulo: document.getElementById('editar-titulo') ? document.getElementById('editar-titulo').value.trim() : '',
        artista: document.getElementById('editar-artista') ? document.getElementById('editar-artista').value.trim() : '',
        tonoOriginal: document.getElementById('editar-tono') ? document.getElementById('editar-tono').value.trim() : '',
        tipo: document.getElementById('editar-tipo') ? document.getElementById('editar-tipo').value : 'Alabanza',
        director: (document.getElementById('editar-director') && document.getElementById('editar-director').value.trim()) || "Por asignar",
        letra: document.getElementById('editar-letra') ? document.getElementById('editar-letra').value : '',
        videoLink: document.getElementById('editar-video') ? document.getElementById('editar-video').value.trim() : ""
    };

    // Registrar tiempo de la edición local para proteger los cambios frente a refrescos asíncronos viejos
    ultimaEdicionTimestamp = Date.now();

    // Actualización inmediata del estado local para visualización instantánea
    const origNormT = origTitulo.trim().toLowerCase();
    const origNormA = origArtista.trim().toLowerCase();
    let index = todasLasCanciones.findIndex(c => 
        (c.titulo || '').trim().toLowerCase() === origNormT &&
        (c.artista || '').trim().toLowerCase() === origNormA
    );
    if (index === -1) {
        index = todasLasCanciones.findIndex(c => (c.titulo || '').trim().toLowerCase() === origNormT);
    }

    const targetId = (editingOriginal && editingOriginal.id !== undefined) 
        ? editingOriginal.id 
        : (index !== -1 ? todasLasCanciones[index].id : undefined);

    if (index !== -1) {
        todasLasCanciones[index] = Object.assign({}, todasLasCanciones[index], payloadBase, targetId !== undefined ? { id: targetId } : {});
        localStorage.setItem('gdf_canciones', JSON.stringify(todasLasCanciones));
        filtrarYMostrar();
        if (cancionSeleccionada && (cancionSeleccionada.titulo === origTitulo || cancionSeleccionada.titulo === payloadBase.titulo)) {
            cancionSeleccionada = todasLasCanciones[index];
            const titEl = document.getElementById('cancion-titulo');
            const artEl = document.getElementById('cancion-artista');
            if (titEl) titEl.innerText = cancionSeleccionada.titulo;
            if (artEl) artEl.innerText = cancionSeleccionada.artista;
            actualizarBadgeTonoModal();
            renderizarCuerpoCancion();
        }
    }

    const datos = Object.assign({ 
        originalTitulo: origTitulo, 
        originalArtista: origArtista 
    }, payloadBase);

    // Intentar actualizar en Realtime Database
    if (window.db && typeof window.db.ref === 'function') {
        const key = (editingOriginal && editingOriginal._key) ? editingOriginal._key : null;
        if (key) {
            window.db.ref('canciones/' + key).set(datos)
                .then(() => {
                    console.log('Petición de edición enviada a Realtime Database con key:', key);
                    cerrarModalEditarCancion();
                    editingOriginal = null;
                    if (boton) { boton.disabled = false; boton.innerHTML = `<i class="fa-solid fa-pen"></i> Actualizar Canción`; }
                    alert('¡Canción actualizada con éxito!');
                })
                .catch(error => {
                    console.error('Error al editar canción en Realtime Database:', error);
                    alert('Hubo un problema al actualizar la canción en Realtime Database.');
                    editingOriginal = null;
                    if (boton) { boton.disabled = false; boton.innerHTML = `<i class="fa-solid fa-pen"></i> Actualizar Canción`; }
                });
        } else {
            // No tenemos la key DB: forzar recarga y avisar al usuario
            console.warn('No se encontró clave de Realtime DB para la canción. Forzando recarga.');
            setTimeout(obtenerDatosSheets, 800);
            cerrarModalEditarCancion();
            editingOriginal = null;
            if (boton) { boton.disabled = false; boton.innerHTML = `<i class="fa-solid fa-pen"></i> Actualizar Canción`; }
            alert('No se pudo localizar la entrada en la base de datos. Se recargó la lista.');
        }
    } else {
        console.warn('Realtime Database no disponible - no se pudo actualizar la canción.');
        alert('Realtime Database no disponible.');
        editingOriginal = null;
        if (boton) { boton.disabled = false; boton.innerHTML = `<i class="fa-solid fa-pen"></i> Actualizar Canción`; }
    }
}

// Función pública para la página completa (nueva-cancion.html)
function enviarNuevaCancion() {
    if (!isAdmin()) {
        abrirAdminLogin();
        return;
    }
    // Reusar lógica del modal: crear un evento falso que llame a guardarNuevaCancion
    const fakeEvent = { preventDefault: () => {} };
    guardarNuevaCancion(fakeEvent);
}

// Cerrar modales haciendo clic en el fondo translúcido fuera del formulario
function cerrarModalPorFondo(event) {
    if (event.target && event.target.classList && event.target.classList.contains('modal-fondo')) {
        event.target.style.display = 'none';
        document.body.classList.remove('modal-abierto');
        if (event.target.id === 'modal-nueva-cancion' || event.target.id === 'modal-editar-cancion') {
            editingOriginal = null;
        }
        if (event.target.id === 'modal-eventos-especiales') {
            limpiarBuscadorEventos();
        }
        if (event.target.id === 'modal-circulo-quintas') {
            const boton = document.getElementById('btn-circulo-quintas');
            if (boton) boton.setAttribute('aria-expanded', 'false');
        }
        if (event.target.id === 'modal-escala-cancion') {
            cerrarModalEscalaCancion();
        }
    }
}
window.addEventListener('click', cerrarModalPorFondo);
window.addEventListener('touchend', (e) => {
    // Sólo si el toque termina directamente sobre el fondo del modal (no sobre el contenido)
    const el = e.changedTouches && e.changedTouches[0] ? document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY) : null;
    if (el && el.classList && el.classList.contains('modal-fondo')) {
        cerrarModalPorFondo({ target: el });
    }
});

// Inicializar estado admin al cargar cualquier página que incluya este script
window.addEventListener('DOMContentLoaded', () => {
    if (typeof actualizarUIAdmin === 'function') actualizarUIAdmin();
    if (typeof inicializarEventosEspeciales === 'function') inicializarEventosEspeciales();

    // Añadir touchend a todos los botones interactivos para máxima compatibilidad móvil
    const touchMap = [
        ['btn-eventos-especiales-card', abrirModalEventosEspeciales],
        ['btn-circulo-quintas', abrirModalCirculoQuintas],
        ['link-admin', abrirAdminLogin],
        ['link-admin-bottom', abrirAdminLogin],
    ];
    touchMap.forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('touchend', (e) => {
                e.preventDefault();
                fn();
            }, { passive: false });
        }
    });
});

/* ==========================================================================
   MÓDULO: EVENTOS ESPECIALES
   Gestiona una lista local de canciones para eventos especiales.
   Los datos se persisten en localStorage bajo la clave 'gdf_eventosEspeciales'.
   ========================================================================== */

function inicializarEventosEspeciales() {
    try {
        const raw = localStorage.getItem(EVENTOS_ESPECIALES_KEY);
        if (raw === null) {
            localStorage.setItem(EVENTOS_ESPECIALES_KEY, JSON.stringify([]));
        }
    } catch (e) {
        console.warn('No se pudo inicializar eventos especiales en localStorage.', e);
        try {
            const rawSession = sessionStorage.getItem(EVENTOS_ESPECIALES_KEY);
            if (rawSession === null) {
                sessionStorage.setItem(EVENTOS_ESPECIALES_KEY, JSON.stringify([]));
            }
        } catch (sessionError) {
            console.error('No se pudo inicializar eventos especiales en sessionStorage.', sessionError);
        }
    }
}

function obtenerEventosEspeciales() {
    let raw = null;
    try {
        raw = localStorage.getItem(EVENTOS_ESPECIALES_KEY);
    } catch (e) {
        console.warn('No se pudo leer eventos especiales desde localStorage, intentando sessionStorage.', e);
    }

    if (!raw) {
        try {
            raw = sessionStorage.getItem(EVENTOS_ESPECIALES_KEY);
        } catch (e) {
            console.warn('No se pudo leer eventos especiales desde sessionStorage.', e);
            return [];
        }
    }

    if (!raw || raw.trim() === '') return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        console.warn('Eventos especiales almacenados no son un array:', parsed);
        return [];
    } catch (e) {
        console.warn('Error leyendo eventos especiales desde storage:', e);
        return [];
    }
}

function guardarEventosEspeciales(lista) {
    if (!Array.isArray(lista)) {
        console.warn('guardarEventosEspeciales recibió un valor inválido:', lista);
        return;
    }
    const contenido = JSON.stringify(lista);
    try {
        localStorage.setItem(EVENTOS_ESPECIALES_KEY, contenido);
    } catch (error) {
        console.warn('No se pudo guardar eventos especiales en localStorage, intentando sessionStorage.', error);
        try {
            sessionStorage.setItem(EVENTOS_ESPECIALES_KEY, contenido);
        } catch (secondaryError) {
            console.error('No se pudo guardar eventos especiales en ninguna storage.', secondaryError);
        }
    }
}

window.addEventListener('storage', (event) => {
    if (event.key === EVENTOS_ESPECIALES_KEY) {
        const modal = document.getElementById('modal-eventos-especiales');
        if (modal && modal.style.display === 'flex') {
            renderizarListaEventos();
        }
    }
});

function abrirModalEventosEspeciales() {
    const modal = document.getElementById('modal-eventos-especiales');
    if (modal) {
        modal.style.display = 'flex';
        document.body.classList.add('modal-abierto');
        renderizarListaEventos();
        limpiarBuscadorEventos();
    }
}

function cerrarModalEventosEspeciales() {
    const modal = document.getElementById('modal-eventos-especiales');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-abierto');
    limpiarBuscadorEventos();
}

function limpiarBuscadorEventos() {
    const buscador = document.getElementById('eventos-buscador');
    if (buscador) buscador.value = '';
    const resultados = document.getElementById('eventos-resultados-busqueda');
    if (resultados) resultados.innerHTML = '';
}

function actualizarCountBadgeEventos(lista) {
    const badge = document.getElementById('eventos-count-badge');
    if (!badge) return;
    const n = lista.length;
    badge.textContent = n === 0 ? 'Sin canciones' : n === 1 ? '1 canción' : `${n} canciones`;
}

function renderizarListaEventos() {
    const contenedor = document.getElementById('eventos-lista-canciones');
    if (!contenedor) return;

    const lista = obtenerEventosEspeciales();
    actualizarCountBadgeEventos(lista);

    contenedor.innerHTML = '';

    if (lista.length === 0) {
        contenedor.innerHTML = `
            <p style="text-align:center; color:var(--texto-secundario); padding:20px;" id="eventos-lista-vacia">
                <i class="fa-solid fa-music" style="font-size:2rem; opacity:0.3; display:block; margin-bottom:10px;"></i>
                No hay canciones en este evento todavía.<br>¡Añade canciones desde el buscador!
            </p>`;
        return;
    }

    lista.forEach((cancion, idx) => {
        const tarjeta = crearTarjetaEventoEspecial(cancion, {
            mostrarQuitar: true,
            quitarHandler: () => quitarCancionDeEventos(idx),
            abrirVista: 'letras'
        });
        contenedor.appendChild(tarjeta);
    });
}

function crearTarjetaEventoEspecial(cancion, opciones = {}) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'tarjeta-cancion tarjeta-cancion-evento';
    tarjeta.style.cursor = 'pointer';

    const badge = document.createElement('span');
    badge.className = 'badge-tono-tarjeta';
    badge.textContent = cancion.tonoOriginal || 'C';

    const title = document.createElement('h3');
    title.className = 'titulo-clickable';
    title.textContent = cancion.titulo || '';

    const artistP = document.createElement('p');
    artistP.innerHTML = `<i class="fa-solid fa-microphone"></i> ${cancion.artista || ''}`;

    const pie = document.createElement('div');
    pie.className = 'tarjeta-pie';

    const left = document.createElement('div');
    const tipoSpan = document.createElement('span');
    tipoSpan.className = 'badge-tipo';
    tipoSpan.textContent = cancion.tipo || 'Alabanza';
    left.appendChild(tipoSpan);
    if (cancion.director) {
        const dirSpan = document.createElement('span');
        dirSpan.style = 'font-size:0.85rem; color:var(--texto-secundario); margin-left:8px;';
        dirSpan.innerHTML = `<i class="fa-solid fa-user-check"></i> ${cancion.director}`;
        left.appendChild(dirSpan);
    }

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '10px';
    right.style.alignItems = 'center';
    right.style.flexWrap = 'wrap';

    const btnLetra = document.createElement('button');
    btnLetra.className = 'btn-tarjeta-ver';
    btnLetra.title = 'Abrir letra';
    btnLetra.innerHTML = `<i class="fa-solid fa-file-lines"></i> <span>Letra</span>`;
    btnLetra.addEventListener('click', (e) => {
        e.stopPropagation();
        cerrarModalEventosEspeciales();
        const completa = todasLasCanciones.find(c =>
            (c.titulo || '').trim().toLowerCase() === (cancion.titulo || '').trim().toLowerCase()
        ) || cancion;
        abrirVistaCancion(completa, 'letras');
    });
    right.appendChild(btnLetra);

    const btnAcordes = document.createElement('button');
    btnAcordes.className = 'btn-tarjeta-ver';
    btnAcordes.title = 'Abrir acordes';
    btnAcordes.innerHTML = `<i class="fa-solid fa-music"></i> <span>Acordes</span>`;
    btnAcordes.addEventListener('click', (e) => {
        e.stopPropagation();
        cerrarModalEventosEspeciales();
        const completa = todasLasCanciones.find(c =>
            (c.titulo || '').trim().toLowerCase() === (cancion.titulo || '').trim().toLowerCase()
        ) || cancion;
        abrirVistaCancion(completa, 'acordes');
    });
    right.appendChild(btnAcordes);

    if (cancion.videoLink && cancion.videoLink.trim() !== '') {
        const a = document.createElement('a');
        a.className = 'btn-tarjeta-video';
        a.href = cancion.videoLink;
        a.target = '_blank';
        a.title = 'Ver video de la canción';
        a.addEventListener('click', (e) => e.stopPropagation());
        a.innerHTML = `<i class="fa-brands fa-youtube" style="color: #ff0000; font-size: 1.2rem;"></i>`;
        right.appendChild(a);
    }

    if (opciones.mostrarQuitar) {
        const btnQuitar = document.createElement('button');
        btnQuitar.className = 'btn-tarjeta-repertorio quitar';
        btnQuitar.title = 'Quitar del evento';
        btnQuitar.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
        btnQuitar.addEventListener('click', (e) => {
            e.stopPropagation();
            opciones.quitarHandler && opciones.quitarHandler();
        });
        right.appendChild(btnQuitar);
    }

    if (opciones.mostrarAgregar) {
        const btnAgregar = document.createElement('button');
        btnAgregar.className = opciones.enEvento ? 'btn-tarjeta-repertorio quitar' : 'btn-tarjeta-repertorio agregar';
        btnAgregar.title = opciones.enEvento ? 'Ya está en el evento' : 'Añadir al evento';
        btnAgregar.disabled = opciones.enEvento;
        btnAgregar.innerHTML = opciones.enEvento
            ? `<i class="fa-solid fa-check"></i> En evento`
            : `<i class="fa-solid fa-plus"></i> Añadir`;
        btnAgregar.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!opciones.enEvento) opciones.agregarHandler && opciones.agregarHandler();
        });
        right.appendChild(btnAgregar);
    }

    pie.appendChild(left);
    pie.appendChild(right);

    tarjeta.appendChild(badge);
    tarjeta.appendChild(title);
    tarjeta.appendChild(artistP);
    tarjeta.appendChild(pie);

    if (opciones.abrirVista) {
        tarjeta.addEventListener('click', () => {
            cerrarModalEventosEspeciales();
            const completa = todasLasCanciones.find(c =>
                (c.titulo || '').trim().toLowerCase() === (cancion.titulo || '').trim().toLowerCase()
            ) || cancion;
            abrirVistaCancion(completa, opciones.abrirVista);
        });
    }

    return tarjeta;
}

function agregarCancionAEventos(cancion) {
    const lista = obtenerEventosEspeciales();
    const yaEsta = lista.some(c =>
        (c.titulo || '').trim().toLowerCase() === (cancion.titulo || '').trim().toLowerCase()
    );
    if (yaEsta) {
        // Animar visualmente que ya está
        mostrarToastEventos('Ya está en la lista de Eventos Especiales', 'info');
        return;
    }
    lista.push({
        titulo: cancion.titulo || '',
        artista: cancion.artista || '',
        tonoOriginal: cancion.tonoOriginal || 'C',
        tipo: cancion.tipo || '',
        director: cancion.director || '',
        videoLink: cancion.videoLink || '',
        letra: cancion.letra || ''
    });
    guardarEventosEspeciales(lista);
    renderizarListaEventos();
    buscarCancionesParaEvento(); // Refrescar resultados de búsqueda para actualizar el estado del botón
    mostrarToastEventos(`"${cancion.titulo}" añadida al evento`, 'ok');
}

function quitarCancionDeEventos(idx) {
    const lista = obtenerEventosEspeciales();
    if (idx < 0 || idx >= lista.length) return;
    const titulo = lista[idx].titulo;
    lista.splice(idx, 1);
    guardarEventosEspeciales(lista);
    renderizarListaEventos();
    buscarCancionesParaEvento();
    mostrarToastEventos(`"${titulo}" quitada del evento`, 'warn');
}

function confirmarLimpiarEventos() {
    if (!isAdmin()) return;
    if (confirm('¿Vaciar toda la lista de Eventos Especiales?')) {
        guardarEventosEspeciales([]);
        renderizarListaEventos();
        limpiarBuscadorEventos();
    }
}

function buscarCancionesParaEvento() {
    const buscador = document.getElementById('eventos-buscador');
    const contenedor = document.getElementById('eventos-resultados-busqueda');
    if (!buscador || !contenedor) return;

    const texto = buscador.value.trim().toLowerCase();
    contenedor.innerHTML = '';

    if (texto.length < 1) return;

    const listaEventos = obtenerEventosEspeciales();
    const idsEnEvento = new Set(listaEventos.map(c => (c.titulo || '').trim().toLowerCase()));

    const resultados = todasLasCanciones.filter(c =>
        (c.titulo || '').toLowerCase().includes(texto) ||
        (c.artista || '').toLowerCase().includes(texto)
    ).slice(0, 8);

    if (resultados.length === 0) {
        contenedor.innerHTML = `<p style="text-align:center; color:var(--texto-secundario); padding:10px; font-size:0.9rem;">No se encontraron canciones.</p>`;
        return;
    }

    resultados.forEach(cancion => {
        const estaEnEvento = idsEnEvento.has((cancion.titulo || '').trim().toLowerCase());
        const tarjeta = crearTarjetaEventoEspecial(cancion, {
            mostrarAgregar: true,
            enEvento: estaEnEvento,
            agregarHandler: () => agregarCancionAEventos(cancion),
            abrirVista: 'letras'
        });
        contenedor.appendChild(tarjeta);
    });
}

// Toast de notificación breve para el módulo de eventos
function mostrarToastEventos(mensaje, tipo) {
    // Eliminar toast anterior si existe
    const anterior = document.getElementById('eventos-toast');
    if (anterior) anterior.remove();

    const toast = document.createElement('div');
    toast.id = 'eventos-toast';
    toast.className = `eventos-toast eventos-toast-${tipo}`;
    toast.innerHTML = `<i class="fa-solid ${tipo === 'ok' ? 'fa-circle-check' : tipo === 'warn' ? 'fa-circle-minus' : 'fa-circle-info'}"></i> ${mensaje}`;
    document.body.appendChild(toast);

    // Activar animación
    requestAnimationFrame(() => { toast.classList.add('visible'); });
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 350);
    }, 2500);
}

/* Exponer funciones al objeto global window para asegurar compatibilidad total con eventos en HTML */
Object.assign(window, {
    abrirAdminLogin,
    cerrarAdminLogin,
    loginBanda,
    abrirModalCirculoQuintas,
    cerrarModalCirculoQuintas,
    abrirModalEscalaCancion,
    cerrarModalEscalaCancion,
    intentarLogin,
    logoutAdmin,
    mostrarSeccion,
    filtrarYMostrar,
    filtrarCanciones,
    abrirVistaCancion,
    verCancion,
    cambiarVistaCancion,
    regresarALista,
    cambiarTono,
    abrirModalNuevaCancion,
    cerrarModalNuevaCancion,
    abrirEditarCancion,
    cerrarModalEditarCancion,
    guardarNuevaCancion,
    guardarEditarCancion,
    confirmarEliminarCancionDesdeModal,
    abrirModalEventosEspeciales,
    cerrarModalEventosEspeciales,
    buscarCancionesParaEvento,
    confirmarLimpiarEventos,
    alternarDesdeTarjeta
});

