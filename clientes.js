/**
 * Clientes.js
 * This module handles all functionality related to customer management,
 * including adding, viewing, filtering, editing, deleting, and importing customers.
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
    dependencies.floatingControls.classList.add('hidden'); // Oculta los controles al entrar a este menú
    dependencies.mainContent.innerHTML = `
        <div class="p-4 pt-8 animate-fade-in">
            <div class="container mx-auto">
                <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                    <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Clientes</h1>
                    <div class="space-y-4">
                        <button id="addClienteBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 transition-transform transform hover:scale-105">Agregar Cliente Manualmente</button>
                        <button id="viewClientesBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition-transform transform hover:scale-105">Ver / Editar Clientes</button>
                        <button id="importClientesBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600 transition-transform transform hover:scale-105">Importar Clientes desde Archivo</button>
                        <button id="edicionMasivaBtn" class="w-full px-6 py-3 bg-yellow-600 text-white font-semibold rounded-lg shadow-md hover:bg-yellow-700 transition-transform transform hover:scale-105">Edición Masiva de Clientes</button>
                        <button id="backToMainMenuBtn" class="mt-4 w-full px-6 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition-transform transform hover:scale-105">Volver al Menú</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Attach event listeners
    document.getElementById('addClienteBtn').addEventListener('click', () => showClienteForm(null, window.showClientesSubMenu));
    document.getElementById('viewClientesBtn').addEventListener('click', showVerEditarClientes);
    document.getElementById('importClientesBtn').addEventListener('click', showImportarClientesView);
    document.getElementById('edicionMasivaBtn').addEventListener('click', showEdicionMasivaView);
    document.getElementById('backToMainMenuBtn').addEventListener('click', dependencies.showMainMenu);
};

/**
 * Fetches all customer and sector data from Firestore and renders the main list view.
 */
async function showVerEditarClientes() {
    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Cargando clientes...</h2></div>`;
    
    try {
        const clientsRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`);
        const sectorsRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/sectores`);

        const [clientSnapshot, sectorSnapshot] = await Promise.all([
            dependencies.getDocs(clientsRef),
            dependencies.getDocs(sectorsRef)
        ]);
        
        allClients = clientSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allSectors = sectorSnapshot.docs.map(doc => doc.data().name).sort((a, b) => a.localeCompare(b));

        renderClientListView();
        
    } catch (error) {
        console.error("Error fetching data: ", error);
        dependencies.showModal('Error', `No se pudieron cargar los datos: ${error.message}`);
    }
}

/**
 * Renders the HTML structure for the "Ver / Editar Clientes" page.
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
                                    <th class="py-3 px-4 border-b text-left text-sm font-bold text-gray-600 hidden md:table-cell">Teléfono</th>
                                    <th class="py-3 px-4 border-b text-left text-sm font-bold text-gray-600 hidden md:table-cell">Código CEP</th>
                                    <th class="py-3 px-4 border-b text-center text-sm font-bold text-gray-600">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="client-table-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    dependencies.mainContent.innerHTML = html;
    renderClientTableRows(allClients);
    
    document.getElementById('backToClientesMenu').addEventListener('click', window.showClientesSubMenu);
    document.getElementById('searchInput').addEventListener('input', filterClients);
    document.getElementById('sectorFilter').addEventListener('change', filterClients);
    document.getElementById('client-table-body').addEventListener('click', handleTableActions);
}

/**
 * Handles clicks on the action buttons (edit, delete) in the client table.
 */
function handleTableActions(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const action = button.dataset.action;
    const clientId = button.dataset.id;
    const clientName = button.dataset.name;

    if (action === 'edit') {
        showClienteForm(clientId, showVerEditarClientes); // Return to list after editing
    } else if (action === 'delete') {
        handleDeleteCliente(clientId, clientName);
    }
}

/**
 * Deletes a client after user confirmation.
 */
function handleDeleteCliente(clientId, clientName) {
    const confirmationMessage = `¿Estás seguro de que quieres eliminar a <strong>${clientName}</strong>? Esta acción no se puede deshacer.`;
    dependencies.showModal('Confirmar Eliminación', confirmationMessage, async () => {
        try {
            const clientDocRef = dependencies.doc(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`, clientId);
            await dependencies.deleteDoc(clientDocRef);
            dependencies.showModal('Éxito', `El cliente ${clientName} ha sido eliminado.`, showVerEditarClientes);
        } catch (error) {
            console.error("Error deleting client:", error);
            dependencies.showModal('Error', `No se pudo eliminar el cliente: ${error.message}`);
        }
    }, 'Eliminar');
}

/**
 * Renders the rows of the client table.
 */
function renderClientTableRows(clients) {
    const tableBody = document.getElementById('client-table-body');
    if (!tableBody) return;

    let rowsHtml = '';
    if (clients.length === 0) {
        rowsHtml = `<tr><td colspan="4" class="text-center py-6 text-gray-500">No se encontraron clientes.</td></tr>`;
    } else {
        clients.sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial));
        clients.forEach(cliente => {
            rowsHtml += `
                <tr class="hover:bg-gray-100/80">
                    <td class="py-3 px-4 border-b border-gray-200 font-medium text-gray-800">${cliente.nombreComercial}</td>
                    <td class="py-3 px-4 border-b border-gray-200 text-gray-600 hidden md:table-cell">${cliente.telefono || '-'}</td>
                    <td class="py-3 px-4 border-b border-gray-200 text-gray-600 hidden md:table-cell">${cliente.codigoCep || '-'}</td>
                    <td class="py-3 px-4 border-b border-gray-200 text-center">
                        <button data-action="edit" data-id="${cliente.id}" class="p-2 text-blue-600 hover:text-blue-800" title="Editar">
                            <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z"></path></svg>
                        </button>
                        <button data-action="delete" data-id="${cliente.id}" data-name="${cliente.nombreComercial}" class="p-2 text-red-600 hover:text-red-800" title="Eliminar">
                           <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    tableBody.innerHTML = rowsHtml;
}

/**
 * Filters the client list and re-renders the table.
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
 * Displays a form for adding or editing a customer.
 */
async function showClienteForm(clientId = null, onCancelCallback = window.showClientesSubMenu) {
    const isEditing = clientId !== null;
    let clientData = {};

    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Cargando...</h2></div>`;

    if (isEditing) {
        const docRef = dependencies.doc(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`, clientId);
        const docSnap = await dependencies.getDoc(docRef);
        clientData = docSnap.exists() ? docSnap.data() : {};
    }

    let sectorOptionsHtml = allSectors.map(sector => `<option value="${sector}" ${clientData.sector === sector ? 'selected' : ''}>${sector}</option>`).join('');

    dependencies.mainContent.innerHTML = `
        <div class="p-4 animate-fade-in"><div class="container mx-auto max-w-2xl"><div class="bg-white/90 p-8 rounded-lg shadow-xl">
            <h2 class="text-2xl font-bold mb-6 text-center">${isEditing ? 'Editar Cliente' : 'Agregar Nuevo Cliente'}</h2>
            <form id="clienteForm" class="space-y-4">
                <input type="text" id="nombreComercial" placeholder="Nombre Comercial (Requerido)" class="w-full p-3 border rounded-lg" value="${clientData.nombreComercial || ''}" required>
                <input type="text" id="nombrePersonal" placeholder="Nombre Personal" class="w-full p-3 border rounded-lg" value="${clientData.nombrePersonal || ''}">
                <input type="tel" id="telefono" placeholder="Teléfono" class="w-full p-3 border rounded-lg" value="${clientData.telefono || ''}">
                <div>
                    <label for="sector" class="block text-sm font-medium text-gray-700 mb-1">Sector</label>
                    <div class="flex items-center gap-2">
                        <select id="sector" class="w-full p-3 border rounded-lg"><option value="">Seleccione un sector...</option>${sectorOptionsHtml}</select>
                        <button type="button" id="addSectorBtn" class="flex-shrink-0 p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xl font-bold leading-none">+</button>
                    </div>
                </div>
                <div>
                     <label for="codigoCep" class="block text-sm font-medium text-gray-700 mb-1">Código CEP</label>
                     <div class="flex items-center gap-2">
                        <input type="text" id="codigoCep" placeholder="Código CEP" class="w-full p-3 border rounded-lg" value="${clientData.codigoCep || ''}">
                        <div class="flex items-center">
                            <input id="cepNA" type="checkbox" class="h-4 w-4 text-blue-600 border-gray-300 rounded"><label for="cepNA" class="ml-2 block text-sm text-gray-900">N/A</label>
                        </div>
                     </div>
                </div>
                <div class="flex justify-between items-center pt-4">
                    <button type="button" id="cancelForm" class="px-6 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Cancelar</button>
                    <button type="submit" class="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Guardar Cambios</button>
                </div>
            </form>
        </div></div></div>`;

    document.getElementById('cancelForm').addEventListener('click', onCancelCallback);
    document.getElementById('addSectorBtn').addEventListener('click', () => showAddSectorModal(clientId, onCancelCallback));

    const cepInput = document.getElementById('codigoCep');
    const cepNACheckbox = document.getElementById('cepNA');
    if (clientData.codigoCep === 'N/A') {
        cepNACheckbox.checked = true;
        cepInput.disabled = true;
        cepInput.classList.add('bg-gray-200');
    }
    cepNACheckbox.addEventListener('change', (e) => {
        cepInput.disabled = e.target.checked;
        cepInput.value = e.target.checked ? 'N/A' : '';
        cepInput.classList.toggle('bg-gray-200', e.target.checked);
    });

    document.getElementById('clienteForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const clientPayload = {
            nombreComercial: document.getElementById('nombreComercial').value.trim(),
            nombrePersonal: document.getElementById('nombrePersonal').value.trim(),
            telefono: document.getElementById('telefono').value.trim(),
            sector: document.getElementById('sector').value,
            codigoCep: document.getElementById('codigoCep').value.trim(),
        };
        if (!clientPayload.nombreComercial) {
            dependencies.showModal('Error', 'El Nombre Comercial es obligatorio.');
            return;
        }
        try {
            const successMessage = isEditing ? 'Cliente actualizado correctamente.' : 'Cliente agregado correctamente.';
            if (isEditing) {
                const docRef = dependencies.doc(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`, clientId);
                await dependencies.updateDoc(docRef, clientPayload);
            } else {
                clientPayload.createdAt = new Date();
                const collectionRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`);
                await dependencies.addDoc(collectionRef, clientPayload);
            }
            dependencies.showModal('Éxito', successMessage, showVerEditarClientes);
        } catch (error) {
            dependencies.showModal('Error', `No se pudo guardar el cliente: ${error.message}`);
        }
    });
}

/**
 * Shows a modal to add a new sector.
 */
function showAddSectorModal(clientId, onCancelCallback) {
    dependencies.modalContent.innerHTML = `
        <h3 class="text-xl font-bold text-gray-800 mb-4">Agregar Nuevo Sector</h3>
        <form id="addSectorForm"><input type="text" id="newSectorName" placeholder="Nombre del Sector" class="w-full p-3 border rounded-lg" required>
            <div class="flex justify-end gap-4 mt-6">
                <button type="button" id="closeModalBtn" class="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400">Cerrar</button>
                <button type="submit" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Guardar</button>
            </div>
        </form>`;
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
                allSectors.push(newName); // Update local cache
                allSectors.sort();
                await showClienteForm(clientId, onCancelCallback);
            } catch (err) { console.error("Error adding sector:", err); }
        }
    });
}


// --- BULK EDITING FUNCTIONS ---

/**
 * Displays the view for bulk editing/deleting customers.
 */
function showEdicionMasivaView() {
    dependencies.floatingControls.classList.add('hidden');
    let sectorOptions = allSectors.map(sector => `<option value="${sector}">${sector}</option>`).join('');
    dependencies.mainContent.innerHTML = `
        <div class="p-4 animate-fade-in"><div class="container mx-auto max-w-2xl"><div class="bg-white/90 p-8 rounded-lg shadow-xl">
            <h2 class="text-2xl font-bold mb-6 text-center">Edición Masiva de Clientes</h2>
            <div class="space-y-6">
                <!-- Delete by Sector -->
                <div class="border p-4 rounded-lg">
                    <h3 class="font-semibold text-lg mb-2">Eliminar Clientes por Sector</h3>
                    <div class="flex items-center gap-2">
                        <select id="sectorToDelete" class="w-full p-3 border rounded-lg"><option value="">Seleccione un sector...</option>${sectorOptions}</select>
                        <button id="deleteBySectorBtn" class="px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600">Eliminar</button>
                    </div>
                </div>
                <!-- Delete All -->
                <div class="border p-4 rounded-lg bg-red-50">
                    <h3 class="font-semibold text-lg mb-2 text-red-800">Eliminar Todos los Clientes</h3>
                    <p class="text-sm text-red-700 mb-4">Esta acción es irreversible y eliminará permanentemente a todos los clientes de su base de datos.</p>
                    <button id="deleteAllBtn" class="w-full px-6 py-3 bg-red-700 text-white font-bold rounded-lg shadow-md hover:bg-red-800">ELIMINAR TODO</button>
                </div>
            </div>
            <button id="backToClientesMenu" class="mt-8 w-full px-6 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
        </div></div></div>`;
    
    document.getElementById('backToClientesMenu').addEventListener('click', window.showClientesSubMenu);
    document.getElementById('deleteBySectorBtn').addEventListener('click', handleDeleteBySector);
    document.getElementById('deleteAllBtn').addEventListener('click', handleDeleteAll);
}

/**
 * Handles the logic for deleting all clients in a selected sector.
 */
async function handleDeleteBySector() {
    const sector = document.getElementById('sectorToDelete').value;
    if (!sector) {
        dependencies.showModal('Acción Requerida', 'Por favor, seleccione un sector para eliminar.');
        return;
    }
    
    const clientsInSector = allClients.filter(c => c.sector === sector);
    if (clientsInSector.length === 0) {
        dependencies.showModal('Información', `No se encontraron clientes en el sector "${sector}".`);
        return;
    }
    
    const message = `Se eliminarán <strong>${clientsInSector.length}</strong> clientes del sector "<strong>${sector}</strong>". ¿Estás seguro?`;
    dependencies.showModal('Confirmar Eliminación', message, async () => {
        const batch = dependencies.writeBatch(dependencies.db);
        clientsInSector.forEach(client => {
            const docRef = dependencies.doc(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`, client.id);
            batch.delete(docRef);
        });
        await batch.commit();
        dependencies.showModal('Éxito', `Se han eliminado los clientes del sector "${sector}".`, showVerEditarClientes);
    }, 'Eliminar');
}

/**
 * Handles the logic for deleting all clients.
 */
async function handleDeleteAll() {
    const message = `¡ADVERTENCIA! Estás a punto de eliminar a <strong>TODOS (${allClients.length})</strong> los clientes. Esta acción es irreversible. ¿Estás absolutamente seguro?`;
    dependencies.showModal('Confirmación Final', message, async () => {
        // Firestore batch operations are limited to 500 documents.
        // We need to process in chunks if there are more.
        const clientsRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`);
        const snapshot = await dependencies.getDocs(clientsRef);
        const batches = [];
        let currentBatch = dependencies.writeBatch(dependencies.db);
        let operationCount = 0;

        snapshot.docs.forEach((doc, index) => {
            currentBatch.delete(doc.ref);
            operationCount++;
            if (operationCount === 499) {
                batches.push(currentBatch);
                currentBatch = dependencies.writeBatch(dependencies.db);
                operationCount = 0;
            }
        });
        batches.push(currentBatch);

        await Promise.all(batches.map(batch => batch.commit()));
        dependencies.showModal('Éxito', 'Todos los clientes han sido eliminados.', showVerEditarClientes);
    }, 'Sí, Eliminar Todo');
}


// --- IMPORT FUNCTIONS ---

function showImportarClientesView() {
    dependencies.mainContent.innerHTML = `
        <div class="p-4 animate-fade-in"><div class="container mx-auto max-w-2xl"><div class="bg-white/90 p-8 rounded-lg shadow-xl text-center">
            <h2 class="text-2xl font-bold mb-4 text-gray-800">Importar Clientes</h2>
            <p class="mb-6 text-gray-600">Selecciona un archivo Excel (.xlsx) o CSV. La aplicación leerá los datos para agregar nuevos clientes.</p>
            <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:bg-gray-50 transition-colors">
                <input type="file" id="fileUploader" class="hidden" accept=".xlsx, .xls, .csv">
                <label for="fileUploader" class="cursor-pointer flex flex-col items-center">
                    <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    <span class="mt-2 text-sm font-medium text-blue-600">Haz clic para seleccionar un archivo</span>
                </label>
            </div>
            <p id="fileName" class="mt-4 text-sm text-gray-500 h-5"></p>
            <button id="cancelImport" class="mt-6 px-6 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Cancelar</button>
        </div></div></div>`;
    document.getElementById('cancelImport').addEventListener('click', window.showClientesSubMenu);
    document.getElementById('fileUploader').addEventListener('change', handleFileUpload);
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    document.getElementById('fileName').textContent = `Archivo: ${file.name}`;
    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Procesando archivo...</h2></div>`;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            await procesarYGuardarClientes(rows);
        } catch (error) {
            dependencies.showModal('Error al Procesar', `No se pudo leer el archivo. Error: ${error.message}`);
        }
    };
    reader.readAsArrayBuffer(file);
}

async function procesarYGuardarClientes(rows) {
    if (!rows || rows.length === 0) {
        dependencies.showModal('Archivo Vacío', 'El archivo no contiene datos.', window.showClientesSubMenu);
        return;
    }
    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Verificando y guardando...</h2></div>`;

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
                    nombreComercial, nombrePersonal,
                    telefono: '', sector: '', codigoCep: '',
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
    dependencies.showModal('Sincronización Completa', `Se analizaron ${rows.length} filas.<br><strong>${clientesNuevosContador} clientes nuevos</strong> fueron importados.`, showVerEditarClientes);
}

