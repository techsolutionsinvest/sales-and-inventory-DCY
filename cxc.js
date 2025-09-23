/**
 * cxc.js
 * This module allows users to look up a specific client and view their
 * detailed account statement by parsing a CXC Excel/CSV file on demand.
 */

// This variable will hold the dependencies (db, userId, etc.) passed from index.html
let dependencies;

// This variable will store the client list to power the search functionality.
let allClients = [];

/**
 * Initializes the CXC module.
 * @param {object} deps - An object containing all required dependencies.
 */
window.initCXC = function(deps) {
    dependencies = deps;
};

/**
 * Displays the main view for the CXC module, which is the client search interface.
 */
window.showCXCView = async function() {
    dependencies.floatingControls.classList.add('hidden');
    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Cargando...</h2></div>`;

    try {
        // Fetch all clients to enable searching
        const clientsRef = dependencies.collection(dependencies.db, `artifacts/${dependencies.appId}/users/${dependencies.userId}/clientes`);
        const snapshot = await dependencies.getDocs(clientsRef);
        allClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Render the search view
        renderCXCSearchView();
    } catch (error) {
        console.error("Error fetching clients for CXC search:", error);
        dependencies.showModal('Error', `No se pudieron cargar los datos de los clientes: ${error.message}`);
    }
};

/**
 * Renders the initial search UI for finding a client.
 */
function renderCXCSearchView() {
    dependencies.mainContent.innerHTML = `
        <div class="p-4 animate-fade-in">
            <div class="container mx-auto max-w-2xl">
                <div class="bg-white/90 p-8 rounded-lg shadow-xl">
                    <h2 class="text-2xl font-bold mb-4 text-center">Consultar Estado de Cuenta</h2>
                    <p class="text-center text-gray-600 mb-6">Busca un cliente para ver su historial de deudas y abonos desde el archivo de CXC.</p>
                    <input type="text" id="cxcSearchInput" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Buscar por Nombre Comercial, Personal o CEP...">
                    <div id="cxcSearchResults" class="mt-4 max-h-60 overflow-y-auto"></div>
                    <button id="backToMainMenuBtn" class="mt-6 w-full px-6 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver al Menú</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('backToMainMenuBtn').addEventListener('click', dependencies.showMainMenu);
    document.getElementById('cxcSearchInput').addEventListener('input', filterAndDisplayClients);
}

/**
 * Filters clients based on the search input and displays the results.
 */
function filterAndDisplayClients(e) {
    const searchTerm = e.target.value.toUpperCase();
    const resultsContainer = document.getElementById('cxcSearchResults');
    
    if (searchTerm.length < 2) {
        resultsContainer.innerHTML = '';
        return;
    }

    const filtered = allClients.filter(client =>
        (client.nombreComercial && client.nombreComercial.toUpperCase().includes(searchTerm)) ||
        (client.nombrePersonal && client.nombrePersonal.toUpperCase().includes(searchTerm)) ||
        (client.codigoCep && client.codigoCep.toUpperCase().includes(searchTerm))
    ).sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial));

    if (filtered.length > 0) {
        resultsContainer.innerHTML = filtered.map(client => `
            <div class="p-3 border-b cursor-pointer hover:bg-blue-50" data-client-id="${client.id}">
                <p class="font-semibold text-gray-800">${client.nombreComercial}</p>
                <p class="text-sm text-gray-500">${client.nombrePersonal || 'Sin nombre personal'}</p>
            </div>
        `).join('');
    } else {
        resultsContainer.innerHTML = `<p class="p-3 text-center text-gray-500">No se encontraron clientes.</p>`;
    }
}

// Add a single event listener to the container to handle clicks on any client result
document.getElementById('mainContent').addEventListener('click', function(e) {
    const clientDiv = e.target.closest('[data-client-id]');
    if (clientDiv) {
        const clientId = clientDiv.dataset.clientId;
        const selectedClient = allClients.find(c => c.id === clientId);
        if (selectedClient) {
            promptForFileToSeeStatement(selectedClient);
        }
    }
});


/**
 * Shows a file upload prompt to the user to get the CXC data.
 */
function promptForFileToSeeStatement(client) {
    const fileInputId = 'statementFileInput';
    const message = `
        <h3 class="text-xl font-bold text-gray-800 mb-4">Cargar Archivo de CXC</h3>
        <p class="mb-6 text-gray-600">Para ver el estado de cuenta de <strong>${client.nombreComercial}</strong>, por favor, selecciona el archivo Excel (.xlsx) o CSV de Cuentas por Cobrar.</p>
        <input type="file" id="${fileInputId}" class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" accept=".xlsx, .xls, .csv">
    `;

    dependencies.showModal('Seleccionar Archivo', message);
    
    const fileInput = document.getElementById(fileInputId);
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            dependencies.modalContainer.classList.add('hidden');
            parseAndDisplayStatement(file, client);
        }
    });
}

/**
 * Parses the uploaded file and displays the client's account statement.
 */
async function parseAndDisplayStatement(file, client) {
    dependencies.mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Analizando estado de cuenta...</h2></div>`;
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Find the client's transaction data
            let clientTransactions = [];
            let inClientSection = false;
            const clientNameUpper = client.nombreComercial.toUpperCase();

            for (const row of rows) {
                const firstCell = String(row[0] || '').toUpperCase();
                
                if (firstCell.startsWith('CLIENTE') && firstCell.includes(clientNameUpper)) {
                    inClientSection = true;
                    continue; // Skip the header row
                }
                
                if (inClientSection && firstCell.startsWith('CLIENTE')) {
                    break; // Found the next client, so stop
                }

                if (inClientSection && row.length > 2 && (row[0] || row[1])) {
                    // A valid transaction row seems to have a date or a type (F, E, T)
                    clientTransactions.push({
                        fecha: row[0] || '',
                        tipo: row[1] || '',
                        monto: parseFloat(String(row[2]).replace(/,/g, '')) || 0,
                    });
                }
            }

            renderStatementView(client, clientTransactions);

        } catch (error) {
            console.error("Error parsing statement file:", error);
            dependencies.showModal('Error', `No se pudo analizar el archivo de estado de cuenta: ${error.message}`);
        }
    };

    reader.readAsArrayBuffer(file);
}

/**
 * Renders the final account statement view with transactions and totals.
 */
function renderStatementView(client, transactions) {
    let totalDeuda = 0;
    let totalAbono = 0;

    const transactionRows = transactions.map(t => {
        const monto = t.monto;
        let isDeuda = monto > 0;
        let montoDeuda = '';
        let montoAbono = '';

        if (isDeuda) {
            totalDeuda += monto;
            montoDeuda = `$${monto.toFixed(2)}`;
        } else {
            totalAbono += Math.abs(monto);
            montoAbono = `$${Math.abs(monto).toFixed(2)}`;
        }

        return `
            <tr class="border-b border-gray-200">
                <td class="py-2 px-3 text-sm text-gray-600">${t.fecha}</td>
                <td class="py-2 px-3 text-sm text-gray-600">${t.tipo}</td>
                <td class="py-2 px-3 text-sm text-right font-mono text-green-700">${montoDeuda}</td>
                <td class="py-2 px-3 text-sm text-right font-mono text-red-700">${montoAbono}</td>
            </tr>
        `;
    }).join('');

    const saldoFinal = totalDeuda - totalAbono;

    dependencies.mainContent.innerHTML = `
        <div class="p-4 animate-fade-in">
            <div class="container mx-auto max-w-4xl">
                <div class="bg-white/90 p-8 rounded-lg shadow-xl">
                    <div class="flex justify-between items-center mb-6">
                        <div>
                            <h2 class="text-2xl font-bold text-gray-800">Estado de Cuenta</h2>
                            <p class="text-gray-600 font-semibold">${client.nombreComercial}</p>
                        </div>
                        <button id="backToCXCSearch" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500">Volver a Búsqueda</button>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="min-w-full">
                            <thead class="bg-gray-200/80">
                                <tr>
                                    <th class="py-2 px-3 text-left text-sm font-bold text-gray-600">Fecha</th>
                                    <th class="py-2 px-3 text-left text-sm font-bold text-gray-600">Tipo</th>
                                    <th class="py-2 px-3 text-right text-sm font-bold text-gray-600">Deuda</th>
                                    <th class="py-2 px-3 text-right text-sm font-bold text-gray-600">Abono</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${transactionRows || '<tr><td colspan="4" class="text-center py-6">No se encontraron transacciones para este cliente en el archivo.</td></tr>'}
                            </tbody>
                        </table>
                    </div>

                    <div class="mt-6 pt-4 border-t-2 border-gray-300 flex justify-end">
                        <div class="w-full md:w-1/3">
                            <div class="flex justify-between text-sm">
                                <span class="font-semibold text-gray-600">Total Deuda:</span>
                                <span class="font-mono text-green-700">$${totalDeuda.toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between text-sm">
                                <span class="font-semibold text-gray-600">Total Abono:</span>
                                <span class="font-mono text-red-700">$${totalAbono.toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between font-bold text-lg mt-2 pt-2 border-t">
                                <span class="text-gray-800">Saldo Final:</span>
                                <span class="font-mono ${saldoFinal >= 0 ? 'text-gray-900' : 'text-red-700'}">$${saldoFinal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('backToCXCSearch').addEventListener('click', renderCXCSearchView);
}
