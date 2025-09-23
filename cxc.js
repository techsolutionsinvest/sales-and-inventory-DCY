// --- Lógica del módulo de Cuentas por Cobrar (CXC) ---

(function() {
    // Variables locales del módulo
    let _db, _userId, _appId, _mainContent, _showMainMenu, _showModal;
    let _collection, _onSnapshot, _doc, _getDoc, _addDoc, _setDoc, _deleteDoc, _getDocs, _writeBatch, _query, _where;

    // Cachés de datos del módulo
    let _clientesCache = [];
    let _cxcTransactionsCache = [];
    let _cxcActiveListener = null; // Listener específico para esta vista

    /**
     * Limpia el listener activo del módulo para evitar fugas de memoria.
     */
    function cleanupCXCListener() {
        if (_cxcActiveListener) {
            _cxcActiveListener();
            _cxcActiveListener = null;
        }
    }

    /**
     * Inicializa el módulo con las dependencias de la app principal.
     */
    window.initCXC = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
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
    };

    /**
     * Muestra la vista principal de CXC con opciones para consultar o sincronizar.
     */
    window.showCXCView = function() {
        cleanupCXCListener();
        _mainContent.innerHTML = `
            <div class="p-4 pt-8 animate-fade-in">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Cuentas por Cobrar (CXC)</h1>
                        <div class="space-y-4">
                            <button id="consultarSaldosBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Consultar Estado de Cuenta</button>
                            <button id="sincronizarExcelBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600">Sincronizar Saldos desde Excel</button>
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('consultarSaldosBtn').addEventListener('click', showConsultaView);
        document.getElementById('sincronizarExcelBtn').addEventListener('click', showSincronizarView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }

    /**
     * Muestra la vista para cargar el archivo Excel y sincronizar saldos.
     */
    function showSincronizarView() {
        _mainContent.innerHTML = `
            <div class="p-4 animate-fade-in"><div class="container mx-auto max-w-2xl"><div class="bg-white/90 p-8 rounded-lg shadow-xl text-center">
                <h2 class="text-2xl font-bold mb-4 text-gray-800">Sincronizar Saldos Iniciales</h2>
                <p class="mb-6 text-gray-600">Selecciona el archivo Excel de CXC. Esto eliminará los saldos iniciales anteriores y cargará los nuevos.</p>
                <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:bg-gray-50 transition-colors">
                    <input type="file" id="cxcFileUploader" class="hidden" accept=".xlsx, .xls, .csv">
                    <label for="cxcFileUploader" class="cursor-pointer flex flex-col items-center">
                        <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                        <span class="mt-2 text-sm font-medium text-blue-600">Haz clic para seleccionar un archivo</span>
                    </label>
                </div>
                <p id="cxcFileName" class="mt-4 text-sm text-gray-500 h-5"></p>
                <button id="cancelImport" class="mt-6 px-6 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Cancelar</button>
            </div></div></div>`;
        document.getElementById('cancelImport').addEventListener('click', showCXCView);
        document.getElementById('cxcFileUploader').addEventListener('change', handleFileUploadCXC);
    }

    /**
     * Maneja la subida del archivo Excel.
     */
    function handleFileUploadCXC(event) {
        const file = event.target.files[0];
        if (!file) return;
        document.getElementById('cxcFileName').textContent = `Archivo: ${file.name}`;
        _showModal('Progreso', 'Procesando archivo...');
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                processAndSaveCXCData(rows);
            } catch (error) {
                _showModal('Error al Procesar', `No se pudo leer el archivo. Error: ${error.message}`);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Procesa los datos del Excel y los guarda en Firestore.
     */
    async function processAndSaveCXCData(rows) {
        // 1. Obtener todos los clientes de la app para poder hacer el match
        const clientsRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/clientes`);
        const clientSnapshot = await _getDocs(clientsRef);
        const appClients = clientSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const transactionsToAdd = [];
        let notFoundClients = [];

        // 2. Iterar sobre las filas del Excel para extraer deudas
        rows.forEach(row => {
            const isClientRow = !isNaN(parseInt(row[0], 10)) && typeof row[3] === 'string' && row[3].trim().length > 0;
            const debtAmount = parseFloat(row[10]);

            if (isClientRow && !isNaN(debtAmount) && debtAmount !== 0) {
                const excelClientName = row[3].trim().toUpperCase();
                
                // 3. Buscar el cliente en la caché de la app
                const matchedClient = appClients.find(c => 
                    (c.nombreComercial && c.nombreComercial.trim().toUpperCase() === excelClientName) ||
                    (c.nombrePersonal && c.nombrePersonal.trim().toUpperCase() === excelClientName)
                );

                if (matchedClient) {
                    transactionsToAdd.push({
                        clienteId: matchedClient.id,
                        fecha: new Date(),
                        tipo: 'saldo_inicial',
                        monto: debtAmount,
                        descripcion: 'Saldo inicial cargado desde Excel'
                    });
                } else {
                    notFoundClients.push(excelClientName);
                }
            }
        });

        if (transactionsToAdd.length === 0) {
            _showModal('Sin Cambios', 'No se encontraron deudas válidas para sincronizar en el archivo.');
            return;
        }

        // 4. Confirmar con el usuario antes de escribir en la DB
        const confirmationMessage = `
            <p>Se encontraron <strong>${transactionsToAdd.length} saldos</strong> para sincronizar.</p>
            <p class="mt-2">Esta acción <strong>eliminará todos los saldos iniciales anteriores</strong> y los reemplazará con los del archivo.</p>
            ${notFoundClients.length > 0 ? `<p class="mt-2 text-red-600"><strong>${notFoundClients.length} clientes no fueron encontrados:</strong> ${notFoundClients.slice(0, 5).join(', ')}...</p>` : ''}
            <p class="mt-4 font-bold">¿Deseas continuar?</p>
        `;

        _showModal('Confirmar Sincronización', confirmationMessage, async () => {
            _showModal('Progreso', 'Sincronizando saldos en la base de datos...');
            try {
                const batch = _writeBatch(_db);
                const transRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/cxc_transacciones`);

                // 5. Eliminar saldos iniciales viejos
                const oldInitialBalancesQuery = _query(transRef, _where("tipo", "==", "saldo_inicial"));
                const oldBalancesSnapshot = await _getDocs(oldInitialBalancesQuery);
                oldBalancesSnapshot.forEach(doc => batch.delete(doc.ref));

                // 6. Añadir los nuevos saldos
                transactionsToAdd.forEach(trans => {
                    const newDocRef = _doc(transRef);
                    batch.set(newDocRef, trans);
                });

                await batch.commit();
                _showModal('Éxito', `${transactionsToAdd.length} saldos iniciales han sido sincronizados correctamente.`, showCXCView);
            } catch (error) {
                _showModal('Error', `Ocurrió un error al guardar los datos: ${error.message}`);
            }
        }, 'Sí, Sincronizar');
    }

    /**
     * Muestra la vista para consultar los estados de cuenta.
     */
    async function showConsultaView() {
        cleanupCXCListener();
        _mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Cargando datos...</h2></div>`;

        try {
            // Cargar clientes
            const clientsRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/clientes`);
            const clientSnapshot = await _getDocs(clientsRef);
            _clientesCache = clientSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Escuchar transacciones en tiempo real
            const transRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/cxc_transacciones`);
            _cxcActiveListener = _onSnapshot(transRef, (snapshot) => {
                _cxcTransactionsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Si ya estamos en la vista de consulta, la re-renderizamos para reflejar cambios.
                if (document.getElementById('cxc-consulta-container')) {
                    renderConsultaView();
                } else {
                     renderConsultaView();
                }
            });

        } catch (error) {
            _showModal('Error', `No se pudieron cargar los datos: ${error.message}`);
        }
    }
    
    /**
     * Renderiza la vista de consulta principal con la lista de clientes.
     */
    function renderConsultaView() {
        const balances = _clientesCache.map(cliente => {
            const clientTransactions = _cxcTransactionsCache.filter(t => t.clienteId === cliente.id);
            const balance = clientTransactions.reduce((sum, t) => sum + t.monto, 0);
            return { ...cliente, balance };
        }).filter(c => c.balance !== 0)
          .sort((a, b) => b.balance - a.balance);

        let clientsListHTML = balances.length > 0
            ? balances.map(c => `
                <li class="border-b border-gray-200">
                    <button data-client-id="${c.id}" class="w-full text-left p-4 hover:bg-gray-50 flex justify-between items-center">
                        <div>
                            <p class="font-semibold text-gray-800">${c.nombreComercial}</p>
                            <p class="text-sm text-gray-500">${c.nombrePersonal || ''}</p>
                        </div>
                        <span class="font-bold text-lg ${c.balance > 0 ? 'text-red-600' : 'text-green-600'}">$${c.balance.toFixed(2)}</span>
                    </button>
                </li>`).join('')
            : '<li class="p-4 text-center text-gray-500">No hay clientes con saldos pendientes.</li>';

        _mainContent.innerHTML = `
            <div id="cxc-consulta-container" class="p-4 animate-fade-in">
                <div class="container mx-auto">
                    <div class="bg-white/90 p-6 rounded-lg shadow-xl">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-2xl font-bold text-gray-800">Estado de Cuenta de Clientes</h2>
                            <button id="backToCxcMenu" class="px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                        <input type="text" id="cxcSearchInput" class="w-full p-3 border rounded-lg mb-4" placeholder="Buscar cliente...">
                        <ul id="cxc-clients-list" class="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
                            ${clientsListHTML}
                        </ul>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('backToCxcMenu').addEventListener('click', showCXCView);
        document.getElementById('cxcSearchInput').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredBalances = balances.filter(c => 
                c.nombreComercial.toLowerCase().includes(searchTerm) || 
                (c.nombrePersonal && c.nombrePersonal.toLowerCase().includes(searchTerm))
            );
            const filteredHTML = filteredBalances.map(c => `
                <li class="border-b border-gray-200">
                    <button data-client-id="${c.id}" class="w-full text-left p-4 hover:bg-gray-50 flex justify-between items-center">
                        <div>
                            <p class="font-semibold text-gray-800">${c.nombreComercial}</p>
                            <p class="text-sm text-gray-500">${c.nombrePersonal || ''}</p>
                        </div>
                        <span class="font-bold text-lg ${c.balance > 0 ? 'text-red-600' : 'text-green-600'}">$${c.balance.toFixed(2)}</span>
                    </button>
                </li>`).join('');
            document.getElementById('cxc-clients-list').innerHTML = filteredHTML || '<li class="p-4 text-center text-gray-500">No se encontraron clientes.</li>';
        });
        
        document.getElementById('cxc-clients-list').addEventListener('click', (e) => {
            const button = e.target.closest('button[data-client-id]');
            if (button) {
                showClientDetailView(button.dataset.clientId);
            }
        });
    }

    /**
     * Muestra la vista de detalle de un cliente con su historial de transacciones.
     */
    function showClientDetailView(clientId) {
        const cliente = _clientesCache.find(c => c.id === clientId);
        if (!cliente) return;
        
        const clientTransactions = _cxcTransactionsCache
            .filter(t => t.clienteId === clientId)
            .sort((a, b) => a.fecha.toDate() - b.fecha.toDate());

        let runningBalance = 0;
        const transactionsHTML = clientTransactions.map(t => {
            runningBalance += t.monto;
            const isCredit = t.monto > 0; // Facturas, saldos iniciales
            return `
                <tr class="border-b">
                    <td class="py-2 px-3 text-sm text-gray-600">${t.fecha.toDate().toLocaleDateString('es-ES')}</td>
                    <td class="py-2 px-3">${t.descripcion}</td>
                    <td class="py-2 px-3 text-right ${isCredit ? 'text-red-600' : 'text-green-600'}">${isCredit ? `$${t.monto.toFixed(2)}` : ''}</td>
                    <td class="py-2 px-3 text-right ${!isCredit ? 'text-green-600' : 'text-red-600'}">${!isCredit ? `$${(t.monto * -1).toFixed(2)}` : ''}</td>
                    <td class="py-2 px-3 text-right font-semibold">$${runningBalance.toFixed(2)}</td>
                </tr>
            `;
        }).join('');
        
        const finalBalance = runningBalance;

        _mainContent.innerHTML = `
            <div class="p-4 animate-fade-in">
                <div class="container mx-auto">
                    <div class="bg-white/90 p-6 rounded-lg shadow-xl">
                        <div class="flex justify-between items-center mb-4">
                            <div>
                                <h2 class="text-2xl font-bold text-gray-800">${cliente.nombreComercial}</h2>
                                <p class="text-gray-600">Saldo Actual: <span class="font-bold text-2xl ${finalBalance > 0 ? 'text-red-600' : 'text-green-600'}">$${finalBalance.toFixed(2)}</span></p>
                            </div>
                            <button onclick="window.initCXC.showConsultaView()" class="px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver a la lista</button>
                        </div>

                        <div class="my-6 border p-4 rounded-lg">
                            <h3 class="text-lg font-semibold mb-2">Registrar Abono</h3>
                            <form id="addAbonoForm" class="flex items-center gap-4">
                                <input type="number" id="abonoAmount" placeholder="Monto del abono" class="flex-grow p-2 border rounded-lg" required step="0.01">
                                <input type="text" id="abonoDesc" placeholder="Descripción (Ej: Transferencia)" class="flex-grow p-2 border rounded-lg" required>
                                <button type="submit" class="px-6 py-2 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Registrar</button>
                            </form>
                        </div>

                        <div class="overflow-x-auto">
                            <table class="min-w-full bg-white">
                                <thead class="bg-gray-100"><tr>
                                    <th class="py-2 px-3 text-left font-semibold">Fecha</th>
                                    <th class="py-2 px-3 text-left font-semibold">Descripción</th>
                                    <th class="py-2 px-3 text-right font-semibold">Debe</th>
                                    <th class="py-2 px-3 text-right font-semibold">Haber</th>
                                    <th class="py-2 px-3 text-right font-semibold">Saldo</th>
                                </tr></thead>
                                <tbody>${transactionsHTML}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('addAbonoForm').addEventListener('submit', (e) => handleAddAbono(e, clientId));
    }
    
    /**
     * Maneja el registro de un nuevo abono para un cliente.
     */
    async function handleAddAbono(event, clientId) {
        event.preventDefault();
        const amount = parseFloat(document.getElementById('abonoAmount').value);
        const description = document.getElementById('abonoDesc').value.trim();

        if (isNaN(amount) || amount <= 0 || !description) {
            _showModal('Error', 'Por favor, ingrese un monto y una descripción válidos.');
            return;
        }

        const newTransaction = {
            clienteId: clientId,
            fecha: new Date(),
            tipo: 'abono',
            monto: -amount, // Los abonos son negativos para restar del saldo
            descripcion: description
        };

        try {
            const transRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/cxc_transacciones`);
            await _addDoc(transRef, newTransaction);
            // No es necesario llamar a showClientDetailView, onSnapshot lo hará automáticamente.
            document.getElementById('addAbonoForm').reset();
        } catch (error) {
            _showModal('Error', `No se pudo registrar el abono: ${error.message}`);
        }
    }


    // Exponer la función para volver a la lista de consulta desde la vista de detalle
    window.initCXC.showConsultaView = renderConsultaView;


})();

