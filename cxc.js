// --- Lógica del módulo de Cuentas por Cobrar (CXC) ---
// Versión 2.3 - Arquitectura robusta con carga en fases y validación de datos

(function() {
    // Variables locales del módulo
    let _db, _userId, _appId, _mainContent, _showMainMenu, _showModal;
    let _collection, _onSnapshot, _doc, _getDocs, _addDoc, _writeBatch, _query, _where;

    // Cachés de datos del módulo
    let _clientesCache = [];
    let _cxcTransactionsCache = []; // Usado para la vista general
    let _cxcActiveListener = null;

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
        _getDocs = dependencies.getDocs;
        _addDoc = dependencies.addDoc;
        _writeBatch = dependencies.writeBatch;
        _query = dependencies.query;
        _where = dependencies.where;
    };

    /**
     * Muestra la vista principal de CXC (CXC General).
     */
    window.showCXCView = function() {
        cleanupCXCListener();
        _mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-2xl font-bold text-gray-700">Cargando datos de clientes y saldos...</h2></div>`;

        try {
            Promise.all([
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/clientes`)),
                _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/cxc_transacciones`))
            ]).then(([clientSnapshot, transactionsSnapshot]) => {
                _clientesCache = clientSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                _cxcTransactionsCache = transactionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderCXCGeneralView();
            }).catch(error => {
                console.error("Error al cargar datos de CXC:", error);
                _showModal('Error', `No se pudieron cargar los datos: ${error.message}`);
            });
        } catch (error) {
            _showModal('Error Crítico', 'Ocurrió un error inesperado al iniciar la carga de datos.');
        }
    };

    /**
     * Renderiza la tabla general de CXC.
     */
    function renderCXCGeneralView() {
        const cxcData = _clientesCache.map(cliente => {
            const clientTransactions = _cxcTransactionsCache.filter(t => t.clienteId === cliente.id);
            const balance = clientTransactions.reduce((sum, t) => sum + (t.monto || 0), 0);
            
            const abonos = clientTransactions
                .filter(t => t.tipo === 'abono' && t.fecha && typeof t.fecha.toDate === 'function')
                .sort((a, b) => b.fecha.toDate() - a.fecha.toDate());
            
            const ultimoAbono = abonos.length > 0 ? abonos[0].fecha.toDate().toLocaleDateString('es-ES') : 'N/A';
            return { ...cliente, balance, ultimoAbono };
        }).sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial));

        _mainContent.innerHTML = `
            <div class="p-4 animate-fade-in">
                <div class="container mx-auto">
                    <div class="bg-white/90 p-6 rounded-lg shadow-xl">
                        <div class="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-4">
                            <h2 class="text-2xl font-bold text-gray-800 text-center sm:text-left">CXC General</h2>
                            <button id="backToMenuBtn" class="w-full sm:w-auto px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver al Menú</button>
                        </div>
                        <input type="text" id="cxcSearchInput" class="w-full p-3 border rounded-lg mb-4" placeholder="Buscar cliente...">
                        <div class="overflow-x-auto">
                            <table class="min-w-full bg-white">
                                <thead class="bg-gray-100">
                                    <tr>
                                        <th class="py-2 px-3 text-left font-semibold">Cliente</th>
                                        <th class="py-2 px-3 text-right font-semibold">Deuda Actual</th>
                                        <th class="py-2 px-3 text-center font-semibold">Último Abono</th>
                                    </tr>
                                </thead>
                                <tbody id="cxc-general-tbody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
        document.getElementById('cxcSearchInput').addEventListener('input', (e) => {
             const searchTerm = e.target.value.toLowerCase();
             const filteredData = cxcData.filter(c => c.nombreComercial.toLowerCase().includes(searchTerm));
             populateCXCGeneralTable(filteredData);
        });

        populateCXCGeneralTable(cxcData);
    }
    
    function populateCXCGeneralTable(data) {
        const tableBody = document.getElementById('cxc-general-tbody');
        if (!tableBody) return;
        tableBody.innerHTML = data.length === 0 ? `<tr><td colspan="3" class="text-center p-4 text-gray-500">No se encontraron clientes.</td></tr>`
            : data.map(cliente => `
            <tr class="border-b hover:bg-gray-50 cursor-pointer" data-client-id="${cliente.id}">
                <td class="py-2 px-3">${cliente.nombreComercial}</td>
                <td class="py-2 px-3 text-right font-bold ${cliente.balance > 0 ? 'text-red-600' : 'text-green-600'}">$${cliente.balance.toFixed(2)}</td>
                <td class="py-2 px-3 text-center text-gray-600">${cliente.ultimoAbono}</td>
            </tr>`).join('');
        
        tableBody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('click', () => {
                if (row.dataset.clientId) {
                    showCXCDetalleClienteView(row.dataset.clientId);
                }
            });
        });
    }

    /**
     * Renderiza la ESTRUCTURA de la vista de detalle y activa el listener.
     */
    function showCXCDetalleClienteView(clientId) {
        cleanupCXCListener();
        const cliente = _clientesCache.find(c => c.id === clientId);
        if (!cliente) {
            _showModal('Error', 'Cliente no encontrado.');
            return;
        }

        _mainContent.innerHTML = `
            <div class="p-4 animate-fade-in">
                <div class="container mx-auto">
                    <div class="bg-white/90 p-6 rounded-lg shadow-xl">
                        <div class="border-b pb-4 mb-4">
                            <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                <div>
                                    <h2 class="text-2xl font-bold text-gray-800">${cliente.nombreComercial}</h2>
                                    <p class="text-gray-600">${cliente.nombrePersonal || 'Sin nombre personal'}</p>
                                </div>
                                <button onclick="window.initCXC.showCXCView()" class="w-full sm:w-auto px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver a la lista</button>
                            </div>
                            <div id="saldo-total-cliente" class="mt-4 text-center sm:text-right">
                                <p class="text-gray-600">Calculando saldo...</p>
                            </div>
                        </div>
                        <div class="my-6 border p-4 rounded-lg bg-gray-50">
                            <h3 class="text-lg font-semibold mb-2 text-gray-700">Registrar Abono</h3>
                            <form id="addAbonoForm" class="flex flex-col sm:flex-row items-center gap-4">
                                <input type="number" id="abonoAmount" placeholder="Monto del abono" class="flex-grow w-full sm:w-auto p-2 border rounded-lg" required step="0.01">
                                <input type="text" id="abonoDesc" placeholder="Descripción (Ej: Transferencia)" class="flex-grow w-full sm:w-auto p-2 border rounded-lg" required>
                                <button type="submit" class="w-full sm:w-auto px-6 py-2 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Registrar</button>
                            </form>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full bg-white text-sm">
                                <thead class="bg-gray-100">
                                    <tr>
                                        <th class="py-2 px-2 text-left font-semibold">Fecha</th>
                                        <th class="py-2 px-2 text-center font-semibold">Tipo</th>
                                        <th class="py-2 px-2 text-right font-semibold">Monto</th>
                                        <th class="py-2 px-2 text-center font-semibold">Vacío 1/4</th>
                                        <th class="py-2 px-2 text-center font-semibold">Vacío 350</th>
                                        <th class="py-2 px-2 text-center font-semibold">Vacío 1,25</th>
                                    </tr>
                                </thead>
                                <tbody id="cxc-detalle-tbody">
                                    <tr><td colspan="6" class="p-4 text-center">Cargando transacciones...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('addAbonoForm').addEventListener('submit', (e) => handleAddAbono(e, clientId));

        // Activar listener para actualizar los datos, pero solo para este cliente
        const transRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/cxc_transacciones`);
        const q = _query(transRef, _where("clienteId", "==", clientId));

        _cxcActiveListener = _onSnapshot(q, (snapshot) => {
            const clientTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateCXCDetalleCliente(clientTransactions);
        }, (error) => {
            console.error("Error en el listener de CXC:", error);
            const tableBody = document.getElementById('cxc-detalle-tbody');
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error al recibir actualizaciones.</td></tr>`;
            }
        });
    }

    /**
     * Rellena los DATOS en la vista de detalle ya existente.
     */
    function populateCXCDetalleCliente(clientTransactions) {
        const tableBody = document.getElementById('cxc-detalle-tbody');
        const saldoContainer = document.getElementById('saldo-total-cliente');
        if (!tableBody || !saldoContainer) return; // Salir si la vista ya no existe

        // **MEJORA DE ROBUSTEZ**: Filtrar transacciones con datos inválidos
        const validTransactions = clientTransactions.filter(t => 
            t.fecha && typeof t.fecha.toDate === 'function' && !isNaN(t.monto)
        );

        validTransactions.sort((a, b) => a.fecha.toDate() - b.fecha.toDate());

        let runningBalance = 0;
        
        if(validTransactions.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-500">No hay transacciones registradas.</td></tr>`;
        } else {
            tableBody.innerHTML = validTransactions.map(t => {
                runningBalance += t.monto;
                // **LÓGICA MEJORADA**: La distinción se basa en el monto, no en el tipo.
                const isCredit = t.monto > 0; // Ventas, saldos iniciales (positivo)
                const isDebit = t.monto < 0;  // Abonos (negativo)

                let typeIndicatorHTML;
                if (isCredit) {
                    const isBeerSale = Array.isArray(t.rubros) && t.rubros.includes('Cerveceria y Vinos');
                    const bgColor = isBeerSale ? 'bg-blue-500' : 'bg-green-500';
                    typeIndicatorHTML = `<div class="${bgColor} text-white rounded-full w-6 h-6 flex items-center justify-center font-bold mx-auto">V</div>`;
                } else { // Abono
                    typeIndicatorHTML = `<div class="bg-yellow-500 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold mx-auto">A</div>`;
                }

                return `
                    <tr class="border-b">
                        <td class="py-2 px-2">${t.fecha.toDate().toLocaleDateString('es-ES')}</td>
                        <td class="py-2 px-2">${typeIndicatorHTML}</td>
                        <td class="py-2 px-2 text-right font-semibold ${isCredit ? 'text-red-600' : 'text-green-600'}">
                            $${Math.abs(t.monto).toFixed(2)}
                        </td>
                        <td class="py-2 px-2 text-center text-gray-500">-</td>
                        <td class="py-2 px-2 text-center text-gray-500">-</td>
                        <td class="py-2 px-2 text-center text-gray-500">-</td>
                    </tr>
                `;
            }).join('');
        }
        
        saldoContainer.innerHTML = `
            <p class="text-gray-600">Saldo Actual: 
                <span class="font-bold text-2xl ${runningBalance > 0 ? 'text-red-600' : 'text-green-600'}">
                    $${runningBalance.toFixed(2)}
                </span>
            </p>`;
    }
    
    async function handleAddAbono(event, clientId) {
        event.preventDefault();
        const amountInput = document.getElementById('abonoAmount');
        const descInput = document.getElementById('abonoDesc');
        const amount = parseFloat(amountInput.value);
        const description = descInput.value.trim();

        if (isNaN(amount) || amount <= 0 || !description) {
            _showModal('Error', 'Por favor, ingrese un monto y una descripción válidos.');
            return;
        }

        const newTransaction = {
            clienteId: clientId,
            fecha: new Date(),
            tipo: 'abono',
            monto: -amount,
            descripcion: description,
            rubros: []
        };

        try {
            await _addDoc(_collection(_db, `artifacts/${_appId}/users/${_userId}/cxc_transacciones`), newTransaction);
            amountInput.value = '';
            descInput.value = '';
        } catch (error) {
            _showModal('Error', `No se pudo registrar el abono: ${error.message}`);
        }
    }

    // Exponer la función para volver a la lista de consulta
    window.initCXC.showCXCView = showCXCView;

})();

