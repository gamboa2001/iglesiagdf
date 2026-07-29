/* ========================================
   CONFIGURACIÓN E INICIALIZACIÓN FIREBASE
   ======================================== */
// Usa la configuración que pegaste en la conversación
const firebaseConfig = {
  apiKey: "AIzaSyCpisShEEkdNDH9YJ_E9lNPJGzTXyhLUhY",
  authDomain: "iglesiagdf-b72cb.firebaseapp.com",
  databaseURL: "https://iglesiagdf-b72cb-default-rtdb.firebaseio.com",
  projectId: "iglesiagdf-b72cb",
  storageBucket: "iglesiagdf-b72cb.firebasestorage.app",
  messagingSenderId: "278985922070",
  appId: "1:278985922070:web:f061cb1abc14397c55c737",
  measurementId: "G-17XZQXJ9HQ"
};

// Provider global (se asigna si Firebase está disponible)
let googleProvider = null;
let cancionesRef = null;

// Inicialización de Firebase se hará en DOMContentLoaded para asegurar que el SDK ya esté cargado.
// (Si prefieres inicializar antes, asegúrate de incluir los scripts de Firebase antes de script.js en el HTML.)
// Provider global (se asigna cuando se inicializa en DOMContentLoaded)
googleProvider = null;
cancionesRef = null;

let todasLasCanciones = [];
let cancionesFiltradas = [];
let vistaActual = 'canciones'; // 'canciones' o 'repertorio'
let vistaCancionActual = 'letras';
let cargado = false;
// let ultimaEdicionTimestamp = 0; // Ya no se usa porque ahora usamos Firebase directamente para cargar y sincronizar canciones
let isSongOperationPending = false;

// Notas para la transposición
const notas = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ADMIN: contraseña por defecto (cámbiala en producción)
const ADMIN_PASSWORD = 'admin123';
const EVENTOS_ESPECIALES_KEY = 'gdf_eventosEspeciales';

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
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut()
            .then(() => {
                setAdmin(false);
                alert('Sesión cerrada.');
            })
            .catch((err) => {
                console.error('Error cerrando sesión Firebase:', err);
                // Fallback
                setAdmin(false);
                alert('Sesión cerrada.');
            });
    } else {
        setAdmin(false);
        alert('Sesión de administrador cerrada.');
    }
}

// Función auxiliar para asegurar que todas las canciones tengan un ID numérico válido (incluso si la caché local es antigua)
function asegurarIDs(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.map((c, index) => {
        const idVal = (c.id !== undefined && c.id !== null && c.id !== '') ? Number(c.id) : (index + 1);
        return Object.assign({}, c, { id: isNaN(idVal) ? (index + 1) : idVal });
    });
}

function normalizarClaveCancion(cancion) {
    const titulo = (cancion.titulo || '').trim().toLowerCase();
    const artista = (cancion.artista || '').trim().toLowerCase();
    return `${titulo}||${artista}`;
}

function dedupeCanciones(lista) {
    if (!Array.isArray(lista)) return [];
    const vistos = new Set();
    const resultado = [];

    lista.forEach(cancion => {
        const clave = normalizarClaveCancion(cancion);
        if (!clave || vistos.has(clave)) return;
        vistos.add(clave);
        resultado.push(cancion);
    });

    return resultado;
}
 
function mapDocToCancion(doc) {
    if (!doc || !doc.exists) return null;
    const data = doc.data();
    return Object.assign({ id: doc.id }, data, {
        repertorioSemanal: data && (data.repertorioSemanal === true || data.repertorioSemanal === 'true')
    });
}

function obtenerCancionesFirebase() {
    const cachedSongs = localStorage.getItem('gdf_canciones');
    if (cachedSongs) {
        try {
            const parsed = JSON.parse(cachedSongs);
            if (Array.isArray(parsed) && parsed.length > 0) {
                todasLasCanciones = dedupeCanciones(asegurarIDs(parsed));
                cargado = true;
                filtrarYMostrar();
            }
        } catch (e) {
            console.warn('Cache local inválida de canciones:', e);
            localStorage.removeItem('gdf_canciones');
        }
    }

    if (!cancionesRef) {
        console.warn('Firebase no está inicializado. No se pueden cargar las canciones.');
        return;
    }

    cancionesRef.get()
        .then(snapshot => {
            const data = snapshot.docs.map(mapDocToCancion).filter(Boolean);
            const dataConIDs = dedupeCanciones(asegurarIDs(data));
            localStorage.setItem('gdf_canciones', JSON.stringify(dataConIDs));
            todasLasCanciones = dataConIDs;
            cargado = true;
            filtrarYMostrar();
        })
        .catch(error => {
            console.error('Error cargando canciones desde Firebase:', error);
            if (todasLasCanciones.length === 0) {
                const contenedor = document.getElementById('contenedor-tarjetas');
                if (contenedor) {
                    contenedor.innerHTML = `<p style="text-align:center; color:red; font-weight:bold; padding:20px;">Error al cargar el cancionero. Revisa la conexión con Firebase.</p>`;
                }
            }
        });
}

// Detectar vista desde URL al cargar
detectarVistaDesdeURL();

function inicializarCanciones() {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
        console.warn('Firebase Firestore no disponible. Asegúrate de incluir el SDK de compatibilidad.');
        return;
    }
    cancionesRef = firebase.firestore().collection('canciones');
    obtenerCancionesFirebase();
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

    if (index === -1 || !todasLasCanciones[index].id) {
        console.warn('alternarDesdeTarjeta: no se encontró la canción o no tiene id', { titulo, artista });
        boton.disabled = false;
        boton.innerHTML = `<i class="fa-solid ${iconoOriginal}"></i>`;
        return;
    }

    const id = todasLasCanciones[index].id;
    if (!cancionesRef) {
        console.warn('Firebase no inicializado para actualizar repertorio.');
        boton.disabled = false;
        boton.innerHTML = `<i class="fa-solid ${iconoOriginal}"></i>`;
        return;
    }

    cancionesRef.doc(String(id)).update({ repertorioSemanal: nuevoEstado })
        .then(() => {
            todasLasCanciones[index].repertorioSemanal = nuevoEstado;
            boton.disabled = false;
            boton.innerHTML = `<i class="fa-solid ${nuevoEstado ? 'fa-calendar-minus' : 'fa-calendar-plus'}"></i>`;
            filtrarYMostrar();
        })
        .catch(error => {
            console.error('Error actualizando repertorio en Firebase:', error);
            alert('No se pudo actualizar el repertorio.');
            boton.disabled = false;
            boton.innerHTML = `<i class="fa-solid ${iconoOriginal}"></i>`;
        });
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
    if (boton && !editingOriginal) boton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar Canción`;

    const modalForm = document.getElementById('modal-nueva-cancion');
    if (modalForm) modalForm.style.display = 'flex';
}

function cerrarModalNuevaCancion() {
    const modalForm = document.getElementById('modal-nueva-cancion');
    if (modalForm) modalForm.style.display = 'none';
    // limpiar estado de edición cuando se cierra
    editingOriginal = null;
    const boton = document.getElementById('btn-guardar-nueva');
    if (boton) boton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar Canción`;
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
    if (isSongOperationPending) {
        return;
    }
    isSongOperationPending = true;

    if (!isAdmin()) {
        alert('Solo administradores pueden crear o editar canciones.');
        cerrarModalNuevaCancion();
        isSongOperationPending = false;
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
    const nuevoDocumento = Object.assign({ repertorioSemanal: false }, payloadBase);

    if (!isEditing) {
        const claveNueva = normalizarClaveCancion(nuevoDocumento);
        const existe = todasLasCanciones.some(cancion => normalizarClaveCancion(cancion) === claveNueva);
        if (existe) {
            alert('Ya existe una canción con el mismo título y artista. Revisa si ya fue creada antes de intentar otra vez.');
            if (boton) {
                boton.disabled = false;
                boton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar Canción`;
            }
            isSongOperationPending = false;
            return;
        }
    }

    const limpiarDespuesGuardar = () => {
        cerrarModalNuevaCancion();
        editingOriginal = null;
        if (boton) {
            boton.disabled = false;
            boton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar Canción`;
        }
        isSongOperationPending = false;
    };

    if (!cancionesRef) {
        console.error('Firestore no está inicializado. No se puede guardar la canción.');
        alert('No se pudo conectar con Firebase. Intenta recargar la página.');
        if (boton) {
            boton.disabled = false;
            boton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar Canción`;
        }
        isSongOperationPending = false;
        return;
    }

    const operacion = isEditing
        ? cancionesRef.doc(String(editingOriginal.id)).update(payloadBase)
        : cancionesRef.add(nuevoDocumento);

    operacion
        .then(() => {
            console.log('Canción guardada en Firebase.');
            limpiarDespuesGuardar();
            alert(isEditing ? '¡Canción actualizada con éxito!' : '¡Canción enviada con éxito!');
            obtenerCancionesFirebase();
        })
        .catch(error => {
            console.error('Error al crear/editar canción en Firebase:', error);
            alert('Hubo un problema al guardar la canción en Firebase.');
            editingOriginal = null;
            if (boton) {
                boton.disabled = false;
                boton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar Canción`;
            }
            isSongOperationPending = false;
        });
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

    // Guardar referencia para acciones de edición (incluyendo el ID del documento en Firebase)
    editingOriginal = { id: cancion.id, titulo: cancion.titulo, artista: cancion.artista };
    const boton = document.getElementById('btn-guardar-editar');
    if (boton) boton.innerHTML = `<i class="fa-solid fa-pen"></i> Actualizar Canción`;
    
    // Abrir modal de edición
    const modalForm = document.getElementById('modal-editar-cancion');
    if (modalForm) modalForm.style.display = 'flex';
}

// Función específica para guardar cambios de edición
function guardarEditarCancion(event) {
    event && event.preventDefault();
    if (isSongOperationPending) {
        return;
    }
    isSongOperationPending = true;

    if (!isAdmin()) {
        alert('Solo administradores pueden editar canciones.');
        cerrarModalEditarCancion();
        abrirAdminLogin();
        isSongOperationPending = false;
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

    if (!cancionesRef) {
        console.error('Firestore no está inicializado. No se puede editar la canción.');
        alert('No se pudo conectar con Firebase. Intenta recargar la página.');
        if (boton) {
            boton.disabled = false;
            boton.innerHTML = `<i class="fa-solid fa-pen"></i> Actualizar Canción`;
        }
        isSongOperationPending = false;
        return;
    }

    cancionesRef.doc(String(targetId)).update(payloadBase)
        .then(() => {
            console.log('Canción editada en Firebase con ID:', targetId);
            cerrarModalEditarCancion();
            editingOriginal = null;
            if (boton) {
                boton.disabled = false;
                boton.innerHTML = `<i class="fa-solid fa-pen"></i> Actualizar Canción`;
            }
            isSongOperationPending = false;
            alert('¡Canción actualizada con éxito!');
            obtenerCancionesFirebase();
        })
        .catch(error => {
            console.error('Error al editar canción en Firebase:', error);
            alert('Hubo un problema al actualizar la canción.');
            editingOriginal = null;
            if (boton) {
                boton.disabled = false;
                boton.innerHTML = `<i class="fa-solid fa-pen"></i> Actualizar Canción`;
            }
            isSongOperationPending = false;
        });
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

    // Inicializar Firebase aquí para evitar usar `firebase` antes de que el SDK esté listo
    if (typeof firebase !== 'undefined') {
        try {
            if (!firebase.apps || firebase.apps.length === 0) {
                firebase.initializeApp(firebaseConfig);
            }
            googleProvider = new firebase.auth.GoogleAuthProvider();
            firebase.auth().onAuthStateChanged((user) => {
                setAdmin(!!user);
            });
            inicializarCanciones();
        } catch (e) {
            console.warn('Error inicializando Firebase en DOMContentLoaded:', e);
        }
    } else {
        console.warn('Firebase SDK no encontrado en DOMContentLoaded. Asegúrate de incluir los scripts de compat antes de script.js');
    }

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

    // --- Migración de manejadores inline a listeners modernos ---
    const buscador = document.getElementById('buscador');
    if (buscador) buscador.addEventListener('input', filtrarCanciones);

    const btnCirculo = document.getElementById('btn-circulo-quintas');
    if (btnCirculo) btnCirculo.addEventListener('click', abrirModalCirculoQuintas);

    const linkAdmin = document.getElementById('link-admin');
    if (linkAdmin) linkAdmin.addEventListener('click', abrirAdminLogin);

    const linkAdminBottom = document.getElementById('link-admin-bottom');
    if (linkAdminBottom) linkAdminBottom.addEventListener('click', abrirAdminLogin);

    const btnNueva = document.getElementById('btn-nueva-cancion');
    if (btnNueva) btnNueva.addEventListener('click', abrirModalNuevaCancion);

    const btnLoginBanda = document.getElementById('btn-login-banda');
    if (btnLoginBanda) btnLoginBanda.addEventListener('click', loginBanda);

    // Gestionar todos los botones de cerrar que están dentro de modales de forma centralizada
    document.querySelectorAll('.modal-fondo .btn-cerrar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const modalFondo = btn.closest('.modal-fondo');
            if (!modalFondo) return;
            const id = modalFondo.id;
            switch (id) {
                case 'modal-circulo-quintas': cerrarModalCirculoQuintas(); break;
                case 'modal-login-admin': cerrarAdminLogin(); break;
                case 'vista-cancion': regresarALista(); break;
                case 'modal-escala-cancion': cerrarModalEscalaCancion(); break;
                case 'modal-nueva-cancion': cerrarModalNuevaCancion(); break;
                case 'modal-editar-cancion': cerrarModalEditarCancion(); break;
                case 'modal-eventos-especiales': cerrarModalEventosEspeciales(); break;
                default:
                    modalFondo.style.display = 'none';
                    document.body.classList.remove('modal-abierto');
            }
        });
    });

    // Botones de vista dentro del modal de canción (tienen data-vista en HTML)
    document.querySelectorAll('.btn-vista-cancion').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const vista = btn.dataset.vista;
            if (vista) cambiarVistaCancion(vista);
        });
    });

    // Botones de cambio de tono (tienen data-cambiar-tono)
    document.querySelectorAll('[data-cambiar-tono]').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.getAttribute('data-cambiar-tono'), 10);
            if (!isNaN(val)) cambiarTono(val);
        });
    });

    // Abrir modal de escala desde el badge de tono
    const tonoActualBtn = document.getElementById('tono-actual');
    if (tonoActualBtn) tonoActualBtn.addEventListener('click', abrirModalEscalaCancion);

    // Formularios de nueva/editar canción: submit handlers
    const formNueva = document.getElementById('form-nueva-cancion');
    if (formNueva) {
        formNueva.removeEventListener('submit', guardarNuevaCancion);
        formNueva.addEventListener('submit', guardarNuevaCancion);
    }
    const formEditar = document.getElementById('form-editar-cancion');
    if (formEditar) {
        formEditar.removeEventListener('submit', guardarEditarCancion);
        formEditar.addEventListener('submit', guardarEditarCancion);
    }

    // Botón eliminar desde modal editar
    const btnEliminar = document.getElementById('btn-eliminar-cancion');
    if (btnEliminar) {
        btnEliminar.removeEventListener('click', confirmarEliminarCancionDesdeModal);
        btnEliminar.addEventListener('click', confirmarEliminarCancionDesdeModal);
    }
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
    if (todasLasCanciones.length === 0) {
        contenedor.innerHTML = `<p style="text-align:center; color:var(--texto-secundario); padding:10px; font-size:0.9rem;">Aún no se han cargado canciones. Recarga la página y espera a que Firebase cargue el cancionero.</p>`;
        return;
    }

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

// Stub for loginBanda if not implemented yet (keeps backward compatibility with inline handlers)
function loginBanda() {
    if (typeof firebase === 'undefined') {
        alert('Firebase no está disponible. Asegúrate de que los scripts de Firebase estén cargados.');
        abrirAdminLogin();
        return;
    }
    const provider = googleProvider || new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            const user = result.user;
            setAdmin(true);
            cerrarAdminLogin();
            alert(`Bienvenido, ${user.displayName || 'Admin'}`);
        })
        .catch((error) => {
            console.error('Error al autenticar con Google:', error);
            alert('No se pudo iniciar sesión con Google.');
        });
}

function confirmarEliminarCancionDesdeModal() {
    if (isSongOperationPending) {
        return;
    }
    isSongOperationPending = true;

    if (!isAdmin()) {
        abrirAdminLogin();
        isSongOperationPending = false;
        return;
    }

    if (!confirm('¿Estás seguro de que deseas eliminar esta canción?')) {
        isSongOperationPending = false;
        return;
    }

    const id = editingOriginal && editingOriginal.id;
    const titulo = editingOriginal && editingOriginal.titulo;
    const artista = editingOriginal && editingOriginal.artista;

    if (id === undefined) {
        alert('No se pudo identificar la canción para eliminar.');
        isSongOperationPending = false;
        return;
    }

    const eliminarLocalmente = () => {
        todasLasCanciones = todasLasCanciones.filter(c => c.id !== id);
        localStorage.setItem('gdf_canciones', JSON.stringify(todasLasCanciones));
        filtrarYMostrar();
        cerrarModalEditarCancion();
    };

    if (!cancionesRef) {
        console.error('Firestore no está inicializado. No se puede eliminar la canción.');
        alert('No se pudo conectar con Firebase. Intenta recargar la página.');
        isSongOperationPending = false;
        return;
    }

    cancionesRef.doc(String(id)).delete()
        .then(() => {
            eliminarLocalmente();
            alert('Canción eliminada correctamente.');
            isSongOperationPending = false;
        })
        .catch(error => {
            console.error('Error eliminando la canción en Firebase:', error);
            alert('No se pudo eliminar la canción. Revisa la consola para más detalles.');
            isSongOperationPending = false;
        });
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