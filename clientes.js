// --- Lógica del módulo de Clientes ---

(function() {
    // Variables locales del módulo que se inicializarán desde index.html
    let _db, _userId, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _getDocs, _writeBatch, _query, _where;
    
    let _clientesCache = []; // Caché local para búsquedas y ediciones rápidas

    /**
     * Inicializa el módulo con las dependencias necesarias desde la app principal.
     */
    window.initClientes = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _activeListeners = dependencies.activeListeners;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _showAddItemModal = dependencies.showAddItemModal;
        _populateDropdown = dependencies.populateDropdown;
        _collection = dependencies.collection;
        _onSnapshot = dependencies.onSnapshot;
        _doc = dependencies.doc;
        _getDoc = dependencies.getDoc;
        _addDoc = dependencies.addDoc;
        _setDoc = dependencies.setDoc;
        _deleteDoc = dependencies.deleteDoc;
        _getDocs = dependencies.getDocs;
        _writeBatch = dependencies.writeBatch;
        _query = dependencies.query;
        _where = dependencies.where;
        
        // Cargar y cachear clientes en segundo plano para validaciones
        const clientesRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/clientes`);
        _onSnapshot(clientesRef, (snapshot) => {
            _clientesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
    };

    /**
     * Renderiza el menú de subopciones de clientes.
     */
    window.showClientesSubMenu = function() {
         _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Clientes</h1>
                        <div class="space-y-4">
                            <button id="verClientesBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition duration-300 transform hover:scale-105">
                                Ver Clientes
                            </button>
                            <button id="agregarClienteBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition duration-300 transform hover:scale-105">
                                Agregar Cliente
                            </button>
                            <button id="modifyDeleteClienteBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition duration-300 transform hover:scale-105">
                                Modificar / Eliminar Cliente
                            </button>
                            <button id="syncPDF" class="w-full px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 transition duration-300 transform hover:scale-105">
                                Sincronizar desde PDF de CXC
                            </button>
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-300 transform hover:scale-105">
                                Volver al Menú Principal
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('verClientesBtn').addEventListener('click', showVerClientesView);
        document.getElementById('agregarClienteBtn').addEventListener('click', showAgregarClienteView);
        document.getElementById('modifyDeleteClienteBtn').addEventListener('click', showModifyDeleteSearchView);
        document.getElementById('syncPDF').addEventListener('click', showSyncPDFView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }
    
    /**
     * Muestra la vista para cargar y sincronizar un PDF de Cuentas por Cobrar.
     */
    function showSyncPDFView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4">Sincronizar desde PDF</h2>
                        <p class="text-gray-600 mb-6 max-w-lg mx-auto">Sube el archivo PDF de Cuentas por Cobrar para actualizar automáticamente la información de clientes y sus saldos en la aplicación.</p>
                        
                        <div class="max-w-md mx-auto border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-teal-500 transition" id="pdf-dropzone">
                            <input type="file" id="pdf-file-input" class="hidden" accept=".pdf">
                            <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                            </svg>
                            <p class="mt-4 text-gray-500"><span class="font-semibold text-teal-600">Haz clic para subir un archivo</span> o arrástralo aquí.</p>
                            <p class="text-xs text-gray-500 mt-2">Sólo archivos PDF</p>
                            <p id="pdf-file-name" class="mt-4 font-semibold text-gray-700"></p>
                        </div>

                        <div id="sync-status" class="mt-4 text-center"></div>

                        <div class="mt-8 flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
                            <button id="backToClientesBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                            <button id="startSyncBtn" class="w-full px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 disabled:bg-gray-300" disabled>
                                Iniciar Sincronización
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const dropzone = document.getElementById('pdf-dropzone');
        const fileInput = document.getElementById('pdf-file-input');
        const fileNameDisplay = document.getElementById('pdf-file-name');
        const startSyncBtn = document.getElementById('startSyncBtn');
        let selectedFile = null;

        const handleFileSelect = (file) => {
            if (file && file.type === 'application/pdf') {
                selectedFile = file;
                fileNameDisplay.textContent = file.name;
                startSyncBtn.disabled = false;
            } else {
                _showModal('Error', 'Por favor, selecciona un archivo PDF válido.');
                selectedFile = null;
                fileNameDisplay.textContent = '';
                startSyncBtn.disabled = true;
            }
        };

        dropzone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
        
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('border-teal-500', 'bg-teal-50');
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('border-teal-500', 'bg-teal-50');
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('border-teal-500', 'bg-teal-50');
            handleFileSelect(e.dataTransfer.files[0]);
        });

        document.getElementById('backToClientesBtn').addEventListener('click', showClientesSubMenu);
        startSyncBtn.addEventListener('click', () => handlePDFSync(selectedFile));
    }

    /**
     * Procesa el archivo PDF subido para sincronizar la información.
     */
    async function handlePDFSync(file) {
        if (!file) {
            _showModal('Error', 'No se ha seleccionado ningún archivo.');
            return;
        }

        const syncStatus = document.getElementById('sync-status');
        const startSyncBtn = document.getElementById('startSyncBtn');
        startSyncBtn.disabled = true;
        syncStatus.innerHTML = `<p class="text-blue-500">Leyendo y procesando el archivo PDF... Esto puede tardar unos momentos.</p>`;
        
        if (typeof pdfjsLib === 'undefined') {
            syncStatus.innerHTML = `<p class="text-red-500">Error: La librería PDF no está cargada. Por favor, recarga la página.</p>`;
            _showModal('Error de Configuración', 'La funcionalidad de lectura de PDF no está lista. Es necesario actualizar el archivo principal de la aplicación (index.html) para incluir la librería necesaria.');
            startSyncBtn.disabled = false;
            return;
        }

        try {
            const fileReader = new FileReader();
            fileReader.onload = async function() {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
                
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = '';

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join(' ') + '\n';
                }
                
                await parseAndSyncClients(fullText);
            };
            fileReader.readAsArrayBuffer(file);
        } catch (error) {
            console.error("Error processing PDF:", error);
            syncStatus.innerHTML = `<p class="text-red-500">Error al procesar el PDF: ${error.message}</p>`;
            startSyncBtn.disabled = false;
            _showModal('Error', 'No se pudo procesar el archivo PDF.');
        }
    }

    /**
     * Parsea el texto del PDF para encontrar clientes nuevos, pide confirmación y los crea.
     */
    async function parseAndSyncClients(text) {
        const syncStatus = document.getElementById('sync-status');
        syncStatus.innerHTML = `<p class="text-blue-500">Analizando texto del PDF para encontrar clientes...</p>`;

        const summaryRegex = /(\d+)\s+([A-ZÁÉÍÓÚÑ&.'\s]+?)\s+([\d,.-]+)\s+/g;

        const summaryStart = text.indexOf("RAZON SOCIAL");
        const summaryEnd = text.indexOf("SUB TOTAL");
        if (summaryStart === -1 || summaryEnd === -1) {
            _showModal('Error de Formato', 'No se pudo encontrar la tabla de resumen de clientes en el PDF. Verifique que el archivo sea correcto.');
            syncStatus.innerHTML = `<p class="text-red-500">Análisis fallido. Formato de PDF no reconocido.</p>`;
            document.getElementById('startSyncBtn').disabled = false;
            return;
        }
        const summaryText = text.substring(summaryStart, summaryEnd);

        let match;
        const pdfClients = new Map();
        while ((match = summaryRegex.exec(summaryText)) !== null) {
            let commercialName = match[2].trim();
            let personalName = '';

            const nameParts = commercialName.split(/\s{3,}/);
            if (nameParts.length > 1 && nameParts[0].trim().length > 0) {
                commercialName = nameParts[0].trim();
                personalName = nameParts.slice(1).join(' ').trim();
            }

            if (commercialName && !pdfClients.has(commercialName.toLowerCase())) {
                pdfClients.set(commercialName.toLowerCase(), {
                    nombreComercial: commercialName,
                    nombrePersonal: personalName || 'N/A',
                });
            }
        }

        const existingCommercialNames = new Set(_clientesCache.map(c => c.nombreComercial.toLowerCase()));
        const newClientsToAdd = [];
        for (const [key, pdfClient] of pdfClients.entries()) {
            if (!existingCommercialNames.has(key)) {
                newClientsToAdd.push(pdfClient);
            }
        }

        if (newClientsToAdd.length === 0) {
            _showModal('Sin Novedades', 'Todos los clientes del archivo PDF ya existen en la base de datos.');
            syncStatus.innerHTML = `<p class="text-green-500">Análisis completo. No se encontraron clientes nuevos para agregar.</p>`;
            document.getElementById('startSyncBtn').disabled = false;
            return;
        }

        const confirmationMessage = `
            <p>Se encontraron ${newClientsToAdd.length} clientes nuevos en el PDF.</p>
            <p class="mt-2">¿Deseas agregarlos a tu lista de clientes? La información de sector, teléfono y código CEP quedará en blanco.</p>
            <div class="text-left max-h-40 overflow-y-auto mt-4 border p-2 rounded">
                ${newClientsToAdd.map(c => `<p class="text-sm">${c.nombreComercial}</p>`).join('')}
            </div>
        `;

        const startSyncBtn = document.getElementById('startSyncBtn');
        _showModal('Confirmar Sincronización de Clientes', confirmationMessage, async () => {
            syncStatus.innerHTML = `<p class="text-blue-500">Agregando ${newClientsToAdd.length} clientes nuevos...</p>`;
            try {
                const batch = _writeBatch(_db);
                const clientesRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/clientes`);

                for (const clientData of newClientsToAdd) {
                    const newClientRef = _doc(clientesRef);
                    batch.set(newClientRef, {
                        nombreComercial: clientData.nombreComercial,
                        nombrePersonal: clientData.nombrePersonal,
                        sector: '',
                        telefono: '',
                        codigoCEP: ''
                    });
                }

                await batch.commit();
                _showModal('Éxito', `${newClientsToAdd.length} clientes nuevos han sido agregados correctamente.`);
                syncStatus.innerHTML = `<p class="text-green-500">¡Sincronización de clientes exitosa!</p>`;
                startSyncBtn.disabled = false;
            } catch (error) {
                console.error("Error during Firestore client sync:", error);
                _showModal('Error de Sincronización', `Ocurrió un error al guardar los nuevos clientes: ${error.message}`);
                syncStatus.innerHTML = `<p class="text-red-500">Error al guardar en la base de datos.</p>`;
                startSyncBtn.disabled = false;
            }
        });

        const closeModalBtn = document.getElementById('closeModalBtn');
        if(closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                if(startSyncBtn) startSyncBtn.disabled = false;
            });
        }
    }


    /**
     * Muestra la vista de agregar cliente.
     */
    function showAgregarClienteView() {
         _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">Agregar Cliente</h2>
                        <form id="clienteForm" class="space-y-4 text-left">
                            <div>
                                <label for="sector" class="block text-gray-700 font-medium mb-2">Sector:</label>
                                <div class="flex items-center space-x-2">
                                    <select id="sector" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required></select>
                                    <button type="button" id="addSectorBtn" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500">Agregar</button>
                                </div>
                            </div>
                            <div>
                                <label for="nombreComercial" class="block text-gray-700 font-medium mb-2">Nombre Comercial:</label>
                                <input type="text" id="nombreComercial" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="nombrePersonal" class="block text-gray-700 font-medium mb-2">Nombre Personal:</label>
                                <input type="text" id="nombrePersonal" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="telefono" class="block text-gray-700 font-medium mb-2">Teléfono:</label>
                                <input type="tel" id="telefono" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="codigoCEP" class="block text-gray-700 font-medium mb-2">Código CEP:</label>
                                <div class="flex items-center">
                                    <input type="text" id="codigoCEP" class="w-full px-4 py-2 border rounded-lg">
                                    <input type="checkbox" id="cepNA" class="ml-4 h-5 w-5">
                                    <label for="cepNA" class="ml-2 text-gray-700">No Aplica</label>
                                </div>
                            </div>
                            <button type="submit" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Guardar Cliente</button>
                        </form>
                        <button id="backToClientesBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        _populateDropdown('sectores', 'sector', 'sector');

        const cepInput = document.getElementById('codigoCEP');
        const cepNACheckbox = document.getElementById('cepNA');
        cepNACheckbox.addEventListener('change', () => {
            if (cepNACheckbox.checked) {
                cepInput.value = 'N/A';
                cepInput.disabled = true;
            } else {
                cepInput.value = '';
                cepInput.disabled = false;
                cepInput.focus();
            }
        });

        document.getElementById('clienteForm').addEventListener('submit', agregarCliente);
        document.getElementById('backToClientesBtn').addEventListener('click', showClientesSubMenu);
        document.getElementById('addSectorBtn').addEventListener('click', () => _showAddItemModal('sectores', 'Sector'));
    }

    /**
     * Agrega un nuevo cliente a la base de datos, con validación de duplicados.
     */
    async function agregarCliente(e) {
        e.preventDefault();
        const form = e.target;
        
        const nombreComercial = form.nombreComercial.value.trim();
        const nombrePersonal = form.nombrePersonal.value.trim();
        const telefono = form.telefono.value.trim();
        const codigoCEP = form.codigoCEP.value.trim();

        const normComercial = nombreComercial.toLowerCase();
        const normPersonal = nombrePersonal.toLowerCase();

        let duplicado = null;
        let motivo = "";

        for (const c of _clientesCache) {
            if (c.nombreComercial.toLowerCase() === normComercial) {
                duplicado = c;
                motivo = "nombre comercial";
                break;
            }
            if (c.nombrePersonal.toLowerCase() === normPersonal) {
                duplicado = c;
                motivo = "nombre personal";
                break;
            }
            if (c.telefono === telefono) {
                duplicado = c;
                motivo = "teléfono";
                break;
            }
            if (codigoCEP && codigoCEP.toLowerCase() !== 'n/a' && c.codigoCEP === codigoCEP) {
                duplicado = c;
                motivo = "código CEP";
                break;
            }
        }

        const guardar = async () => {
            const clienteData = {
                sector: form.sector.value,
                nombreComercial: nombreComercial,
                nombrePersonal: nombrePersonal,
                telefono: telefono,
                codigoCEP: codigoCEP
            };
            try {
                await _addDoc(_collection(_db, `artifacts/${_appId}/users/${_userId}/clientes`), clienteData);
                _showModal('Éxito', 'Cliente agregado correctamente.');
                form.reset();
                const cepNACheckbox = document.getElementById('cepNA');
                if (cepNACheckbox) {
                    cepNACheckbox.checked = false;
                    document.getElementById('codigoCEP').disabled = false;
                }
            } catch (error) {
                console.error("Error al agregar cliente:", error);
                _showModal('Error', 'Hubo un error al guardar el cliente.');
            }
        };

        if (duplicado) {
            _showModal(
                'Posible Duplicado',
                `Ya existe un cliente con el mismo ${motivo}: "${duplicado.nombreComercial}". ¿Deseas agregarlo de todas formas?`,
                guardar,
                'Sí, agregar'
            );
        } else {
            await guardar();
        }
    }

    /**
     * Muestra la vista de "Ver Clientes".
     */
    function showVerClientesView() {
         _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Lista de Clientes</h2>
                        ${getFiltrosHTML()}
                        <div id="clientesListContainer" class="overflow-x-auto max-h-96">
                            <p class="text-gray-500 text-center">Cargando clientes...</p>
                        </div>
                        <button id="backToClientesBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToClientesBtn').addEventListener('click', showClientesSubMenu);
        setupFiltros('clientesListContainer');
        renderClientesList('clientesListContainer');
    }

    /**
     * MUEVA VISTA: Muestra la interfaz de búsqueda para modificar o eliminar un cliente.
     */
    function showModifyDeleteSearchView() {
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Modificar / Eliminar Cliente</h2>
                        <div class="mb-6">
                            <input type="text" id="search-modify-input" placeholder="Buscar cliente por Nombre o Código..." class="w-full px-4 py-2 border rounded-lg">
                        </div>
                        <div id="clientes-results-container" class="overflow-x-auto max-h-96">
                            <p class="text-gray-500 text-center">Escribe en el campo superior para buscar un cliente.</p>
                        </div>
                        <button id="backToClientesBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToClientesBtn').addEventListener('click', showClientesSubMenu);
        document.getElementById('search-modify-input').addEventListener('input', (e) => {
            const searchTerm = e.target.value;
            if (searchTerm.length > 1) {
                renderClientesList('clientes-results-container', false, searchTerm);
            } else {
                document.getElementById('clientes-results-container').innerHTML = '<p class="text-gray-500 text-center">Escribe al menos 2 caracteres para buscar.</p>';
            }
        });
    }

    /**
     * Genera el HTML para los controles de filtro y búsqueda.
     */
    function getFiltrosHTML() {
        return `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg">
                <input type="text" id="search-input" placeholder="Buscar por Nombre o Código..." class="md:col-span-3 w-full px-4 py-2 border rounded-lg">
                <div>
                    <label for="filter-sector" class="text-sm font-medium">Sector</label>
                    <select id="filter-sector" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos</option></select>
                </div>
                <div class="md:col-start-3">
                    <button id="clear-filters-btn" class="w-full bg-gray-300 text-sm font-semibold rounded-lg self-end py-2 px-4 mt-5">Limpiar Filtros</button>
                </div>
            </div>
        `;
    }

    /**
     * Configura los event listeners para los filtros.
     */
    function setupFiltros(containerId) {
        _populateDropdown('sectores', 'filter-sector', 'Sector');

        const searchInput = document.getElementById('search-input');
        const sectorFilter = document.getElementById('filter-sector');
        const clearBtn = document.getElementById('clear-filters-btn');

        const applyFilters = () => renderClientesList(containerId);

        searchInput.addEventListener('input', applyFilters);
        sectorFilter.addEventListener('change', applyFilters);
        
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            sectorFilter.value = '';
            applyFilters();
        });
    }

    /**
     * Renderiza la lista de clientes en una tabla.
     */
    function renderClientesList(elementId, readOnly = false, externalSearchTerm = null) {
        const container = document.getElementById(elementId);
        if (!container) return;

        if (_clientesCache.length === 0) {
            container.innerHTML = `<p class="text-gray-500 text-center">Cargando clientes...</p>`;
            return;
        }

        const searchTerm = externalSearchTerm !== null ? externalSearchTerm.toLowerCase() : (document.getElementById('search-input')?.value.toLowerCase() || '');
        const sectorFilter = document.getElementById('filter-sector')?.value || '';

        const filteredClients = _clientesCache.filter(cliente => {
            const searchMatch = !searchTerm ||
                cliente.nombreComercial.toLowerCase().includes(searchTerm) ||
                (cliente.nombrePersonal && cliente.nombrePersonal.toLowerCase().includes(searchTerm)) ||
                (cliente.codigoCEP && cliente.codigoCEP.toLowerCase().includes(searchTerm));
            
            const sectorMatch = !sectorFilter || cliente.sector === sectorFilter;
            
            return searchMatch && sectorMatch;
        });
        
        if (filteredClients.length === 0) {
            container.innerHTML = `<p class="text-gray-500 text-center">No hay clientes que coincidan con la búsqueda.</p>`;
            return;
        }

        let tableHTML = `
            <table class="min-w-full bg-white border border-gray-200">
                <thead class="bg-gray-200 sticky top-0">
                    <tr>
                        <th class="py-2 px-4 border-b text-left text-sm">N. Comercial</th>
                        <th class="py-2 px-4 border-b text-left text-sm">N. Personal</th>
                        ${readOnly ? '<th class="py-2 px-4 border-b text-left text-sm">Sector</th>' : ''}
                        <th class="py-2 px-4 border-b text-left text-sm">Teléfono</th>
                        ${readOnly ? '<th class="py-2 px-4 border-b text-left text-sm">Código CEP</th>' : ''}
                        ${!readOnly ? `<th class="py-2 px-4 border-b text-center text-sm">Acciones</th>` : ''}
                    </tr>
                </thead>
                <tbody>
        `;
        filteredClients.forEach(cliente => {
            tableHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="py-2 px-4 border-b text-sm">${cliente.nombreComercial}</td>
                    <td class="py-2 px-4 border-b text-sm">${cliente.nombrePersonal}</td>
                    ${readOnly ? `<td class="py-2 px-4 border-b text-sm">${cliente.sector}</td>` : ''}
                    <td class="py-2 px-4 border-b text-sm">${cliente.telefono}</td>
                    ${readOnly ? `<td class="py-2 px-4 border-b text-sm">${cliente.codigoCEP || 'N/A'}</td>` : ''}
                    ${!readOnly ? `
                    <td class="py-2 px-4 border-b text-center space-x-2">
                        <button onclick="window.clientesModule.editCliente('${cliente.id}')" class="px-3 py-1 bg-yellow-500 text-white text-xs rounded-lg hover:bg-yellow-600">Editar</button>
                        <button onclick="window.clientesModule.deleteCliente('${cliente.id}')" class="px-3 py-1 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600">Eliminar</button>
                    </td>` : ''}
                </tr>
            `;
        });
        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    }
    
    /**
     * Muestra el formulario para editar un cliente.
     */
    function editCliente(clienteId) {
        _floatingControls.classList.add('hidden');
        const cliente = _clientesCache.find(c => c.id === clienteId);
        if (!cliente) return;

        _mainContent.innerHTML = `
            <div class="p-4">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">Editar Cliente</h2>
                        <form id="editClienteForm" class="space-y-4 text-left">
                            <div>
                                <label for="editSector" class="block text-gray-700 font-medium mb-2">Sector:</label>
                                <select id="editSector" class="w-full px-4 py-2 border rounded-lg" required>
                                </select>
                            </div>
                            <div>
                                <label for="editNombreComercial" class="block text-gray-700 font-medium mb-2">Nombre Comercial:</label>
                                <input type="text" id="editNombreComercial" value="${cliente.nombreComercial}" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="editNombrePersonal" class="block text-gray-700 font-medium mb-2">Nombre Personal:</label>
                                <input type="text" id="editNombrePersonal" value="${cliente.nombrePersonal}" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="editTelefono" class="block text-gray-700 font-medium mb-2">Teléfono:</label>
                                <input type="tel" id="editTelefono" value="${cliente.telefono}" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="editCodigoCEP" class="block text-gray-700 font-medium mb-2">Código CEP:</label>
                                <div class="flex items-center">
                                    <input type="text" id="editCodigoCEP" value="${cliente.codigoCEP || ''}" class="w-full px-4 py-2 border rounded-lg">
                                    <input type="checkbox" id="editCepNA" class="ml-4 h-5 w-5">
                                    <label for="editCepNA" class="ml-2 text-gray-700">No Aplica</label>
                                </div>
                            </div>
                            <button type="submit" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Guardar Cambios</button>
                        </form>
                        <button id="backToModifyDeleteClienteBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        _populateDropdown('sectores', 'editSector', 'sector', cliente.sector);

        const editCepInput = document.getElementById('editCodigoCEP');
        const editCepNACheckbox = document.getElementById('editCepNA');
        
        const syncEditCepState = () => {
            if (editCepInput.value.toLowerCase() === 'n/a') {
                editCepNACheckbox.checked = true;
                editCepInput.disabled = true;
            } else {
                editCepNACheckbox.checked = false;
                editCepInput.disabled = false;
            }
        };

        editCepNACheckbox.addEventListener('change', () => {
            if (editCepNACheckbox.checked) {
                editCepInput.value = 'N/A';
                editCepInput.disabled = true;
            } else {
                editCepInput.value = '';
                editCepInput.disabled = false;
                editCepInput.focus();
            }
        });
        syncEditCepState();

        document.getElementById('editClienteForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const updatedData = {
                sector: document.getElementById('editSector').value,
                nombreComercial: document.getElementById('editNombreComercial').value,
                nombrePersonal: document.getElementById('editNombrePersonal').value,
                telefono: document.getElementById('editTelefono').value,
                codigoCEP: document.getElementById('editCodigoCEP').value
            };
            try {
                await _setDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/clientes`, clienteId), updatedData, { merge: true });
                _showModal('Éxito', 'Cliente modificado exitosamente.');
                showModifyDeleteSearchView();
            } catch (error) {
                console.error("Error al modificar el cliente:", error);
                _showModal('Error', 'Hubo un error al modificar el cliente.');
            }
        });
        document.getElementById('backToModifyDeleteClienteBtn').addEventListener('click', showModifyDeleteSearchView);
    };

    /**
     * Elimina un cliente.
     */
    function deleteCliente(clienteId) {
        _showModal('Confirmar Eliminación', '¿Estás seguro de que deseas eliminar este cliente?', async () => {
            try {
                await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/clientes`, clienteId));
                _showModal('Éxito', 'Cliente eliminado correctamente.');
                const searchInput = document.getElementById('search-modify-input');
                if (searchInput) {
                    searchInput.dispatchEvent(new Event('input'));
                }
            } catch (error) {
                console.error("Error al eliminar el cliente:", error);
                _showModal('Error', 'Hubo un error al eliminar el cliente.');
            }
        });
    };

    // Exponer funciones públicas al objeto window
    window.clientesModule = {
        editCliente,
        deleteCliente
    };

})();
