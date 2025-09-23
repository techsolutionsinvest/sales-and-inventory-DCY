/**
 * Clientes.js
 * This module handles all functionality related to customer management,
 * including adding, viewing, and importing customers from a structured Excel/CSV file.
 */

// This variable will hold the dependencies passed from index.html
let dependencies;

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
                        <button id="viewClientesBtn" class="w-full px-6 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition-transform transform hover:scale-105">Ver Lista de Clientes</button>
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
 * Displays the view for importing customers from a file.
 */
function showImportarClientesView() {
    const message = `
        <div class="p-4 animate-fade-in">
            <div class="container mx-auto max-w-2xl">
                <div class="bg-white/90 p-8 rounded-lg shadow-xl text-center">
                    <h2 class="text-2xl font-bold mb-4 text-gray-800">Importar Clientes</h2>
                    <p class="mb-6 text-gray-600">Selecciona un archivo Excel (.xlsx) o CSV convertido desde tu PDF de CXC. La aplicación leerá los datos estructuralmente para agregar nuevos clientes.</p>
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
    
    const fileUploader = document.getElementById('fileUploader');
    fileUploader.addEventListener('change', handleFileUpload);
}

/**
 * Handles the file upload and parsing process using SheetJS.
 * This version converts the sheet to an array of arrays for robust parsing.
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
            // Convert to array of arrays for positional parsing
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
 * This version reads data by column index, not by header name.
 * @param {Array<Array<any>>} rows - Array of rows from the parsed file.
 */
async function procesarYGuardarClientes(rows) {
    if (!rows || rows.length === 0) {
        dependencies.showModal('Archivo Vacío', 'El archivo no contiene datos o no se pudo leer ninguna fila.', window.showClientesSubMenu);
        return;
    }
    
    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Verificando clientes y guardando...</h2></div>`;

    const collectionRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`);
    const snapshot = await dependencies.getDocs(collectionRef);
    const clientesExistentes = new Set(snapshot.docs.map(doc => doc.data().nombreComercial.trim().toUpperCase()));

    const batch = dependencies.writeBatch(dependencies.db);
    let clientesNuevosContador = 0;
    const codigoCepGlobal = "22405697";

    rows.forEach(row => {
        // A customer row is valid if the first column is a number and the second is a non-empty string.
        const isClientRow = !isNaN(parseInt(row[0])) && typeof row[1] === 'string' && row[1].trim() !== '';

        if (isClientRow) {
            const nombreComercial = String(row[1]).trim();
            // The personal name is in column 4 (index 3). It can be a string or sometimes the number 0.
            const nombrePersonalRaw = row[3];
            const nombrePersonal = (typeof nombrePersonalRaw === 'string' && nombrePersonalRaw.trim() !== '0') ? nombrePersonalRaw.trim() : '';
            
            if (nombreComercial && !clientesExistentes.has(nombreComercial.toUpperCase())) {
                const nuevoCliente = {
                    nombreComercial: nombreComercial,
                    nombrePersonal: nombrePersonal,
                    telefono: '',
                    sector: '',
                    codigoCep: codigoCepGlobal,
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


/**
 * Displays the form for adding a new customer manually.
 */
function showAgregarClienteForm() {
    dependencies.mainContent.innerHTML = `
        <div class="p-4 animate-fade-in">
            <div class="container mx-auto max-w-2xl">
                <div class="bg-white/90 p-8 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-bold mb-6 text-center">Agregar Nuevo Cliente</h2>
                    <form id="clienteForm" class="space-y-4">
                        <input type="text" id="nombreComercial" placeholder="Nombre Comercial (Requerido)" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500" required>
                        <input type="text" id="nombrePersonal" placeholder="Nombre Personal" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                        <input type="tel" id="telefono" placeholder="Teléfono" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                        <input type="text" id="sector" placeholder="Sector" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                        <input type="text" id="codigoCep" placeholder="Código CEP" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                        <div class="flex justify-between items-center pt-4">
                            <button type="button" id="cancelAddCliente" class="px-6 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Cancelar</button>
                            <button type="submit" class="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Guardar Cliente</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.getElementById('cancelAddCliente').addEventListener('click', window.showClientesSubMenu);
    document.getElementById('clienteForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nuevoCliente = {
            nombreComercial: document.getElementById('nombreComercial').value.trim(),
            nombrePersonal: document.getElementById('nombrePersonal').value.trim(),
            telefono: document.getElementById('telefono').value.trim(),
            sector: document.getElementById('sector').value.trim(),
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
 * Fetches and displays all customers from Firestore in a table.
 */
async function showVerEditarClientes() {
    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Cargando clientes...</h2></div>`;
    
    try {
        const collectionRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`);
        const q = dependencies.query(collectionRef);
        const snapshot = await dependencies.getDocs(q);
        
        const docs = snapshot.docs.sort((a, b) => {
            const nameA = a.data().nombreComercial.toUpperCase();
            const nameB = b.data().nombreComercial.toUpperCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        });

        let clientesHtml = `
            <div class="p-4 animate-fade-in">
                <div class="container mx-auto">
                    <div class="bg-white/90 p-6 md:p-8 rounded-lg shadow-xl">
                        <div class="flex flex-col md:flex-row justify-between items-center mb-6">
                            <h2 class="text-2xl font-bold text-gray-800">Lista de Clientes</h2>
                            <button id="backToClientesMenu" class="mt-4 md:mt-0 w-full md:w-auto px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full bg-transparent">
                                <thead class="bg-gray-200/80">
                                    <tr>
                                        <th class="py-3 px-4 border-b text-left text-sm font-bold text-gray-600">Nombre Comercial</th>
                                        <th class="py-3 px-4 border-b text-left text-sm font-bold text-gray-600 hidden md:table-cell">Nombre Personal</th>
                                        <th class="py-3 px-4 border-b text-left text-sm font-bold text-gray-600 hidden md:table-cell">Código CEP</th>
                                    </tr>
                                </thead>
                                <tbody>
        `;

        if (docs.length === 0) {
            clientesHtml += `<tr><td colspan="3" class="text-center py-6 text-gray-500">No hay clientes registrados.</td></tr>`;
        } else {
            docs.forEach(doc => {
                const cliente = doc.data();
                clientesHtml += `
                    <tr class="hover:bg-gray-100/80">
                        <td class="py-3 px-4 border-b border-gray-200 font-medium text-gray-800">${cliente.nombreComercial}</td>
                        <td class="py-3 px-4 border-b border-gray-200 text-gray-600 hidden md:table-cell">${cliente.nombrePersonal || '-'}</td>
                        <td class="py-3 px-4 border-b border-gray-200 text-gray-600 hidden md:table-cell">${cliente.codigoCep || '-'}</td>
                    </tr>
                `;
            });
        }

        clientesHtml += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        dependencies.mainContent.innerHTML = clientesHtml;
        document.getElementById('backToClientesMenu').addEventListener('click', window.showClientesSubMenu);

    } catch (error) {
        console.error("Error fetching customers: ", error);
        dependencies.showModal('Error', `No se pudieron cargar los clientes: ${error.message}`);
    }
}


