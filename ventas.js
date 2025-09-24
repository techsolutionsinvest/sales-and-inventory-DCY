// --- Lógica del módulo de Ventas ---

(function() {
    // Variables locales del módulo
    let _db, _userId, _appId, _mainContent, _floatingControls;
    let _showMainMenu, _showModal;
    let _collection, _onSnapshot, _doc, _getDoc, _addDoc, _setDoc, _deleteDoc, _getDocs, _writeBatch, _runTransaction, _query, _where;
    
    // Variables específicas del módulo
    let _ventasActiveListeners = []; // Array para gestionar los listeners de este módulo
    let _clientesCache = [];
    let _inventarioCache = [];
    let _ventasGlobal = [];
    let _segmentoOrderCacheVentas = null;
    let _ventaActual = { cliente: null, productos: {} };
    let _originalVentaForEdit = null;
    let _tasaCOP = 0;
    let _tasaBs = 0;
    let _monedaActual = 'USD';

    /**
     * Limpia todos los listeners activos del módulo de ventas para prevenir fugas de memoria e interferencias.
     */
    function cleanupVentasListeners() {
        _ventasActiveListeners.forEach(unsub => unsub());
        _ventasActiveListeners = [];
    }

    /**
     * Obtiene y cachea el mapa de orden de los segmentos.
     */
    async function getSegmentoOrderMapVentas() {
        if (_segmentoOrderCacheVentas) return _segmentoOrderCacheVentas;
        if (window.inventarioModule && typeof window.inventarioModule.getSegmentoOrderMap === 'function') {
            _segmentoOrderCacheVentas = await window.inventarioModule.getSegmentoOrderMap();
            return _segmentoOrderCacheVentas;
        }
        const map = {};
        const segmentosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
        try {
            const snapshot = await _getDocs(segmentosRef);
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                map[data.name] = (data.orden !== undefined) ? data.orden : 9999;
            });
            _segmentoOrderCacheVentas = map;
            return map;
        } catch (e) {
            console.warn("No se pudo obtener el orden de los segmentos en ventas.js", e);
            return null;
        }
    }
    
    /**
     * Inicializa el módulo con las dependencias de la app principal.
     */
    window.initVentas = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _floatingControls = dependencies.floatingControls;
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
        _runTransaction = dependencies.runTransaction;
        _query = dependencies.query;
        _where = dependencies.where;
    };

    /**
     * Renderiza la vista principal de ventas.
     */
    window.showVentasView = function() {
        cleanupVentasListeners();
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Ventas</h1>
                        <div class="space-y-4">
                            <button id="nuevaVentaBtn" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Nueva Venta</button>
                            <button id="ventasTotalesBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Ventas Totales</button>
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('nuevaVentaBtn').addEventListener('click', showNuevaVentaView);
        document.getElementById('ventasTotalesBtn').addEventListener('click', showVentasTotalesView);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }
    
    /**
     * Renderiza la vista para iniciar una nueva venta.
     */
    function showNuevaVentaView() {
        cleanupVentasListeners();
        _originalVentaForEdit = null;
        _floatingControls.classList.add('hidden');
        _monedaActual = 'USD';
        _ventaActual = { cliente: null, productos: {} };
        _mainContent.innerHTML = `
            <div class="p-2 w-full">
                <div class="bg-white/90 backdrop-blur-sm p-3 sm:p-4 rounded-lg shadow-xl flex flex-col h-full" style="min-height: calc(100vh - 1rem);">
                    <div id="venta-header-section" class="mb-2">
                        <div class="flex justify-between items-center mb-2">
                            <h2 class="text-lg font-bold text-gray-800">Nueva Venta</h2>
                            <button id="backToVentasBtn" class="px-3 py-1.5 bg-gray-400 text-white text-xs font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                        <div id="client-search-container">
                            <label for="clienteSearch" class="block text-gray-700 font-medium mb-2">Seleccionar Cliente:</label>
                            <div class="relative"><input type="text" id="clienteSearch" placeholder="Buscar cliente..." class="w-full px-4 py-2 border rounded-lg"><div id="clienteDropdown" class="autocomplete-list hidden"></div></div>
                        </div>
                        <div id="client-display-container" class="hidden flex-wrap items-center justify-between gap-2">
                            <p class="text-gray-700 flex-grow text-sm"><span class="font-medium">Cliente:</span> <span id="selected-client-name" class="font-bold"></span></p>
                            <div id="tasasContainer" class="flex flex-row items-center gap-2">
                                <div class="flex items-center space-x-1">
                                    <label for="tasaCopInput" class="block text-gray-700 text-xs font-medium">COP:</label>
                                    <input type="number" id="tasaCopInput" placeholder="4000" class="w-16 px-1 py-1 text-sm border rounded-lg">
                                </div>
                                <div class="flex items-center space-x-1">
                                    <label for="tasaBsInput" class="block text-gray-700 text-xs font-medium">Bs.:</label>
                                    <input type="number" id="tasaBsInput" placeholder="36.5" class="w-16 px-1 py-1 text-sm border rounded-lg">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="inventarioTableContainer" class="hidden animate-fade-in flex-grow flex flex-col overflow-hidden">
                         <div class="flex justify-between items-center mb-2">
                            <h3 class="text-base font-semibold text-gray-800">Inventario <span id="monedaIndicator" class="text-sm font-normal text-gray-500">(USD)</span></h3>
                             <div id="rubro-filter-container" class="w-1/2">
                                 <select id="rubroFilter" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos los Rubros</option></select>
                             </div>
                         </div>
                        <div class="overflow-auto flex-grow rounded-lg shadow">
                            <table class="min-w-full bg-white text-sm"><thead class="bg-gray-200 sticky top-0"><tr class="text-gray-700 uppercase leading-normal"><th class="py-2 px-1 text-center">Cant.</th><th class="py-2 px-2 text-left">Producto</th><th class="py-2 px-2 text-left price-toggle" onclick="window.ventasModule.toggleMoneda()">Precio</th><th class="py-2 px-1 text-center">Stock</th></tr></thead><tbody id="inventarioTableBody" class="text-gray-600 font-light"></tbody></table>
                        </div>
                    </div>
                    <div id="venta-footer-section" class="mt-2 flex items-center justify-between hidden">
                        <span id="ventaTotal" class="text-base font-bold text-gray-800">Total: $0.00</span>
                         <button id="generarTicketBtn" class="px-5 py-2 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Generar Ticket</button>
                    </div>
                </div>
            </div>
        `;
        
        const clienteSearchInput = document.getElementById('clienteSearch');
        clienteSearchInput.addEventListener('input', () => {
            const searchTerm = clienteSearchInput.value.toLowerCase();
            const filteredClients = _clientesCache.filter(c => c.nombreComercial.toLowerCase().includes(searchTerm) || c.nombrePersonal.toLowerCase().includes(searchTerm));
            renderClienteDropdown(filteredClients);
            document.getElementById('clienteDropdown').classList.remove('hidden');
        });
        
        const savedTasa = localStorage.getItem('tasaCOP');
        if (savedTasa) {
            _tasaCOP = parseFloat(savedTasa);
            document.getElementById('tasaCopInput').value = _tasaCOP;
        }
        
        const savedTasaBs = localStorage.getItem('tasaBs');
        if (savedTasaBs) {
            _tasaBs = parseFloat(savedTasaBs);
            document.getElementById('tasaBsInput').value = _tasaBs;
        }

        document.getElementById('tasaCopInput').addEventListener('input', (e) => {
            _tasaCOP = parseFloat(e.target.value) || 0;
            localStorage.setItem('tasaCOP', _tasaCOP);
            renderVentasInventario();
            updateVentaTotal();
        });
        
        document.getElementById('tasaBsInput').addEventListener('input', (e) => {
            _tasaBs = parseFloat(e.target.value) || 0;
            localStorage.setItem('tasaBs', _tasaBs);
            renderVentasInventario();
            updateVentaTotal();
        });
        
        document.getElementById('rubroFilter').addEventListener('change', renderVentasInventario);
        document.getElementById('generarTicketBtn').addEventListener('click', generarTicket);
        document.getElementById('backToVentasBtn').addEventListener('click', showVentasView);
        
        loadDataForNewSale();
    }
    
    /**
     * Carga los datos de clientes e inventario y popula el filtro de rubros.
     */
    function loadDataForNewSale() {
        const clientesRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/clientes`);
        const unsubClientes = _onSnapshot(clientesRef, (snapshot) => {
            _clientesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });

        const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
        const unsubInventario = _onSnapshot(inventarioRef, (snapshot) => {
            _inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateRubroFilter();
            if (_ventaActual.cliente) {
                renderVentasInventario();
            }
        });

        _ventasActiveListeners.push(unsubClientes, unsubInventario);
    }
    
    /**
     * Popula el filtro de rubros.
     */
    function populateRubroFilter() {
        const rubroFilter = document.getElementById('rubroFilter');
        if(!rubroFilter) return;
        const rubros = [...new Set(_inventarioCache.map(p => p.rubro))].sort();
        const currentVal = rubroFilter.value;
        rubroFilter.innerHTML = '<option value="">Todos los Rubros</option>';
        rubros.forEach(rubro => {
             if(rubro) rubroFilter.innerHTML += `<option value="${rubro}">${rubro}</option>`;
        });
        // CORRECCIÓN: No restaurar el valor si no es una edición, para evitar el bug del filtro.
        if (!_originalVentaForEdit) {
            rubroFilter.value = currentVal;
        }
    }

    /**
     * Renderiza el dropdown de clientes.
     */
    function renderClienteDropdown(filteredClients) {
        const clienteDropdown = document.getElementById('clienteDropdown');
        if(!clienteDropdown) return;
        clienteDropdown.innerHTML = '';
        filteredClients.forEach(cliente => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = `${cliente.nombreComercial} (${cliente.nombrePersonal})`;
            item.addEventListener('click', () => selectCliente(cliente));
            clienteDropdown.appendChild(item);
        });
    }

    /**
     * Selecciona un cliente y muestra la tabla de inventario.
     */
    function selectCliente(cliente) {
        _ventaActual.cliente = cliente;
        document.getElementById('client-search-container').classList.add('hidden');
        document.getElementById('clienteDropdown').classList.add('hidden');
        document.getElementById('selected-client-name').textContent = cliente.nombreComercial;
        document.getElementById('client-display-container').classList.remove('hidden');
        document.getElementById('inventarioTableContainer').classList.remove('hidden');
        document.getElementById('venta-footer-section').classList.remove('hidden');
        renderVentasInventario();
    }
    
    /**
     * Cambia la moneda de visualización.
     */
    function toggleMoneda() {
        const cycle = ['USD', 'COP', 'Bs'];
        const rates = { 'USD': 1, 'COP': _tasaCOP, 'Bs': _tasaBs };
        
        let currentIndex = cycle.indexOf(_monedaActual);
        let nextIndex = (currentIndex + 1) % cycle.length;

        // Loop to find the next available currency with a valid rate
        while (nextIndex !== currentIndex) {
            if (rates[cycle[nextIndex]] > 0) {
                _monedaActual = cycle[nextIndex];
                renderVentasInventario();
                updateVentaTotal();
                return;
            }
            nextIndex = (nextIndex + 1) % cycle.length;
        }

        // If no other currency is available
        _showModal('Aviso', 'Ingresa al menos una tasa de cambio para poder alternar monedas.');
    }

    /**
     * Renderiza la vista de inventario para la venta con el orden personalizado.
     */
    async function renderVentasInventario() {
        const inventarioTableBody = document.getElementById('inventarioTableBody');
        const monedaIndicator = document.getElementById('monedaIndicator');
        const rubroFilter = document.getElementById('rubroFilter');

        if (!inventarioTableBody || !rubroFilter) return;
        if (monedaIndicator) {
             monedaIndicator.textContent = `(${_monedaActual})`;
        }
        inventarioTableBody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center text-gray-500">Cargando y ordenando...</td></tr>`;
        
        const selectedRubro = rubroFilter.value;
        const inventarioConStock = _inventarioCache.filter(p => p.cantidad > 0 || _ventaActual.productos[p.id]);
        let filteredInventario = selectedRubro ? inventarioConStock.filter(p => p.rubro === selectedRubro) : inventarioConStock;
        
        const segmentoOrderMap = await getSegmentoOrderMapVentas();
        if (segmentoOrderMap) {
            filteredInventario.sort((a, b) => {
                const orderA = segmentoOrderMap[a.segmento] ?? 9999;
                const orderB = segmentoOrderMap[b.segmento] ?? 9999;
                if (orderA !== orderB) return orderA - orderB;
                if ((a.marca || '').localeCompare(b.marca || '') !== 0) return (a.marca || '').localeCompare(b.marca || '');
                return a.presentacion.localeCompare(b.presentacion);
            });
        }

        inventarioTableBody.innerHTML = '';
        if (filteredInventario.length === 0) {
            inventarioTableBody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center">No hay productos que coincidan.</td></tr>`;
            return;
        }

        const isCerveceriaRubro = (selectedRubro === 'Cerveceria y Vinos');
        let currentSegmento = null;
        let currentMarca = null;

        filteredInventario.forEach(producto => {
            const segmento = producto.segmento || 'Sin Segmento';
            const marca = producto.marca || 'Sin Marca';

            if (segmento !== currentSegmento) {
                currentSegmento = segmento;
                currentMarca = null; 
                const segmentoRow = document.createElement('tr');
                segmentoRow.innerHTML = `<td colspan="4" class="py-1 px-2 bg-gray-100 font-bold text-gray-700 text-base">${currentSegmento}</td>`;
                inventarioTableBody.appendChild(segmentoRow);
            }

            if (isCerveceriaRubro && marca !== currentMarca) {
                currentMarca = marca;
                const marcaRow = document.createElement('tr');
                marcaRow.innerHTML = `<td colspan="4" class="py-1 px-4 bg-gray-50 font-semibold text-gray-600 text-sm">${currentMarca}</td>`;
                inventarioTableBody.appendChild(marcaRow);
            }
            
            const row = document.createElement('tr');
            row.classList.add('border-b', 'border-gray-200', 'hover:bg-gray-50');

            let precioMostrado;
            if (_monedaActual === 'COP') {
                const precioConvertido = producto.precio * _tasaCOP;
                const precioRedondeado = Math.ceil(precioConvertido / 100) * 100;
                precioMostrado = `COP ${precioRedondeado.toLocaleString('es-CO')}`;
            } else if (_monedaActual === 'Bs') {
                const precioConvertido = producto.precio * _tasaBs;
                precioMostrado = `Bs.S ${precioConvertido.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            } else {
                precioMostrado = `$${producto.precio.toFixed(2)}`;
            }
            
            const productName = `${producto.marca || ''} ${producto.presentacion}`;
            const originalQty = _originalVentaForEdit?.productos.find(p => p.id === producto.id)?.cantidadVendida || 0;
            const effectiveStock = producto.cantidad + originalQty;

            row.innerHTML = `
                <td class="py-2 px-1 text-center align-middle">
                    <input type="number" min="0" max="${effectiveStock}" value="${_ventaActual.productos[producto.id]?.cantidadVendida || 0}"
                           class="w-16 p-1.5 text-center border rounded-lg text-base" data-product-id="${producto.id}"
                           oninput="window.ventasModule.updateVentaCantidad(event)">
                </td>
                <td class="py-2 px-2 text-left align-middle">${productName} <span class="text-gray-500">(${producto.unidadTipo || 'und.'})</span></td>
                <td class="py-2 px-2 text-left price-toggle align-middle" onclick="window.ventasModule.toggleMoneda()">${precioMostrado}</td>
                <td class="py-2 px-2 text-center align-middle">${effectiveStock}</td>
            `;
            inventarioTableBody.appendChild(row);
        });
    }

    /**
     * Actualiza la cantidad de un producto y el total.
     */
    function updateVentaCantidad(event) {
        const { productId } = event.target.dataset;
        const input = event.target;
        const cantidad = parseInt(input.value, 10);
        const maxStock = parseInt(input.max, 10);
        
        if (cantidad > maxStock) {
            input.value = maxStock;
             _showModal('Stock Insuficiente', `La cantidad máxima para este producto es ${maxStock}.`);
        }
        
        const cantidadFinal = parseInt(input.value, 10);
        
        if (cantidadFinal > 0) {
            const producto = _inventarioCache.find(p => p.id === productId);
            _ventaActual.productos[productId] = { ...producto, cantidadVendida: cantidadFinal };
        } else {
            delete _ventaActual.productos[productId];
        }
        updateVentaTotal();
    };

    /**
     * Calcula y muestra el total de la venta.
     */
    function updateVentaTotal() {
        const totalEl = document.getElementById('ventaTotal');
        if(!totalEl) return;
        let total = Object.values(_ventaActual.productos).reduce((sum, p) => sum + (p.precio * p.cantidadVendida), 0);
        
        if (_monedaActual === 'COP') {
            const totalCOP = total * _tasaCOP;
            const totalRedondeado = Math.ceil(totalCOP / 100) * 100;
            totalEl.textContent = `Total: COP ${totalRedondeado.toLocaleString('es-CO')}`;
        } else if (_monedaActual === 'Bs') {
            const totalBs = total * _tasaBs;
            totalEl.textContent = `Total: Bs.S ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else {
            totalEl.textContent = `Total: $${total.toFixed(2)}`;
        }
    }
    
    /**
     * Crea el HTML para un ticket/factura (para compartir como imagen).
     */
    function createTicketHTML(venta, productos, tipo = 'ticket') {
        const fecha = venta.fecha ? venta.fecha.toDate().toLocaleDateString('es-ES') : new Date().toLocaleDateString('es-ES');
        const clienteNombre = venta.cliente ? venta.cliente.nombreComercial : venta.clienteNombre;
        const clienteNombrePersonal = (venta.cliente ? venta.cliente.nombrePersonal : venta.clienteNombrePersonal) || '';
        let total = 0;
        
        let productosHTML = productos.map(p => {
            const subtotal = p.precio * p.cantidadVendida;
            total += subtotal;
            return `
                <tr class="align-top">
                    <td class="py-2 pr-2 text-left" style="width: 60%;">
                        <div style="line-height: 1.2;">${(p.segmento || '')} ${(p.marca || '')} ${p.presentacion}</div>
                    </td>
                    <td class="py-2 text-center" style="width: 15%;">${p.cantidadVendida}</td>
                    <td class="py-2 pl-2 text-right" style="width: 25%;">$${subtotal.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        const titulo = tipo === 'factura' ? 'FACTURA FISCAL' : 'TICKET DE VENTA';

        return `
            <div id="temp-ticket-for-image" class="bg-white text-black p-4 uppercase font-bold" style="width: 768px; font-family: 'Courier New', Courier, monospace;">
                <div class="text-center">
                    <h2 class="text-5xl">${titulo}</h2>
                    <p class="text-4xl">DISTRIBUIDORA CASTILLO YAÑEZ</p>
                </div>
                <div class="text-3xl mt-8">
                    <p>FECHA: ${fecha}</p>
                    <p>CLIENTE: ${clienteNombre}</p>
                </div>
                <table class="w-full text-3xl mt-6">
                    <thead>
                        <tr>
                            <th class="pb-2 text-left">PRODUCTO</th>
                            <th class="pb-2 text-center">CANT.</th>
                            <th class="pb-2 text-right">SUBTOTAL</th>
                        </tr>
                    </thead>
                    <tbody>${productosHTML}</tbody>
                </table>
                <div class="text-right text-4xl mt-6 border-t border-black border-dashed pt-4">
                    <p>TOTAL: $${total.toFixed(2)}</p>
                </div>
                <div class="text-center mt-16">
                    <p class="border-t border-black w-96 mx-auto"></p>
                    <p class="mt-4 text-3xl">${clienteNombrePersonal}</p>
                </div>
                <hr class="border-dashed border-black mt-6">
            </div>
        `;
    }

    /**
     * Crea un string de texto plano optimizado para impresoras térmicas.
     */
    function createRawTextTicket(venta, productos, tipo = 'ticket') {
        const fecha = venta.cliente ? new Date().toLocaleDateString('es-ES') : venta.fecha.toDate().toLocaleDateString('es-ES');
        const clienteNombre = (venta.cliente ? venta.cliente.nombreComercial : venta.clienteNombre).toUpperCase();
        const clienteNombrePersonal = ((venta.cliente ? venta.cliente.nombrePersonal : venta.clienteNombrePersonal) || '').toUpperCase();
        const LINE_WIDTH = 32;

        let total = 0;
        let ticket = '';

        const center = (text) => text.padStart(Math.floor(LINE_WIDTH / 2 + text.length / 2), ' ').padEnd(LINE_WIDTH, ' ');
        const createRow = (col1, col2, col3) => {
            const C1_WIDTH = 3;
            const C2_WIDTH = 19;
            const C3_WIDTH = 10;
            return `${col1.padEnd(C1_WIDTH)}${col2.padEnd(C2_WIDTH)}${col3.padStart(C3_WIDTH)}\n`;
        };

        ticket += center(tipo === 'factura' ? 'FACTURA FISCAL' : 'TICKET DE VENTA') + '\n';
        ticket += center('DISTRIBUIDORA CASTILLO YAÑEZ') + '\n\n';
        ticket += `FECHA: ${fecha}\n`;
        ticket += `CLIENTE: ${clienteNombre}\n`;
        ticket += '-'.repeat(LINE_WIDTH) + '\n';
        ticket += createRow('CANT', 'PRODUCTO', 'SUBTOTAL');
        ticket += '-'.repeat(LINE_WIDTH) + '\n';
        
        productos.forEach(p => {
            const subtotal = p.precio * p.cantidadVendida;
            total += subtotal;
            const productName = `${p.segmento || ''} ${p.marca || ''} ${p.presentacion}`.toUpperCase();
            const quantity = p.cantidadVendida.toString();
            const subtotalStr = `$${subtotal.toFixed(2)}`;

            const lines = [];
            let tempName = productName;
            while(tempName.length > 19) {
                let breakPoint = tempName.lastIndexOf(' ', 19);
                if (breakPoint === -1) breakPoint = 19;
                lines.push(tempName.substring(0, breakPoint));
                tempName = tempName.substring(breakPoint).trim();
            }
            lines.push(tempName);

            lines.forEach((line, index) => {
                if (index === 0) {
                    ticket += createRow(quantity, line, (lines.length === 1) ? subtotalStr : '');
                } else {
                    ticket += createRow('', line, (index === lines.length - 1) ? subtotalStr : '');
                }
            });
        });

        ticket += '-'.repeat(LINE_WIDTH) + '\n';
        const totalString = `TOTAL: $${total.toFixed(2)}`;
        ticket += totalString.padStart(LINE_WIDTH, ' ') + '\n\n';
        
        ticket += '\n\n\n\n';
        
        ticket += center('________________________') + '\n';
        ticket += center(clienteNombrePersonal) + '\n\n';
        ticket += '-'.repeat(LINE_WIDTH) + '\n';

        return ticket;
    }

    /**
     * Maneja la compartición de la imagen del ticket.
     */
    async function handleShareTicket(htmlContent, successCallback) {
        _showModal('Progreso', 'Generando imagen...');
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '0';
        tempDiv.innerHTML = htmlContent;
        document.body.appendChild(tempDiv);
        
        const ticketElement = document.getElementById('temp-ticket-for-image');
        if (!ticketElement) {
            _showModal('Error', 'No se pudo encontrar el elemento del ticket para generar la imagen.');
            document.body.removeChild(tempDiv);
            return;
        }

        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            const canvas = await html2canvas(ticketElement, { scale: 3 });
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

            if (navigator.share && blob) {
                await navigator.share({ files: [new File([blob], "ticket.png", { type: "image/png" })], title: "Ticket de Venta" });
                _showModal('Éxito', 'Venta registrada. Imagen compartida.', successCallback);
            } else {
                 _showModal('Error', 'La función de compartir no está disponible.', successCallback);
            }
        } catch(e) {
            _showModal('Error', `No se pudo generar la imagen. ${e.message}`, successCallback);
        } finally {
            document.body.removeChild(tempDiv);
        }
    }

    /**
     * Maneja la compartición del ticket como texto plano.
     */
    async function handleShareRawText(textContent, successCallback) {
        if (navigator.share) {
            try {
                await navigator.share({ title: 'Ticket de Venta', text: textContent });
                _showModal('Éxito', 'Venta registrada. El ticket está listo para imprimir.', successCallback);
            } catch (err) {
                 _showModal('Aviso', 'No se compartió el ticket, pero la venta fue registrada.', successCallback);
            }
        } else {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = textContent;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                _showModal('Copiado', 'Texto del ticket copiado. Pégalo en tu app de impresión.', successCallback);
            } catch (copyErr) {
                 _showModal('Error', 'No se pudo compartir ni copiar el ticket. La venta fue registrada.', successCallback);
            }
        }
    }

    /**
     * Muestra un modal para elegir entre imprimir (texto) o compartir (imagen).
     */
    function showSharingOptions(venta, productos, tipo, successCallback) {
        const modalContent = `
            <div class="text-center">
                <h3 class="text-xl font-bold text-gray-800 mb-4">¿Qué deseas hacer?</h3>
                <p class="text-gray-600 mb-6">Elige el formato para tu ${tipo}.</p>
                <div class="space-y-4">
                    <button id="printTextBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Imprimir (Texto)</button>
                    <button id="shareImageBtn" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Compartir (Imagen)</button>
                </div>
            </div>`;
        
        _showModal('Elige una opción', modalContent, null, '');

        document.getElementById('printTextBtn').addEventListener('click', () => {
            const rawTextTicket = createRawTextTicket(venta, productos, tipo);
            handleShareRawText(rawTextTicket, successCallback);
        });

        document.getElementById('shareImageBtn').addEventListener('click', () => {
            const ticketHTML = createTicketHTML(venta, productos, tipo);
            handleShareTicket(ticketHTML, successCallback);
        });
    }

    /**
     * Genera un ticket y guarda la venta.
     */
    async function generarTicket() {
        if (!_ventaActual.cliente) {
            _showModal('Error', 'Debe seleccionar un cliente para generar el ticket.');
            return;
        }
        const productosVendidos = Object.values(_ventaActual.productos);
        if (productosVendidos.length === 0) {
            _showModal('Error', 'Debe agregar al menos un producto para vender.');
            return;
        }

        _showModal('Confirmar Venta', '¿Deseas guardar esta venta?', async () => {
            _showModal('Progreso', 'Procesando venta...');
            try {
                const batch = _writeBatch(_db);
                const ventaRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`));
                let totalVenta = 0;
                const itemsVenta = [];

                for (const p of productosVendidos) {
                    const productoEnCache = _inventarioCache.find(item => item.id === p.id);
                    if (!productoEnCache || productoEnCache.cantidad < p.cantidadVendida) {
                        throw new Error(`Stock insuficiente para ${p.presentacion}.`);
                    }
                    const productoRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, p.id);
                    const nuevoStock = productoEnCache.cantidad - p.cantidadVendida;
                    batch.update(productoRef, { cantidad: nuevoStock });
                    totalVenta += p.precio * p.cantidadVendida;
                    itemsVenta.push({ id: p.id, presentacion: p.presentacion, marca: p.marca ?? null, segmento: p.segmento ?? null, rubro: p.rubro ?? null, precio: p.precio, cantidadVendida: p.cantidadVendida, iva: p.iva ?? 0, unidadTipo: p.unidadTipo ?? 'und.' });
                }

                const ventaData = {
                    clienteId: _ventaActual.cliente.id,
                    clienteNombre: _ventaActual.cliente.nombreComercial || _ventaActual.cliente.nombrePersonal || 'N/A',
                    clienteNombrePersonal: _ventaActual.cliente.nombrePersonal || '',
                    fecha: new Date(),
                    total: totalVenta,
                    productos: itemsVenta
                };
                batch.set(ventaRef, ventaData);
                await batch.commit();

                // Show sharing options after saving the sale
                showSharingOptions(_ventaActual, productosVendidos, 'ticket', showNuevaVentaView);

            } catch (e) {
                _showModal('Error', `Hubo un error al procesar la venta: ${e.message}`);
            }
        }, 'Sí, Guardar');
    }

    /**
     * Muestra la vista de ventas totales.
     */
    function showVentasTotalesView() {
        cleanupVentasListeners();
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">Ventas Totales</h2>
                        <div class="space-y-4">
                            <button id="ventasActualesBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600">Ventas Actuales</button>
                            <button id="cierreVentasBtn" class="w-full px-6 py-3 bg-red-500 text-white font-semibold rounded-lg shadow-md hover:bg-red-600">Cierre de Ventas</button>
                        </div>
                        <button id="backToVentasBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('ventasActualesBtn').addEventListener('click', showVentasActualesView);
        document.getElementById('cierreVentasBtn').addEventListener('click', showCierreSubMenuView);
        document.getElementById('backToVentasBtn').addEventListener('click', showVentasView);
    }
    
    /**
     * Muestra la vista con la lista de todas las ventas actuales.
     */
    function showVentasActualesView() {
        cleanupVentasListeners();
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 w-full">
                <div class="bg-white/90 backdrop-blur-sm p-6 rounded-lg shadow-xl">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-800">Ventas Actuales</h2>
                        <button id="backToVentasTotalesBtn" class="px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                    <div id="ventasListContainer" class="overflow-x-auto"><p class="text-gray-500 text-center">Cargando ventas...</p></div>
                </div>
            </div>
        `;
        document.getElementById('backToVentasTotalesBtn').addEventListener('click', showVentasTotalesView);
        renderVentasList();
    }

    /**
     * Renderiza la lista de ventas en el DOM.
     */
    function renderVentasList() {
        const container = document.getElementById('ventasListContainer');
        if (!container) return;

        const ventasRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`);
        const q = _query(ventasRef);
        const unsubscribe = _onSnapshot(q, (snapshot) => {
            _ventasGlobal = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            _ventasGlobal.sort((a, b) => b.fecha.toDate() - a.fecha.toDate());

            if (_ventasGlobal.length === 0) {
                container.innerHTML = `<p class="text-center text-gray-500">No hay ventas registradas.</p>`;
                return;
            }

            let tableHTML = `
                <table class="min-w-full bg-white text-sm">
                    <thead class="bg-gray-200">
                        <tr>
                            <th class="py-2 px-3 border-b text-left">Cliente</th>
                            <th class="py-2 px-3 border-b text-left">Fecha</th>
                            <th class="py-2 px-3 border-b text-right">Total</th>
                            <th class="py-2 px-3 border-b text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            _ventasGlobal.forEach(venta => {
                tableHTML += `
                    <tr class="hover:bg-gray-50">
                        <td class="py-2 px-3 border-b align-middle">${venta.clienteNombre}</td>
                        <td class="py-2 px-3 border-b align-middle">${venta.fecha.toDate().toLocaleDateString('es-ES')}</td>
                        <td class="py-2 px-3 border-b text-right font-semibold align-middle">$${venta.total.toFixed(2)}</td>
                        <td class="py-2 px-3 border-b">
                            <div class="flex flex-col items-center space-y-1">
                                <button onclick="window.ventasModule.showPastSaleOptions('${venta.id}', 'ticket')" class="w-full px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600">Compartir</button>
                                <button onclick="window.ventasModule.editVenta('${venta.id}')" class="w-full px-3 py-1.5 bg-yellow-500 text-white text-xs font-semibold rounded-lg hover:bg-yellow-600">Editar</button>
                                <button onclick="window.ventasModule.deleteVenta('${venta.id}')" class="w-full px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600">Eliminar</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
            tableHTML += `</tbody></table>`;
            container.innerHTML = tableHTML;
        }, (error) => {
            console.error("Error cargando ventas: ", error);
            container.innerHTML = `<p class="text-center text-red-500">Error al cargar las ventas.</p>`;
        });
        _ventasActiveListeners.push(unsubscribe);
    }
    
    /**
     * Muestra el submenú de opciones para el cierre de ventas.
     */
    function showCierreSubMenuView() {
        cleanupVentasListeners();
         _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">Cierre de Ventas</h2>
                        <div class="space-y-4">
                            <button id="verCierreBtn" class="w-full px-6 py-3 bg-cyan-500 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-600">Ver Cierre</button>
                            <button id="ejecutarCierreBtn" class="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700">Ejecutar Cierre</button>
                        </div>
                        <button id="backToVentasTotalesBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('verCierreBtn').addEventListener('click', showVerCierreView);
        document.getElementById('ejecutarCierreBtn').addEventListener('click', ejecutarCierre);
        document.getElementById('backToVentasTotalesBtn').addEventListener('click', showVentasTotalesView);
    }

    /**
     * Procesa los datos de ventas para generar la estructura del reporte.
     */
    function processSalesDataForReport(ventas) {
        const clientData = {};
        let grandTotalValue = 0;
        
        const allProductsMap = new Map();

        ventas.forEach(venta => {
            const clientName = venta.clienteNombre;
            if (!clientData[clientName]) {
                clientData[clientName] = { products: {}, totalValue: 0 };
            }
            
            clientData[clientName].totalValue += venta.total;
            grandTotalValue += venta.total;

            venta.productos.forEach(p => {
                const productName = p.presentacion;
                if (!allProductsMap.has(productName)) {
                    allProductsMap.set(productName, {
                        segmento: p.segmento || 'Sin Segmento',
                        marca: p.marca || 'Sin Marca',
                        presentacion: p.presentacion
                    });
                }
                
                if (!clientData[clientName].products[productName]) {
                    clientData[clientName].products[productName] = 0;
                }
                clientData[clientName].products[productName] += p.cantidadVendida;
            });
        });

        const sortedClients = Object.keys(clientData).sort();

        const groupedProducts = {};
        for (const product of allProductsMap.values()) {
            if (!groupedProducts[product.segmento]) {
                groupedProducts[product.segmento] = {};
            }
            if (!groupedProducts[product.segmento][product.marca]) {
                groupedProducts[product.segmento][product.marca] = [];
            }
            groupedProducts[product.segmento][product.marca].push(product.presentacion);
        }

        const finalProductOrder = [];
        const sortedSegmentos = Object.keys(groupedProducts).sort();
        sortedSegmentos.forEach(segmento => {
            const sortedMarcas = Object.keys(groupedProducts[segmento]).sort();
            groupedProducts[segmento].sortedMarcas = sortedMarcas;
            sortedMarcas.forEach(marca => {
                const sortedPresentaciones = groupedProducts[segmento][marca].sort();
                groupedProducts[segmento][marca] = sortedPresentaciones;
                finalProductOrder.push(...sortedPresentaciones);
            });
        });

        return { clientData, grandTotalValue, sortedClients, groupedProducts, finalProductOrder, sortedSegmentos };
    }
    
    /**
     * Muestra una vista previa del reporte de cierre de ventas.
     */
    async function showVerCierreView() {
        _showModal('Progreso', 'Generando reporte de cierre...');
        const ventasSnapshot = await _getDocs(_collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`));
        const ventas = ventasSnapshot.docs.map(doc => doc.data());

        if (ventas.length === 0) {
            _showModal('Aviso', 'No hay ventas para generar un cierre.');
            return;
        }

        const { clientData, grandTotalValue, sortedClients, groupedProducts, finalProductOrder, sortedSegmentos } = processSalesDataForReport(ventas);

        let headerRow1 = `<tr class="sticky top-0"><th rowspan="3" class="p-2 border-b border-gray-300 bg-gray-200 sticky left-0 z-10">Cliente</th>`;
        let headerRow2 = `<tr class="sticky" style="top: 36px;">`;
        let headerRow3 = `<tr class="sticky" style="top: 72px;">`;

        sortedSegmentos.forEach(segmento => {
            let segmentoColspan = 0;
            groupedProducts[segmento].sortedMarcas.forEach(marca => {
                segmentoColspan += groupedProducts[segmento][marca].length;
            });
            headerRow1 += `<th colspan="${segmentoColspan}" class="p-2 border-b border-l border-gray-300 bg-gray-200">${segmento}</th>`;
            
            groupedProducts[segmento].sortedMarcas.forEach(marca => {
                const marcaColspan = groupedProducts[segmento][marca].length;
                headerRow2 += `<th colspan="${marcaColspan}" class="p-2 border-b border-l border-gray-300 bg-gray-100">${marca}</th>`;
                
                groupedProducts[segmento][marca].forEach(presentacion => {
                    headerRow3 += `<th class="p-2 border-b border-l border-gray-300 bg-gray-50 whitespace-nowrap">${presentacion}</th>`;
                });
            });
        });
        headerRow1 += `<th rowspan="3" class="p-2 border-b border-gray-300 bg-gray-200 sticky right-0 z-10">Total Cliente</th></tr>`;
        headerRow2 += `</tr>`;
        headerRow3 += `</tr>`;

        let bodyHTML = '';
        sortedClients.forEach(clientName => {
            bodyHTML += `<tr class="hover:bg-blue-50"><td class="p-2 border-b border-gray-300 font-medium bg-white sticky left-0">${clientName}</td>`;
            const currentClient = clientData[clientName];
            finalProductOrder.forEach(productName => {
                const quantity = currentClient.products[productName] || 0;
                bodyHTML += `<td class="p-2 border-b border-l border-gray-300 text-center">${quantity > 0 ? quantity : ''}</td>`;
            });
            bodyHTML += `<td class="p-2 border-b border-gray-300 text-right font-semibold bg-white sticky right-0">$${currentClient.totalValue.toFixed(2)}</td></tr>`;
        });
        
        let footerHTML = '<tr class="bg-gray-200 font-bold"><td class="p-2 border-b border-gray-300 sticky left-0">TOTALES</td>';
        finalProductOrder.forEach(productName => {
            let totalQty = 0;
            sortedClients.forEach(clientName => {
                totalQty += clientData[clientName].products[productName] || 0;
            });
            footerHTML += `<td class="p-2 border-b border-l border-gray-300 text-center">${totalQty}</td>`;
        });
        footerHTML += `<td class="p-2 border-b border-gray-300 text-right sticky right-0">$${grandTotalValue.toFixed(2)}</td></tr>`;
        
        const reporteHTML = `
            <div class="text-left max-h-[80vh] overflow-auto">
                <h3 class="text-xl font-bold text-gray-800 mb-4">Reporte de Cierre de Ventas</h3>
                <div class="overflow-auto border border-gray-300">
                    <table class="min-w-full bg-white text-xs">
                        <thead class="bg-gray-200">${headerRow1}${headerRow2}${headerRow3}</thead>
                        <tbody>${bodyHTML}</tbody>
                        <tfoot>${footerHTML}</tfoot>
                    </table>
                </div>
            </div>`;
        _showModal('Reporte de Cierre', reporteHTML);
    }

    /**
     * Genera y descarga un archivo de Excel con el reporte de cierre.
     */
    async function exportCierreToExcel(ventas) {
        if (typeof XLSX === 'undefined') {
            _showModal('Error', 'La librería para exportar a Excel no está cargada.');
            return;
        }

        const { clientData, grandTotalValue, sortedClients, groupedProducts, finalProductOrder, sortedSegmentos } = processSalesDataForReport(ventas);

        const dataForSheet = [];
        const merges = [];
        
        const headerRow1 = [""];
        const headerRow2 = [""];
        const headerRow3 = ["Cliente"];
        
        let currentColumn = 1;
        sortedSegmentos.forEach(segmento => {
            const segmentoStartCol = currentColumn;
            let segmentoColspan = 0;
            groupedProducts[segmento].sortedMarcas.forEach(marca => {
                const marcaStartCol = currentColumn;
                const presentaciones = groupedProducts[segmento][marca];
                segmentoColspan += presentaciones.length;
                
                headerRow2.push(marca);
                for (let i = 1; i < presentaciones.length; i++) headerRow2.push("");
                if (presentaciones.length > 1) {
                    merges.push({ s: { r: 1, c: marcaStartCol }, e: { r: 1, c: marcaStartCol + presentaciones.length - 1 } });
                }
                
                presentaciones.forEach(p => {
                    headerRow3.push(p);
                });
                currentColumn += presentaciones.length;
            });
            headerRow1.push(segmento);
            for (let i = 1; i < segmentoColspan; i++) headerRow1.push("");
            if (segmentoColspan > 1) {
                merges.push({ s: { r: 0, c: segmentoStartCol }, e: { r: 0, c: segmentoStartCol + segmentoColspan - 1 } });
            }
        });
        
        headerRow1.push("");
        headerRow2.push("");
        headerRow3.push("Total Cliente");
        dataForSheet.push(headerRow1, headerRow2, headerRow3);

        merges.push({ s: { r: 0, c: 0 }, e: { r: 2, c: 0 } });
        merges.push({ s: { r: 0, c: finalProductOrder.length + 1 }, e: { r: 2, c: finalProductOrder.length + 1 } });

        sortedClients.forEach(clientName => {
            const row = [clientName];
            const currentClient = clientData[clientName];
            finalProductOrder.forEach(productName => {
                row.push(currentClient.products[productName] || 0);
            });
            row.push(currentClient.totalValue);
            dataForSheet.push(row);
        });

        const footerRow = ["TOTALES"];
        finalProductOrder.forEach(productName => {
            let totalQty = 0;
            sortedClients.forEach(clientName => {
                totalQty += clientData[clientName].products[productName] || 0;
            });
            footerRow.push(totalQty);
        });
        footerRow.push(grandTotalValue);
        dataForSheet.push(footerRow);

        const ws = XLSX.utils.aoa_to_sheet(dataForSheet);
        ws['!merges'] = merges;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Reporte de Cierre');
        
        const today = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `Reporte_Cierre_Ventas_${today}.xlsx`);
    }

    /**
     * Ejecuta el cierre de ventas: archiva, crea transacciones CXC y elimina.
     */
    function ejecutarCierre() {
        _showModal('Confirmar Cierre Definitivo', 
            'Esta acción generará un reporte en Excel, registrará las ventas en CXC, y luego archivará y eliminará las ventas actuales. No se puede deshacer. ¿Continuar?', 
            async () => {
                
                const ventasRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/ventas`);
                const ventasSnapshot = await _getDocs(ventasRef);
                const ventas = ventasSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                
                if (ventas.length === 0) {
                    _showModal('Aviso', 'No hay ventas para cerrar.');
                    return;
                }

                try {
                    await exportCierreToExcel(ventas);
                    _showModal('Progreso', 'Reporte Excel generado. Ahora procesando el cierre y actualizando CXC...');

                    const batch = _writeBatch(_db);
                    
                    // **CORRECCIÓN**: Sanear los datos de ventas antes de archivarlos.
                    const sanitizedVentas = ventas.map(venta => {
                        const { id, ...rest } = venta;
                        const sanitizedVenta = { ...rest };
                        // Asegurarse de que los campos potencialmente indefinidos tengan un valor predeterminado.
                        sanitizedVenta.clienteNombrePersonal = sanitizedVenta.clienteNombrePersonal || '';
                        sanitizedVenta.productos = sanitizedVenta.productos.map(p => ({
                            ...p,
                            rubro: p.rubro || null,
                            segmento: p.segmento || null,
                            marca: p.marca || null
                        }));
                        return sanitizedVenta;
                    });

                    // Archivar el cierre con datos saneados
                    const cierreRef = _doc(_collection(_db, `artifacts/${_appId}/users/${_userId}/cierres`));
                    batch.set(cierreRef, {
                        fecha: new Date(),
                        ventas: sanitizedVentas,
                        total: ventas.reduce((sum, v) => sum + v.total, 0)
                    });

                    // Crear transacciones CXC
                    const cxcTransRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/cxc_transacciones`);
                    ventas.forEach(venta => {
                        const beerProducts = venta.productos.filter(p => p.rubro === 'Cerveceria y Vinos');
                        const otherProducts = venta.productos.filter(p => p.rubro !== 'Cerveceria y Vinos');

                        if (beerProducts.length > 0) {
                            const beerTotal = beerProducts.reduce((sum, p) => sum + (p.precio * p.cantidadVendida), 0);
                            const newDocRef = _doc(cxcTransRef);
                            batch.set(newDocRef, {
                                clienteId: venta.clienteId,
                                ventaId: venta.id,
                                fecha: venta.fecha,
                                tipo: 'venta',
                                monto: beerTotal,
                                descripcion: `Venta Cervecería #${venta.id.substring(0, 5)}`,
                                rubros: ['Cerveceria y Vinos']
                            });
                        }
            
                        if (otherProducts.length > 0) {
                            const otherTotal = otherProducts.reduce((sum, p) => sum + (p.precio * p.cantidadVendida), 0);
                            const allOtherRubros = [...new Set(otherProducts.map(p => p.rubro))];
                            const newDocRef = _doc(cxcTransRef);
                            batch.set(newDocRef, {
                                clienteId: venta.clienteId,
                                ventaId: venta.id,
                                fecha: venta.fecha,
                                tipo: 'venta',
                                monto: otherTotal,
                                descripcion: `Venta General #${venta.id.substring(0, 5)}`,
                                rubros: allOtherRubros
                            });
                        }
                    });

                    // Eliminar las ventas actuales
                    ventas.forEach(venta => {
                        batch.delete(_doc(ventasRef, venta.id));
                    });
                    
                    await batch.commit();

                    _showModal('Éxito', 'El cierre de ventas se ha completado y CXC ha sido actualizado.', showVentasTotalesView);
                } catch(e) {
                    console.error("Error durante el cierre:", e);
                    _showModal('Error', `Ocurrió un error durante el cierre: ${e.message}`);
                }
            },
            'Sí, Ejecutar Cierre'
        );
    }
    
     /**
      * Muestra las opciones para una venta pasada (imprimir o compartir).
      */
    function showPastSaleOptions(ventaId, tipo = 'ticket') {
        const venta = _ventasGlobal.find(v => v.id === ventaId);
        if (venta) {
            showSharingOptions(venta, venta.productos, tipo, () => {});
        } else {
            _showModal('Error', 'No se encontró la venta seleccionada.');
        }
    }

    /**
     * Inicia la edición de una venta existente.
     */
    function editVenta(ventaId) {
        cleanupVentasListeners();
        const venta = _ventasGlobal.find(v => v.id === ventaId);
        if (!venta) {
            _showModal('Error', 'No se pudo encontrar la venta para editar.');
            return;
        }
        _originalVentaForEdit = venta;
        showEditVentaView(venta);
    }

    /**
     * Inicia la eliminación de una venta existente.
     */
    function deleteVenta(ventaId) {
        const venta = _ventasGlobal.find(v => v.id === ventaId);
        if (!venta) {
            _showModal('Error', 'No se pudo encontrar la venta para eliminar.');
            return;
        }

        _showModal(
            'Confirmar Eliminación',
            `¿Estás seguro de que deseas eliminar la venta a "${venta.clienteNombre}"? Esta acción no se puede deshacer y el stock de los productos será devuelto al inventario.`,
            async () => {
                _showModal('Progreso', 'Eliminando venta y restaurando stock...');
                try {
                    const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
                    const snapshot = await _getDocs(inventarioRef);
                    _inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    const batch = _writeBatch(_db);

                    // Devolver el stock al inventario
                    for (const productoVendido of venta.productos) {
                        const productoEnCache = _inventarioCache.find(p => p.id === productoVendido.id);
                        if (productoEnCache) {
                            const nuevoStock = productoEnCache.cantidad + productoVendido.cantidadVendida;
                            const productoRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, productoVendido.id);
                            batch.update(productoRef, { cantidad: nuevoStock });
                        } else {
                            console.warn(`El producto "${productoVendido.presentacion}" (ID: ${productoVendido.id}) no fue encontrado en el inventario. No se pudo restaurar su stock.`);
                        }
                    }

                    // Eliminar el documento de la venta
                    const ventaRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/ventas`, ventaId);
                    batch.delete(ventaRef);

                    // Ejecutar la transacción
                    await batch.commit();

                    _showModal('Éxito', 'La venta ha sido eliminada y el stock restaurado.');

                } catch (error) {
                    _showModal('Error', `Hubo un error al eliminar la venta: ${error.message}`);
                }
            },
            'Sí, Eliminar'
        );
    }
    
    /**
     * Muestra la vista para editar una venta.
     */
    async function showEditVentaView(venta) {
        _floatingControls.classList.add('hidden');
        _monedaActual = 'USD';
        
        _mainContent.innerHTML = `
            <div class="p-2 sm:p-4 w-full">
                <div class="bg-white/90 backdrop-blur-sm p-4 sm:p-6 rounded-lg shadow-xl flex flex-col h-full" style="min-height: calc(100vh - 2rem);">
                    <div id="venta-header-section" class="mb-4">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-xl font-bold text-gray-800">Editando Venta</h2>
                            <button id="backToVentasBtn" class="px-4 py-2 bg-gray-400 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                        <div class="flex-wrap items-center justify-between gap-4 p-4 bg-gray-100 rounded-lg">
                            <p class="text-gray-700"><span class="font-medium">Cliente:</span> <span class="font-bold">${venta.clienteNombre}</span></p>
                        </div>
                    </div>
                    <div id="inventarioTableContainer" class="animate-fade-in flex-grow flex flex-col overflow-hidden">
                         <div class="flex justify-between items-center mb-2">
                            <h3 class="text-lg font-semibold text-gray-800">Inventario</h3>
                             <div id="rubro-filter-container" class="w-1/2">
                                 <select id="rubroFilter" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos los Rubros</option></select>
                             </div>
                         </div>
                        <div class="overflow-auto flex-grow rounded-lg shadow">
                            <table class="min-w-full bg-white text-xs"><thead class="bg-gray-200 sticky top-0"><tr class="text-gray-700 uppercase leading-normal"><th class="py-2 px-1 text-center">Cant.</th><th class="py-2 px-2 text-left">Producto</th><th class="py-2 px-2 text-left">Precio</th><th class="py-2 px-1 text-center">Stock</th></tr></thead><tbody id="inventarioTableBody" class="text-gray-600 font-light"></tbody></table>
                        </div>
                    </div>
                    <div id="venta-footer-section" class="mt-4 flex items-center justify-between">
                        <span id="ventaTotal" class="text-lg font-bold text-gray-800">Total: $0.00</span>
                         <button id="saveChangesBtn" class="px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Guardar Cambios</button>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('rubroFilter').addEventListener('change', renderVentasInventario);
        document.getElementById('saveChangesBtn').addEventListener('click', handleGuardarVentaEditada);
        document.getElementById('backToVentasBtn').addEventListener('click', showVentasActualesView);

        _showModal('Progreso', 'Cargando datos para edición...');
        try {
            const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
            const snapshot = await _getDocs(inventarioRef);
            _inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            _ventaActual = {
                cliente: { id: venta.clienteId, nombreComercial: venta.clienteNombre, nombrePersonal: venta.clienteNombrePersonal },
                productos: venta.productos.reduce((acc, p) => {
                    const productoCompleto = _inventarioCache.find(inv => inv.id === p.id) || p;
                    acc[p.id] = { ...productoCompleto, cantidadVendida: p.cantidadVendida };
                    return acc;
                }, {})
            };
            
            populateRubroFilter();
            document.getElementById('rubroFilter').value = ''; 
            
            renderVentasInventario();
            updateVentaTotal();

            const modalContainer = document.getElementById('modalContainer');
            if (modalContainer) modalContainer.classList.add('hidden');

        } catch (error) {
            _showModal('Error', `No se pudo cargar la información para editar: ${error.message}`);
        }
    }
    
    /**
     * Guarda los cambios de una venta editada y ajusta el stock de forma atómica.
     */
    async function handleGuardarVentaEditada() {
        if (!_originalVentaForEdit) {
            _showModal('Error', 'No se pudo encontrar la venta original para guardar los cambios.');
            return;
        }

        _showModal('Confirmar Cambios', '¿Estás seguro de que deseas guardar los cambios en esta venta? El stock del inventario se ajustará automáticamente.', async () => {
            _showModal('Progreso', 'Guardando cambios y ajustando stock...');

            try {
                // Mapa de cantidades originales: { productId: quantity }
                const originalQuantities = new Map(
                    _originalVentaForEdit.productos.map(p => [p.id, p.cantidadVendida])
                );

                // Mapa de nuevas cantidades: { productId: quantity }
                const newQuantities = new Map(
                    Object.values(_ventaActual.productos).map(p => [p.id, p.cantidadVendida])
                );
                
                // Obtener todos los IDs de productos únicos de la venta original y la nueva
                const allProductIds = new Set([
                    ...originalQuantities.keys(),
                    ...newQuantities.keys()
                ]);

                const batch = _writeBatch(_db);

                // 1. Calcular cambios de stock y validar que sean posibles
                for (const productId of allProductIds) {
                    const originalQty = originalQuantities.get(productId) || 0;
                    const newQty = newQuantities.get(productId) || 0;
                    const stockDelta = originalQty - newQty; // Positivo: devolver al stock, Negativo: tomar del stock

                    if (stockDelta === 0) continue; // No hay cambios para este producto

                    const productoEnCache = _inventarioCache.find(p => p.id === productId);
                    if (!productoEnCache) {
                        console.warn(`Producto con ID ${productId} no encontrado en inventario. No se ajustará el stock.`);
                        continue;
                    }
                    
                    const finalStock = productoEnCache.cantidad + stockDelta;

                    if (finalStock < 0) {
                        throw new Error(`Stock insuficiente para "${productoEnCache.presentacion}".`);
                    }

                    const productoRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, productId);
                    batch.update(productoRef, { cantidad: finalStock });
                }

                // 2. Actualizar el documento de la venta con los nuevos datos
                const nuevosProductosVendidos = Object.values(_ventaActual.productos);
                const nuevoTotal = nuevosProductosVendidos.reduce((sum, p) => sum + (p.precio * p.cantidadVendida), 0);
                const nuevosItemsVenta = nuevosProductosVendidos.map(p => ({
                    id: p.id, presentacion: p.presentacion, marca: p.marca ?? null, segmento: p.segmento ?? null, rubro: p.rubro ?? null,
                    precio: p.precio, cantidadVendida: p.cantidadVendida, iva: p.iva ?? 0, unidadTipo: p.unidadTipo ?? 'und.'
                }));

                const ventaRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/ventas`, _originalVentaForEdit.id);
                batch.update(ventaRef, {
                    productos: nuevosItemsVenta,
                    total: nuevoTotal,
                    fechaModificacion: new Date() // Es buena práctica guardar la fecha de modificación
                });

                // 3. Ejecutar todos los cambios en la base de datos
                await batch.commit();
                
                _originalVentaForEdit = null; // Limpiar el estado de edición
                _showModal('Éxito', 'La venta se ha actualizado correctamente.', showVentasActualesView);

            } catch (error) {
                _showModal('Error', `Hubo un error al guardar los cambios: ${error.message}`);
            }
        });
    }


    // Exponer funciones públicas al objeto window
    window.ventasModule = {
        toggleMoneda,
        updateVentaCantidad,
        showPastSaleOptions,
        editVenta,
        deleteVenta,
        invalidateCache: () => { _segmentoOrderCacheVentas = null; }
    };
})();

