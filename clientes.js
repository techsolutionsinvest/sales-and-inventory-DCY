/**
 * Clientes.js
 * This module handles all functionality related to customer management,
 * including adding, viewing, filtering, and importing customers from a structured Excel/CSV file.
 */

// This variable will hold the dependencies (db, userId, etc.) passed from index.html
let dependencies;

// These variables store the client list and sectors to avoid re-fetching from Firestore on every filter action.
let allClients = [];
let allSectors = [];

/**
 * Initializes the Clientes module.
 * @param {object} deps - An object containing all required dependencies.
 */
window.initClientes = function(deps) {
    dependencies = deps;
};

/**
 * Displays the main submenu for the customer management section.
 */
window.showClientesSubMenu = function() {
    dependencies.mainContent.innerHTML = `
        <div class="p-4 pt-8 animate-fade-in">
            <div class="container mx-auto">
                <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                    <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Clientes</h1>
                    <div class="space-y-4">
                        <button id="addClienteBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 transition-transform transform hover:scale-105">Agregar Cliente Manualmente</button>
                        <button id="viewClientesBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition-transform transform hover:scale-105">Ver / Editar Clientes</button>
                        <button id="importClientesBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600 transition-transform transform hover:scale-105">Importar Clientes desde Archivo</button>
                        <button id="backToMainMenuBtn" class="mt-4 w-full px-6 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition-transform transform hover:scale-105">Volver al Menú</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Attach event listeners
    document.getElementById('addClienteBtn').addEventListener('click', showAgregarClienteForm);
    document.getElementById('viewClientesBtn').addEventListener('click', showVerEditarClientes);
    document.getElementById('importClientesBtn').addEventListener('click', showImportarClientesView);
    document.getElementById('backToMainMenuBtn').addEventListener('click', dependencies.showMainMenu);
};

/**
 * Fetches all customer data from Firestore and renders the main list view with search and filter controls.
 */
async function showVerEditarClientes() {
    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Cargando clientes...</h2></div>`;
    
    try {
        const collectionRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`);
        const snapshot = await dependencies.getDocs(collectionRef);
        
        allClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Get unique sectors for the filter dropdown
        const sectors = new Set(allClients.map(c => c.sector).filter(Boolean));
        allSectors = [...sectors].sort((a, b) => a.localeCompare(b));

        // Initial render of the view with controls and table
        renderClientListView();
        
    } catch (error) {
        console.error("Error fetching customers: ", error);
        dependencies.showModal('Error', `No se pudieron cargar los clientes: ${error.message}`);
    }
}

/**
 * Renders the HTML structure for the "Ver / Editar Clientes" page, including filters.
 */
function renderClientListView() {
    let sectorOptions = allSectors.map(sector => `<option value="${sector}">${sector}</option>`).join('');

    let html = `
        <div class="p-4 animate-fade-in">
            <div class="container mx-auto">
                <div class="bg-white/90 p-6 md:p-8 rounded-lg shadow-xl">
                    <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                        <h2 class="text-2xl font-bold text-gray-800">Ver / Editar Clientes</h2>
                        <button id="backToClientesMenu" class="w-full md:w-auto px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>

                    <!-- Search and Filter Controls -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <input type="text" id="searchInput" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Buscar por Nombre o CEP...">
                        <select id="sectorFilter" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            <option value="">Todos los Sectores</option>
                            ${sectorOptions}
                        </select>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="min-w-full bg-transparent">
                            <thead class="bg-gray-200/80">
                                <tr>
                                    <th class="py-3 px-4 border-b text-left text-sm font-bold text-gray-600">Nombre Comercial</th>
                                    <th class="py-3 px-4 border-b text-left text-sm font-bold text-gray-600">Nombre Personal</th>
                                    <th class="py-3 px-4 border-b text-left text-sm font-bold text-gray-600 hidden md:table-cell">Sector</th>
                                </tr>
                            </thead>
                            <tbody id="client-table-body">
                                <!-- Client rows will be inserted here by JavaScript -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    dependencies.mainContent.innerHTML = html;

    // Populate the table with all clients initially
    renderClientTableRows(allClients);
    
    // Add event listeners for filtering
    document.getElementById('backToClientesMenu').addEventListener('click', window.showClientesSubMenu);
    document.getElementById('searchInput').addEventListener('input', filterClients);
    document.getElementById('sectorFilter').addEventListener('change', filterClients);
}

/**
 * Renders the rows of the client table based on a provided array of clients.
 * @param {Array<Object>} clients - The array of client objects to display.
 */
function renderClientTableRows(clients) {
    const tableBody = document.getElementById('client-table-body');
    if (!tableBody) return;

    let rowsHtml = '';
    if (clients.length === 0) {
        rowsHtml = `<tr><td colspan="3" class="text-center py-6 text-gray-500">No se encontraron clientes con los filtros aplicados.</td></tr>`;
    } else {
        // Sort clients by commercial name before rendering
        clients.sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial));
        clients.forEach(cliente => {
            rowsHtml += `
                <tr class="hover:bg-gray-100/80">
                    <td class="py-3 px-4 border-b border-gray-200 font-medium text-gray-800">${cliente.nombreComercial}</td>
                    <td class="py-3 px-4 border-b border-gray-200 text-gray-600">${cliente.nombrePersonal || '-'}</td>
                    <td class="py-3 px-4 border-b border-gray-200 text-gray-600 hidden md:table-cell">${cliente.sector || '-'}</td>
                </tr>
            `;
        });
    }
    tableBody.innerHTML = rowsHtml;
}

/**
 * Filters the global `allClients` list based on search and sector inputs and re-renders the table.
 */
function filterClients() {
    const searchTerm = document.getElementById('searchInput').value.toUpperCase();
    const selectedSector = document.getElementById('sectorFilter').value;

    const filtered = allClients.filter(client => {
        const matchesSearch = searchTerm === '' ||
            (client.nombreComercial && client.nombreComercial.toUpperCase().includes(searchTerm)) ||
            (client.nombrePersonal && client.nombrePersonal.toUpperCase().includes(searchTerm)) ||
            (client.codigoCep && client.codigoCep.toUpperCase().includes(searchTerm));

        const matchesSector = selectedSector === '' || client.sector === selectedSector;

        return matchesSearch && matchesSector;
    });

    renderClientTableRows(filtered);
}


/**
 * Displays the form for adding a new customer, with a dynamic dropdown for sectors.
 */
async function showAgregarClienteForm() {
    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Cargando...</h2></div>`;

    let sectorOptionsHtml = '';
    try {
        const sectorsRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/sectores`);
        const snapshot = await dependencies.getDocs(sectorsRef);
        const sectors = snapshot.docs.map(doc => doc.data().name).sort((a, b) => a.localeCompare(b));
        sectorOptionsHtml = sectors.map(sector => `<option value="${sector}">${sector}</option>`).join('');
    } catch (e) {
        console.error("Could not fetch sectors", e);
    }

    dependencies.mainContent.innerHTML = `
        <div class="p-4 animate-fade-in">
            <div class="container mx-auto max-w-2xl">
                <div class="bg-white/90 p-8 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-bold mb-6 text-center">Agregar Nuevo Cliente</h2>
                    <form id="clienteForm" class="space-y-4">
                        <input type="text" id="nombreComercial" placeholder="Nombre Comercial (Requerido)" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500" required>
                        <input type="text" id="nombrePersonal" placeholder="Nombre Personal" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                        <input type="tel" id="telefono" placeholder="Teléfono" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                        
                        <div>
                            <label for="sector" class="block text-sm font-medium text-gray-700 mb-1">Sector</label>
                            <div class="flex items-center gap-2">
                                <select id="sector" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seleccione un sector...</option>
                                    ${sectorOptionsHtml}
                                </select>
                                <button type="button" id="addSectorBtn" class="flex-shrink-0 p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xl font-bold leading-none">+</button>
                            </div>
                        </div>

                        <div>
                             <label for="codigoCep" class="block text-sm font-medium text-gray-700 mb-1">Código CEP</label>
                             <div class="flex items-center gap-2">
                                <input type="text" id="codigoCep" placeholder="Código CEP" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                                <div class="flex items-center">
                                    <input id="cepNA" type="checkbox" class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                    <label for="cepNA" class="ml-2 block text-sm text-gray-900">N/A</label>
                                </div>
                             </div>
                        </div>

                        <div class="flex justify-between items-center pt-4">
                            <button type="button" id="cancelAddCliente" class="px-6 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Cancelar</button>
                            <button type="submit" class="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Guardar Cliente</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // Event Listeners for the new functionality
    document.getElementById('cancelAddCliente').addEventListener('click', window.showClientesSubMenu);
    document.getElementById('addSectorBtn').addEventListener('click', showAddSectorModal);

    const cepInput = document.getElementById('codigoCep');
    const cepNACheckbox = document.getElementById('cepNA');
    cepNACheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            cepInput.value = 'N/A';
            cepInput.disabled = true;
            cepInput.classList.add('bg-gray-200');
        } else {
            cepInput.value = '';
            cepInput.disabled = false;
            cepInput.classList.remove('bg-gray-200');
        }
    });

    document.getElementById('clienteForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nuevoCliente = {
            nombreComercial: document.getElementById('nombreComercial').value.trim(),
            nombrePersonal: document.getElementById('nombrePersonal').value.trim(),
            telefono: document.getElementById('telefono').value.trim(),
            sector: document.getElementById('sector').value,
            codigoCep: document.getElementById('codigoCep').value.trim(),
            createdAt: new Date()
        };
        if (!nuevoCliente.nombreComercial) {
            dependencies.showModal('Error', 'El Nombre Comercial es obligatorio.');
            return;
        }
        try {
            const collectionRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`);
            await dependencies.addDoc(collectionRef, nuevoCliente);
            dependencies.showModal('Éxito', 'Cliente agregado correctamente.', showVerEditarClientes);
        } catch (error) {
            console.error("Error adding customer: ", error);
            dependencies.showModal('Error', `No se pudo agregar el cliente: ${error.message}`);
        }
    });
}

/**
 * Shows a modal to add a new sector to the database.
 * On success, it refreshes the add customer form to show the new sector in the dropdown.
 */
function showAddSectorModal() {
    dependencies.modalContent.innerHTML = `
        <h3 class="text-xl font-bold text-gray-800 mb-4">Agregar Nuevo Sector</h3>
        <form id="addSectorForm">
            <input type="text" id="newSectorName" placeholder="Nombre del Sector" class="w-full p-3 border rounded-lg" required>
            <div class="flex justify-end gap-4 mt-6">
                <button type="button" id="closeModalBtn" class="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400">Cerrar</button>
                <button type="submit" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Guardar</button>
            </div>
        </form>
    `;
    dependencies.modalContainer.classList.remove('hidden');

    document.getElementById('closeModalBtn').addEventListener('click', () => dependencies.modalContainer.classList.add('hidden'));

    document.getElementById('addSectorForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('newSectorName').value.trim();
        if (newName) {
            try {
                const sectorsRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/sectores`);
                await dependencies.addDoc(sectorsRef, { name: newName });
                dependencies.modalContainer.classList.add('hidden');
                // Refresh the form to show the new sector in the dropdown
                await showAgregarClienteForm();
            } catch (err) {
                console.error("Error adding sector:", err);
            }
        }
    });
}

// --- IMPORT FUNCTIONS ---

/**
 * Displays the view for importing customers from a file.
 */
function showImportarClientesView() {
    const message = `
        <div class="p-4 animate-fade-in">
            <div class="container mx-auto max-w-2xl">
                <div class="bg-white/90 p-8 rounded-lg shadow-xl text-center">
                    <h2 class="text-2xl font-bold mb-4 text-gray-800">Importar Clientes</h2>
                    <p class="mb-6 text-gray-600">Selecciona un archivo Excel (.xlsx) o CSV. La aplicación leerá los datos para agregar nuevos clientes.</p>
                    <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:bg-gray-50 transition-colors">
                        <input type="file" id="fileUploader" class="hidden" accept=".xlsx, .xls, .csv">
                        <label for="fileUploader" class="cursor-pointer flex flex-col items-center">
                            <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                            <span class="mt-2 text-sm font-medium text-blue-600">Haz clic para seleccionar un archivo</span>
                        </label>
                    </div>
                     <p id="fileName" class="mt-4 text-sm text-gray-500 h-5"></p>
                    <button id="cancelImport" class="mt-6 px-6 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    dependencies.mainContent.innerHTML = message;
    document.getElementById('cancelImport').addEventListener('click', window.showClientesSubMenu);
    
    document.getElementById('fileUploader').addEventListener('change', handleFileUpload);
}

/**
 * Handles the file upload and parsing process using SheetJS.
 * @param {Event} event - The file input change event.
 */
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('fileName').textContent = `Archivo seleccionado: ${file.name}`;
    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Procesando archivo...</h2></div>`;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            await procesarYGuardarClientes(rows);
        } catch (error) {
            console.error("Error processing file: ", error);
            dependencies.showModal('Error al Procesar', `No se pudo leer el archivo. Asegúrate de que sea un formato Excel/CSV válido. Error: ${error.message}`);
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Processes the extracted rows, checks for duplicates, and saves new customers to Firestore.
 * This version reads data by column index and does NOT import Codigo CEP.
 * @param {Array<Array<any>>} rows - Array of rows from the parsed file.
 */
async function procesarYGuardarClientes(rows) {
    if (!rows || rows.length === 0) {
        dependencies.showModal('Archivo Vacío', 'El archivo no contiene datos.', window.showClientesSubMenu);
        return;
    }
    
    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Verificando clientes y guardando...</h2></div>`;

    const collectionRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`);
    const snapshot = await dependencies.getDocs(collectionRef);
    const clientesExistentes = new Set(snapshot.docs.map(doc => doc.data().nombreComercial.trim().toUpperCase()));

    const batch = dependencies.writeBatch(dependencies.db);
    let clientesNuevosContador = 0;

    rows.forEach(row => {
        const isClientRow = !isNaN(parseInt(row[0])) && typeof row[1] === 'string' && row[1].trim() !== '';

        if (isClientRow) {
            const nombreComercial = String(row[1]).trim();
            const nombrePersonalRaw = row[3];
            const nombrePersonal = (typeof nombrePersonalRaw === 'string' && nombrePersonalRaw.trim() !== '0') ? nombrePersonalRaw.trim() : '';
            
            if (nombreComercial && !clientesExistentes.has(nombreComercial.toUpperCase())) {
                const nuevoCliente = {
                    nombreComercial: nombreComercial,
                    nombrePersonal: nombrePersonal,
                    telefono: '',
                    sector: '',
                    codigoCep: '', // Does not import CEP from the file
                    createdAt: new Date()
                };
                const nuevoDocRef = dependencies.doc(collectionRef);
                batch.set(nuevoDocRef, nuevoCliente);
                clientesExistentes.add(nombreComercial.toUpperCase());
                clientesNuevosContador++;
            }
        }
    });

    if (clientesNuevosContador > 0) {
        await batch.commit();
    }

    dependencies.showModal('Sincronización Completa', `Se analizaron ${rows.length} filas del archivo.<br><strong>${clientesNuevosContador} clientes nuevos</strong> fueron importados.`, showVerEditarClientes);
}


