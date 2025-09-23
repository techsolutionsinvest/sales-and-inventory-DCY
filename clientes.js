// --- Lógica del módulo de Clientes ---

(function() {
    // Variables locales del módulo
    let _db, _userId, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _getDocs, _writeBatch;
    
    let _clientesCache = []; // Caché en tiempo real de los clientes en Firestore
    let _clientesExtraidosPDF = []; // Almacena temporalmente los clientes leídos del PDF

    /**
     * Inicializa el módulo y sus dependencias.
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
        _populateDropdown = dependencies.populateDropdown;
        _collection = dependencies.collection;
        _onSnapshot = dependencies.onSnapshot;
        _doc = dependencies.doc;
        _addDoc = dependencies.addDoc;
        _setDoc = dependencies.setDoc;
        _deleteDoc = dependencies.deleteDoc;
        _getDocs = dependencies.getDocs;
        _writeBatch = dependencies.writeBatch;
        
        // Listener para mantener la caché de clientes actualizada
        const clientesRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/clientes`);
        _onSnapshot(clientesRef, (snapshot) => {
            _clientesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
    };

    /**
     * Muestra el submenú de gestión de clientes.
     */
    window.showClientesSubMenu = function() {
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Clientes</h1>
                        <div class="space-y-4">
                            <button id="verClientesBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600">Ver Clientes</button>
                            <button id="agregarClienteBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600">Agregar Cliente</button>
                            <button id="syncPDF" class="w-full px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700">Sincronizar Clientes desde PDF</button>
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver al Menú Principal</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('verClientesBtn').addEventListener('click', showVerClientesView);
        document.getElementById('agregarClienteBtn').addEventListener('click', showAgregarClienteView);
        document.getElementById('syncPDF').addEventListener('click', showSyncPDFView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }
    
    /**
     * Muestra la interfaz para subir el archivo PDF de clientes.
     */
    function showSyncPDFView() {
        _clientesExtraidosPDF = []; // Limpiar la lista cada vez que se entra a la vista
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Sincronizar Clientes desde PDF</h2>
                        <p class="text-gray-600 mb-6 max-w-lg mx-auto">Sube el archivo PDF de CXC para extraer la lista de clientes. Luego, podrás sincronizarlos con tu base de datos.</p>
                        
                        <div class="max-w-md mx-auto border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-teal-500 transition" id="pdf-dropzone">
                            <input type="file" id="pdf-file-input" class="hidden" accept=".pdf">
                            <p id="pdf-file-name" class="hidden font-semibold text-gray-700 mb-4"></p>
                            <svg id="pdf-upload-icon" class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                            <p id="pdf-upload-text" class="mt-4 text-gray-500"><span class="font-semibold text-teal-600">Haz clic para subir un archivo</span> o arrástralo aquí.</p>
                            <p class="text-xs text-gray-500 mt-2">Sólo archivos PDF</p>
                        </div>

                        <div id="sync-results-container" class="mt-6"></div>

                        <div class="mt-8 flex justify-center">
                            <button id="backToClientesBtn" class="w-full max-w-md px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const dropzone = document.getElementById('pdf-dropzone');
        const fileInput = document.getElementById('pdf-file-input');
        
        const handleFileSelect = (file) => {
            if (file && file.type === 'application/pdf') {
                document.getElementById('pdf-file-name').textContent = file.name;
                document.getElementById('pdf-file-name').classList.remove('hidden');
                document.getElementById('pdf-upload-icon').classList.add('hidden');
                document.getElementById('pdf-upload-text').classList.add('hidden');
                handlePDFExtraction(file);
            } else {
                _showModal('Error', 'Por favor, selecciona un archivo PDF válido.');
            }
        };

        dropzone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
        
        ['dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); });
        });
        dropzone.addEventListener('dragover', () => dropzone.classList.add('border-teal-500', 'bg-teal-50'));
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('border-teal-500', 'bg-teal-50'));
        dropzone.addEventListener('drop', (e) => {
            dropzone.classList.remove('border-teal-500', 'bg-teal-50');
            handleFileSelect(e.dataTransfer.files[0]);
        });

        document.getElementById('backToClientesBtn').addEventListener('click', showClientesSubMenu);
    }

    /**
     * Lee el archivo PDF y extrae su contenido de texto.
     */
    async function handlePDFExtraction(file) {
        const syncResultsContainer = document.getElementById('sync-results-container');
        syncResultsContainer.innerHTML = `<p class="text-blue-500">Leyendo y procesando el archivo PDF...</p>`;
        
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
                
                parseAndDisplayClients(fullText);
            };
            fileReader.readAsArrayBuffer(file);
        } catch (error) {
            syncResultsContainer.innerHTML = `<p class="text-red-500">Error al procesar el PDF: ${error.message}</p>`;
        }
    }
    
    /**
     * Analiza el texto del PDF, extrae los clientes y muestra una tabla de confirmación.
     */
    function parseAndDisplayClients(text) {
        const syncResultsContainer = document.getElementById('sync-results-container');
        syncResultsContainer.innerHTML = `<p class="text-blue-500">Analizando clientes en el documento...</p>`;

        const summaryStart = text.indexOf("RAZON SOCIAL");
        const summaryEnd = text.indexOf("SUB TOTAL");

        if (summaryStart === -1 || summaryEnd === -1) {
            syncResultsContainer.innerHTML = `<p class="text-red-500">Análisis fallido. No se pudo encontrar la tabla de resumen en el PDF.</p>`;
            return;
        }

        const summaryText = text.substring(summaryStart, summaryEnd);
        const lines = summaryText.split('\n');
        const pdfClients = new Map();
        
        const lineRegex = /^\s*\d+\s+(.+?)\s+(WILLI|MENOR|ROBERTO|ROBERTO WIL)\s+\d{1,2}\/\d{1,2}\/\d{4}/;

        for (const line of lines) {
            const match = line.match(lineRegex);
            if (match) {
                let nameBlock = match[1].replace(/\s+[\d,.-]+\s*$/, '').trim(); // Eliminar la columna de deuda del final

                let commercialName = nameBlock;
                let personalName = '';

                const nameParts = commercialName.split(/\s{2,}/);
                if (nameParts.length > 1 && nameParts[0].trim().length > 3) {
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
        }
        
        _clientesExtraidosPDF = Array.from(pdfClients.values());

        if (_clientesExtraidosPDF.length === 0) {
            syncResultsContainer.innerHTML = `<p class="text-yellow-500">Análisis completo. No se encontraron clientes con el formato esperado en el archivo.</p>`;
            return;
        }

        let tableHTML = `
            <h3 class="text-xl font-bold text-gray-800 mb-4">Clientes Encontrados en el PDF</h3>
            <div class="overflow-y-auto max-h-60 border rounded-lg">
                <table class="min-w-full bg-white text-sm">
                    <thead class="bg-gray-100 sticky top-0"><tr><th class="py-2 px-3 text-left">Nombre Comercial</th><th class="py-2 px-3 text-left">Nombre Personal</th></tr></thead>
                    <tbody>
                        ${_clientesExtraidosPDF.map(c => `<tr class="border-b"><td class="py-2 px-3">${c.nombreComercial}</td><td class="py-2 px-3">${c.nombrePersonal}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="mt-6">
                 <button id="confirmSyncBtn" class="w-full max-w-md px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700">Sincronizar ${_clientesExtraidosPDF.length} Clientes</button>
            </div>`;
        syncResultsContainer.innerHTML = tableHTML;
        document.getElementById('confirmSyncBtn').addEventListener('click', executeClientSync);
    }
    
    /**
     * Guarda los clientes nuevos en Firestore.
     */
    async function executeClientSync() {
        if (_clientesExtraidosPDF.length === 0) {
            _showModal('Error', 'No hay clientes para sincronizar.');
            return;
        }

        const existingNames = new Set(_clientesCache.map(c => c.nombreComercial.toLowerCase()));
        const newClients = _clientesExtraidosPDF.filter(pdfClient => !existingNames.has(pdfClient.nombreComercial.toLowerCase()));

        if (newClients.length === 0) {
            _showModal('Sin Novedades', 'Todos los clientes del archivo PDF ya existen en la base de datos.');
            return;
        }

        _showModal('Confirmar Sincronización', `
            <p>Se encontraron ${newClients.length} clientes nuevos. ¿Deseas agregarlos a tu base de datos?</p>
            <p class="text-xs text-gray-500 mt-2">(Los clientes existentes no serán modificados)</p>`, 
            async () => {
                _showModal('Progreso', `Agregando ${newClients.length} clientes...`);
                try {
                    const batch = _writeBatch(_db);
                    const clientesRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/clientes`);

                    for (const client of newClients) {
                        const newClientRef = _doc(clientesRef);
                        batch.set(newClientRef, {
                            nombreComercial: client.nombreComercial,
                            nombrePersonal: client.nombrePersonal,
                            sector: '',
                            telefono: '',
                            codigoCEP: ''
                        });
                    }

                    await batch.commit();
                    _showModal('Éxito', `${newClients.length} clientes nuevos han sido agregados.`);
                    showClientesSubMenu();
                } catch (error) {
                    _showModal('Error', `Ocurrió un error al guardar: ${error.message}`);
                }
            }, 'Sí, Sincronizar');
    }

    /**
     * Muestra el formulario para agregar un nuevo cliente manualmente.
     */
    function showAgregarClienteView() {
         _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto"><div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                <h2 class="text-2xl font-bold text-gray-800 mb-6">Agregar Cliente</h2>
                <form id="clienteForm" class="space-y-4 text-left">
                    <div>
                        <label for="sector" class="block text-gray-700 font-medium mb-2">Sector:</label>
                        <div class="flex items-center space-x-2">
                            <select id="sector" class="w-full px-4 py-2 border rounded-lg" required></select>
                            <button type="button" onclick="window.initClientes.showAddItemModal('sectores', 'Sector')" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500">Agregar</button>
                        </div>
                    </div>
                    <div><label for="nombreComercial" class="block text-gray-700 font-medium mb-2">Nombre Comercial:</label><input type="text" id="nombreComercial" class="w-full px-4 py-2 border rounded-lg" required></div>
                    <div><label for="nombrePersonal" class="block text-gray-700 font-medium mb-2">Nombre Personal:</label><input type="text" id="nombrePersonal" class="w-full px-4 py-2 border rounded-lg"></div>
                    <div><label for="telefono" class="block text-gray-700 font-medium mb-2">Teléfono:</label><input type="tel" id="telefono" class="w-full px-4 py-2 border rounded-lg"></div>
                    <div><label for="codigoCEP" class="block text-gray-700 font-medium mb-2">Código CEP:</label><input type="text" id="codigoCEP" class="w-full px-4 py-2 border rounded-lg"></div>
                    <button type="submit" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Guardar Cliente</button>
                </form>
                <button id="backToClientesBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
            </div></div></div>`;
        _populateDropdown('sectores', 'sector', 'Sector');
        document.getElementById('clienteForm').addEventListener('submit', agregarCliente);
        document.getElementById('backToClientesBtn').addEventListener('click', showClientesSubMenu);
    }

    /**
     * Guarda un nuevo cliente en Firestore.
     */
    async function agregarCliente(e) {
        e.preventDefault();
        const form = e.target;
        const nombreComercial = form.nombreComercial.value.trim();
        if (_clientesCache.find(c => c.nombreComercial.toLowerCase() === nombreComercial.toLowerCase())) {
            _showModal('Cliente Duplicado', `Ya existe un cliente con el nombre comercial "${nombreComercial}".`);
            return;
        }
        try {
            await _addDoc(_collection(_db, `artifacts/${_appId}/users/${_userId}/clientes`), {
                sector: form.sector.value,
                nombreComercial: nombreComercial,
                nombrePersonal: form.nombrePersonal.value.trim(),
                telefono: form.telefono.value.trim(),
                codigoCEP: form.codigoCEP.value.trim()
            });
            _showModal('Éxito', 'Cliente agregado correctamente.');
            form.reset();
        } catch (error) {
            _showModal('Error', 'Hubo un error al guardar el cliente.');
        }
    }

    /**
     * Muestra la lista de todos los clientes con opciones de búsqueda y filtro.
     */
    function showVerClientesView() {
        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto"><div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Lista de Clientes</h2>
                <div id="clientes-filters" class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4"></div>
                <div id="clientesListContainer" class="overflow-y-auto max-h-96"></div>
                <button id="backToClientesBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
            </div></div></div>`;
        
        const filtersContainer = document.getElementById('clientes-filters');
        filtersContainer.innerHTML = `<input type="text" id="search-input" placeholder="Buscar por nombre..." class="w-full px-4 py-2 border rounded-lg">`;
        
        const renderList = () => {
            const searchTerm = document.getElementById('search-input').value.toLowerCase();
            const filtered = _clientesCache.filter(c => c.nombreComercial.toLowerCase().includes(searchTerm) || (c.nombrePersonal && c.nombrePersonal.toLowerCase().includes(searchTerm)));
            renderClientesTable('clientesListContainer', filtered);
        };
        
        document.getElementById('search-input').addEventListener('input', renderList);
        document.getElementById('backToClientesBtn').addEventListener('click', showClientesSubMenu);
        renderList();
    }
    
    /**
     * Renderiza una tabla con la lista de clientes.
     */
    function renderClientesTable(containerId, clientes) {
        const container = document.getElementById(containerId);
        if (clientes.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">No se encontraron clientes.</p>`;
            return;
        }
        container.innerHTML = `
            <table class="min-w-full bg-white text-sm"><thead class="bg-gray-100"><tr>
                <th class="py-2 px-3 text-left">N. Comercial</th><th class="py-2 px-3 text-left">N. Personal</th>
                <th class="py-2 px-3 text-left">Sector</th><th class="py-2 px-3 text-center">Acciones</th>
            </tr></thead><tbody>
            ${clientes.map(cliente => `
                <tr class="border-b"><td class="py-2 px-3">${cliente.nombreComercial}</td>
                    <td class="py-2 px-3">${cliente.nombrePersonal || ''}</td>
                    <td class="py-2 px-3">${cliente.sector || ''}</td>
                    <td class="py-2 px-3 text-center">
                        <button onclick="window.clientesModule.editCliente('${cliente.id}')" class="px-2 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600">Editar</button>
                        <button onclick="window.clientesModule.deleteCliente('${cliente.id}')" class="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">Eliminar</button>
                    </td>
                </tr>`).join('')}
            </tbody></table>`;
    }

    /**
     * Muestra el formulario para editar un cliente.
     */
    function editCliente(clienteId) {
        const cliente = _clientesCache.find(c => c.id === clienteId);
        if (!cliente) return;

        _mainContent.innerHTML = `
            <div class="p-4 pt-8"><div class="container mx-auto"><div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                <h2 class="text-2xl font-bold text-gray-800 mb-6">Editar Cliente</h2>
                <form id="editClienteForm" class="space-y-4 text-left">
                    <div><label class="block">Sector:</label><select id="editSector" class="w-full px-4 py-2 border rounded-lg"></select></div>
                    <div><label class="block">Nombre Comercial:</label><input type="text" id="editNombreComercial" value="${cliente.nombreComercial}" class="w-full px-4 py-2 border rounded-lg" required></div>
                    <div><label class="block">Nombre Personal:</label><input type="text" id="editNombrePersonal" value="${cliente.nombrePersonal || ''}" class="w-full px-4 py-2 border rounded-lg"></div>
                    <div><label class="block">Teléfono:</label><input type="tel" id="editTelefono" value="${cliente.telefono || ''}" class="w-full px-4 py-2 border rounded-lg"></div>
                    <div><label class="block">Código CEP:</label><input type="text" id="editCodigoCEP" value="${cliente.codigoCEP || ''}" class="w-full px-4 py-2 border rounded-lg"></div>
                    <button type="submit" class="w-full px-6 py-3 bg-blue-500 text-white rounded-lg">Guardar Cambios</button>
                </form>
                <button id="backToClientesBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white rounded-lg">Volver</button>
            </div></div></div>`;
        
        _populateDropdown('sectores', 'editSector', 'Sector');
        setTimeout(() => { document.getElementById('editSector').value = cliente.sector; }, 200);

        document.getElementById('editClienteForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await _setDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/clientes`, clienteId), {
                    sector: document.getElementById('editSector').value,
                    nombreComercial: document.getElementById('editNombreComercial').value.trim(),
                    nombrePersonal: document.getElementById('editNombrePersonal').value.trim(),
                    telefono: document.getElementById('editTelefono').value.trim(),
                    codigoCEP: document.getElementById('editCodigoCEP').value.trim()
                }, { merge: true });
                _showModal('Éxito', 'Cliente modificado.');
                showVerClientesView();
            } catch (error) {
                _showModal('Error', 'No se pudo modificar el cliente.');
            }
        });
        document.getElementById('backToClientesBtn').addEventListener('click', showVerClientesView);
    };

    /**
     * Elimina un cliente.
     */
    function deleteCliente(clienteId) {
        _showModal('Confirmar Eliminación', '¿Estás seguro de que deseas eliminar este cliente?', async () => {
            try {
                await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/clientes`, clienteId));
                _showModal('Éxito', 'Cliente eliminado.');
                showVerClientesView();
            } catch (error) {
                _showModal('Error', 'No se pudo eliminar el cliente.');
            }
        });
    };
    
    // Adjuntar funciones al objeto window para que sean accesibles desde el HTML
    window.clientesModule = {
        editCliente,
        deleteCliente
    };

})();


