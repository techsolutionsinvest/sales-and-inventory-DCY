// --- Lógica del módulo de Cuentas por Cobrar (CXC) ---

(function() {
    // Variables locales del módulo
    let _db, _userId, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _getDocs, _query, _where;

    let _clientesCache = [];
    let _cxcDataCache = [];

    /**
     * Inicializa el módulo con las dependencias necesarias.
     */
    window.initCXC = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
        _activeListeners = dependencies.activeListeners;
        _showMainMenu = dependencies.showMainMenu;
        _showModal = dependencies.showModal;
        _collection = dependencies.collection;
        _onSnapshot = dependencies.onSnapshot;
        _doc = dependencies.doc;
        _addDoc = dependencies.addDoc;
        _setDoc = dependencies.setDoc;
        _deleteDoc = dependencies.deleteDoc;
        _getDocs = dependencies.getDocs;
        _query = dependencies.query;
        _where = dependencies.where;
    };

    /**
     * Limpia los listeners activos para este módulo.
     */
    function cleanupCXCListeners() {
        _activeListeners.forEach(unsub => unsub());
        _activeListeners = [];
    }

    /**
     * Muestra la vista principal de Cuentas por Cobrar.
     */
    window.showCXCView = function() {
        cleanupCXCListeners();
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <div class="flex justify-between items-center mb-6">
                            <h1 class="text-3xl font-bold text-gray-800">Cuentas por Cobrar</h1>
                            <button id="backToMenuBtn" class="px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                        <div class="mb-4">
                            <input type="text" id="cxc-search-input" placeholder="Buscar cliente..." class="w-full px-4 py-2 border rounded-lg">
                        </div>
                        <div id="cxc-list-container" class="overflow-x-auto max-h-96">
                            <p class="text-gray-500 text-center">Calculando saldos...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
        document.getElementById('cxc-search-input').addEventListener('input', (e) => {
            renderCXCList(e.target.value.toLowerCase());
        });

        loadAndProcessCXCData();
    };
    
    /**
     * Carga los datos de clientes y transacciones, los procesa y luego renderiza la lista.
     */
    async function loadAndProcessCXCData() {
        const clientesRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/clientes`);
        const transaccionesRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/cxc_transacciones`);

        // Usamos onSnapshot para mantener los datos actualizados en tiempo real
        const unsubClientes = _onSnapshot(clientesRef, (snapshot) => {
            _clientesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            processAndRender();
        });

        const unsubTransacciones = _onSnapshot(transaccionesRef, (snapshot) => {
            const transacciones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const saldos = new Map();
            transacciones.forEach(t => {
                const saldoActual = saldos.get(t.clienteId) || 0;
                const monto = t.tipo === 'factura' ? t.monto : -t.monto;
                saldos.set(t.clienteId, saldoActual + monto);
            });

            _cxcDataCache = Array.from(saldos.entries()).map(([clienteId, saldo]) => {
                return { clienteId, saldo };
            });

            processAndRender();
        });
        
        _activeListeners.push(unsubClientes, unsubTransacciones);
    }
    
    /**
     * Procesa los datos cacheados y llama a la función de renderizado.
     */
    function processAndRender() {
        const searchInput = document.getElementById('cxc-search-input');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        renderCXCList(searchTerm);
    }

    /**
     * Renderiza la lista de clientes con sus saldos deudores.
     */
    function renderCXCList(searchTerm = '') {
        const container = document.getElementById('cxc-list-container');
        if (!container) return;

        // Combinar datos de clientes con saldos
        let combinedData = _clientesCache.map(cliente => {
            const cxcInfo = _cxcDataCache.find(c => c.clienteId === cliente.id);
            return {
                ...cliente,
                saldo: cxcInfo ? cxcInfo.saldo : 0
            };
        });

        // Filtrar clientes que tienen saldo deudor o que coinciden con la búsqueda
        let filteredData = combinedData.filter(c => {
            const hasDebt = c.saldo > 0;
            const matchesSearch = searchTerm ? 
                c.nombreComercial.toLowerCase().includes(searchTerm) || 
                c.nombrePersonal.toLowerCase().includes(searchTerm) : 
                true;
            
            // Si hay un término de búsqueda, mostrar todos los que coincidan. 
            // Si no, mostrar solo los que tienen deuda.
            return searchTerm ? matchesSearch : hasDebt;
        });

        // Ordenar por nombre comercial
        filteredData.sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial));

        if (filteredData.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">${searchTerm ? 'No se encontraron clientes.' : 'No hay clientes con deudas pendientes.'}</p>`;
            return;
        }

        let tableHTML = `
            <table class="min-w-full bg-white border border-gray-200">
                <thead class="bg-gray-200 sticky top-0">
                    <tr>
                        <th class="py-2 px-4 border-b text-left text-sm">Cliente</th>
                        <th class="py-2 px-4 border-b text-right text-sm">Saldo Deudor</th>
                        <th class="py-2 px-4 border-b text-center text-sm">Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        filteredData.forEach(cliente => {
            const saldoColor = cliente.saldo > 0 ? 'text-red-600' : 'text-green-600';
            tableHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="py-2 px-4 border-b text-sm">
                        <p class="font-semibold">${cliente.nombreComercial}</p>
                        <p class="text-xs text-gray-500">${cliente.nombrePersonal}</p>
                    </td>
                    <td class="py-2 px-4 border-b text-right text-sm font-bold ${saldoColor}">
                        $${cliente.saldo.toFixed(2)}
                    </td>
                    <td class="py-2 px-4 border-b text-center">
                        <button onclick="window.cxcModule.showClientStatement('${cliente.id}')" class="px-3 py-1 bg-cyan-500 text-white text-xs rounded-lg hover:bg-cyan-600">
                            Ver Detalles
                        </button>
                    </td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    }

    /**
     * Placeholder para la función que mostrará el estado de cuenta detallado.
     */
    function showClientStatement(clienteId) {
        // Esta funcionalidad se implementará en el siguiente paso.
        _showModal('Próximamente', `Aquí se mostrará el estado de cuenta detallado para el cliente seleccionado.`);
    }

    // Exponer funciones públicas
    window.cxcModule = {
        showClientStatement
    };

})();
