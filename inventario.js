// --- Lógica del módulo de Inventario ---

(function() {
    // Variables locales del módulo que se inicializarán desde index.html
    let _db, _userId, _appId, _mainContent, _floatingControls, _activeListeners;
    let _showMainMenu, _showModal, _showAddItemModal, _populateDropdown;
    let _collection, _onSnapshot, _doc, _addDoc, _setDoc, _deleteDoc, _query, _where, _getDocs, _writeBatch;
    
    let _inventarioCache = []; // Caché local para búsquedas y ediciones rápidas
    let _lastFilters = { searchTerm: '', rubro: '', segmento: '', marca: '' }; // Objeto para persistir los filtros
    let _segmentoOrderCache = null; // Caché para el orden de los segmentos

    /**
     * Inicializa el módulo con las dependencias necesarias desde la app principal.
     */
    window.initInventario = function(dependencies) {
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
        _addDoc = dependencies.addDoc;
        _setDoc = dependencies.setDoc;
        _deleteDoc = dependencies.deleteDoc;
        _query = dependencies.query;
        _where = dependencies.where;
        _getDocs = dependencies.getDocs;
        _writeBatch = dependencies.writeBatch;
    };

    /**
     * Invalida la caché de orden de segmentos para forzar una recarga.
     */
    function invalidateSegmentOrderCache() {
        _segmentoOrderCache = null;
        // También invalidamos la caché del módulo de ventas si existe
        if (window.ventasModule && typeof window.ventasModule.invalidateCache === 'function') {
            window.ventasModule.invalidateCache();
        }
    }

    /**
     * Renderiza el menú de subopciones de inventario.
     */
    window.showInventarioSubMenu = function() {
        invalidateSegmentOrderCache(); // Invalida la caché al volver al menú
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-3xl font-bold text-gray-800 mb-6">Gestión de Inventario</h1>
                        <div class="space-y-4">
                            <button id="verInventarioBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 transition duration-300 transform hover:scale-105">
                                Ver Inventario
                            </button>
                            <button id="agregarProductoBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 transition duration-300 transform hover:scale-105">
                                Agregar Producto
                            </button>
                            <button id="modifyDeleteBtn" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 transition duration-300 transform hover:scale-105">
                                Modificar / Eliminar Producto
                            </button>
                            <button id="ajusteMasivoBtn" class="w-full px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow-md hover:bg-teal-600 transition duration-300 transform hover:scale-105">
                                Ajuste Masivo de Cantidades
                            </button>
                             <button id="ordenarSegmentosBtn" class="w-full px-6 py-3 bg-purple-500 text-white font-semibold rounded-lg shadow-md hover:bg-purple-600 transition duration-300 transform hover:scale-105">
                                Ordenar Segmentos
                            </button>
                             <button id="modificarDatosBtn" class="w-full px-6 py-3 bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-yellow-600 transition duration-300 transform hover:scale-105">
                                Modificar Datos Maestros
                            </button>
                            <button id="downloadTemplateBtn" class="w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition duration-300 transform hover:scale-105">
                                Descargar Plantilla Excel
                            </button>
                            <button id="uploadExcelBtn" class="w-full px-6 py-3 bg-green-800 text-white font-semibold rounded-lg shadow-md hover:bg-green-900 transition duration-300 transform hover:scale-105">
                                Cargar Inventario desde Excel
                            </button>
                            <input type="file" id="excel-file-input" class="hidden" accept=".xlsx, .xls">
                            <button id="backToMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 transition duration-300 transform hover:scale-105">
                                Volver al Menú Principal
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('verInventarioBtn').addEventListener('click', showVerInventarioView);
        document.getElementById('agregarProductoBtn').addEventListener('click', showAgregarProductoView);
        document.getElementById('modifyDeleteBtn').addEventListener('click', () => {
            _lastFilters = { searchTerm: '', rubro: '', segmento: '', marca: '' };
            showModifyDeleteView();
        });
        document.getElementById('ajusteMasivoBtn').addEventListener('click', showAjusteMasivoView);
        document.getElementById('ordenarSegmentosBtn').addEventListener('click', showOrdenarSegmentosView);
        document.getElementById('modificarDatosBtn').addEventListener('click', showModificarDatosView);
        document.getElementById('downloadTemplateBtn').addEventListener('click', downloadExcelTemplate);
        document.getElementById('uploadExcelBtn').addEventListener('click', () => document.getElementById('excel-file-input').click());
        document.getElementById('excel-file-input').addEventListener('change', handleFileUpload);
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }
    
    /**
     * Obtiene y cachea el mapa de orden de los segmentos.
     */
    async function getSegmentoOrderMap() {
        if (_segmentoOrderCache) return _segmentoOrderCache;

        const map = {};
        const segmentosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
        try {
            const snapshot = await _getDocs(segmentosRef);
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                map[data.name] = (data.orden !== undefined) ? data.orden : 9999;
            });
            _segmentoOrderCache = map;
            return map;
        } catch (e) {
            console.warn("No se pudo obtener el orden de los segmentos, se usará orden alfabético.", e);
            return null;
        }
    }

    /**
     * Muestra la vista para ordenar los segmentos.
     */
    function showOrdenarSegmentosView() {
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Ordenar Segmentos</h2>
                        <p class="text-center text-gray-600 mb-6">Arrastra y suelta los segmentos para cambiar el orden en que aparecerán en las listas de productos.</p>
                        
                        <div class="mb-4">
                           <label for="ordenarRubroFilter" class="block text-gray-700 font-medium mb-2">Filtrar por Rubro:</label>
                           <select id="ordenarRubroFilter" class="w-full px-4 py-2 border rounded-lg">
                               <option value="">Todos los Rubros</option>
                           </select>
                        </div>

                        <ul id="segmentos-sortable-list" class="space-y-2 border rounded-lg p-4 max-h-96 overflow-y-auto">
                            <p class="text-gray-500 text-center">Cargando segmentos...</p>
                        </ul>
                        <div class="mt-6 flex flex-col sm:flex-row gap-4">
                            <button id="backToInventarioBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                            <button id="saveOrderBtn" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Guardar Orden</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        document.getElementById('saveOrderBtn').addEventListener('click', handleGuardarOrdenSegmentos);
        
        const rubroFilter = document.getElementById('ordenarRubroFilter');
        _populateDropdown('rubros', 'ordenarRubroFilter', 'Rubro');
        rubroFilter.addEventListener('change', () => renderSortableSegmentList(rubroFilter.value));
        renderSortableSegmentList('');
    }

    /**
     * Renderiza la lista de segmentos para que se puedan ordenar, opcionalmente filtrada por rubro.
     */
    async function renderSortableSegmentList(rubro = '') {
        const container = document.getElementById('segmentos-sortable-list');
        if (!container) return;
        container.innerHTML = `<p class="text-gray-500 text-center">Cargando...</p>`;

        try {
            const segmentosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
            let snapshot = await _getDocs(segmentosRef);
            let allSegments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Inicializar el campo 'orden' si no existe
            if (allSegments.length > 0 && allSegments.some(s => s.orden === undefined)) {
                const sortedAlphabetically = allSegments.sort((a,b) => a.name.localeCompare(b.name));
                const batch = _writeBatch(_db);
                sortedAlphabetically.forEach((seg, index) => {
                    const docRef = _doc(segmentosRef, seg.id);
                    batch.update(docRef, { orden: index });
                });
                await batch.commit();
                snapshot = await _getDocs(segmentosRef);
                allSegments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            let segmentsToDisplay = allSegments;

            // Filtrar por rubro si se especifica uno
            if (rubro) {
                const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
                const q = _query(inventarioRef, _where("rubro", "==", rubro));
                const inventarioSnapshot = await _getDocs(q);
                const usedSegmentNames = new Set(inventarioSnapshot.docs.map(doc => doc.data().segmento));
                segmentsToDisplay = allSegments.filter(s => usedSegmentNames.has(s.name));
            }

            segmentsToDisplay.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));

            container.innerHTML = ''; 
            if(segmentsToDisplay.length === 0) {
                 container.innerHTML = `<p class="text-gray-500 text-center">No hay segmentos para este rubro.</p>`;
                 return;
            }

            segmentsToDisplay.forEach(seg => {
                const li = document.createElement('li');
                li.dataset.id = seg.id;
                li.dataset.name = seg.name;
                li.className = 'p-3 bg-gray-100 rounded shadow-sm cursor-grab active:cursor-grabbing';
                li.textContent = seg.name;
                li.draggable = true;
                container.appendChild(li);
            });

            addDragAndDropHandlers(container);

        } catch (error) {
            console.error("Error al renderizar la lista de segmentos:", error);
            container.innerHTML = `<p class="text-red-500 text-center">Error al cargar los segmentos.</p>`;
        }
    }
    
    /**
     * Genera y descarga una plantilla de Excel para la carga de inventario.
     */
    function downloadExcelTemplate() {
        const headers = ["Rubro", "Segmento", "Marca", "Presentacion", "TipoUnidad", "PrecioUSD", "Cantidad", "TipoIVA"];
        const exampleData = [
            ["Cerveceria y Vinos", "Cervezas", "Polar", "Pilsen Retornable 300ml", "cj.", 24.00, 50, 16],
            ["Cerveceria y Vinos", "Cervezas", "Polar", "Light Lata 355ml", "cj.", 18.50, 75, 16],
            ["Cerveceria y Vinos", "Vinos", "Santa Teresa", "Tinto de Verano 1.75L", "und.", 5.50, 30, 16],
            ["Alimentos", "Harinas", "P.A.N.", "Harina de Maíz Blanco 1kg", "und.", 1.20, 200, 0],
            ["P&G", "Cuidado del Hogar", "Ariel", "Detergente en Polvo 2kg", "und.", 8.75, 40, 16]
        ];

        const data = [headers, ...exampleData];
        
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Inventario");
        XLSX.writeFile(wb, "Plantilla_Inventario.xlsx");
    }

    /**
     * Handles the file upload event when a user selects an Excel file.
     */
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                processExcelData(jsonData);
            } catch (error) {
                console.error("Error reading or processing Excel file:", error);
                _showModal('Error', 'No se pudo leer el archivo de Excel. Asegúrate de que tenga el formato correcto.');
            }
        };
        reader.onerror = function() {
            _showModal('Error', 'Hubo un error al leer el archivo.');
        };
        reader.readAsArrayBuffer(file);
        
        event.target.value = '';
    }

    /**
     * Processes the data extracted from the Excel file, validates it, and prepares it for Firestore.
     */
    function processExcelData(data) {
        if (data.length === 0) {
            _showModal('Aviso', 'El archivo de Excel está vacío o no tiene datos.');
            return;
        }

        const expectedHeaders = ["Rubro", "Segmento", "Marca", "Presentacion", "TipoUnidad", "PrecioUSD", "Cantidad", "TipoIVA"];
        const actualHeaders = Object.keys(data[0]);
        const hasAllHeaders = expectedHeaders.every(header => actualHeaders.includes(header));

        if (!hasAllHeaders) {
            _showModal('Error de Formato', `El archivo de Excel no tiene los encabezados correctos. Asegúrate de que la primera fila contenga: ${expectedHeaders.join(', ')}`);
            return;
        }

        const productsToUpdate = [];
        const errors = [];

        data.forEach((row, index) => {
            const producto = {
                rubro: row.Rubro?.toString().trim(),
                segmento: row.Segmento?.toString().trim(),
                marca: row.Marca?.toString().trim(),
                presentacion: row.Presentacion?.toString().trim(),
                unidadTipo: row.TipoUnidad?.toString().trim(),
                precio: parseFloat(row.PrecioUSD),
                cantidad: parseInt(row.Cantidad, 10),
                iva: parseInt(row.TipoIVA, 10)
            };

            if (!producto.rubro || !producto.segmento || !producto.marca || !producto.presentacion) {
                errors.push(`Fila ${index + 2}: Faltan datos de texto obligatorios (Rubro, Segmento, Marca, Presentación).`);
            } else if (isNaN(producto.precio) || isNaN(producto.cantidad) || isNaN(producto.iva)) {
                errors.push(`Fila ${index + 2}: Precio, Cantidad o IVA no son números válidos.`);
            } else if (!['und.', 'cj.'].includes(producto.unidadTipo)) {
                errors.push(`Fila ${index + 2}: TipoUnidad debe ser 'und.' o 'cj.'.`);
            } else if (![0, 16].includes(producto.iva)) {
                errors.push(`Fila ${index + 2}: TipoIVA debe ser 0 o 16.`);
            } else {
                productsToUpdate.push(producto);
            }
        });

        if (errors.length > 0) {
            _showModal('Errores en el Archivo', `<div class="text-left max-h-40 overflow-y-auto">${errors.join('<br>')}</div>`);
            return;
        }

        updateInventoryFromExcel(productsToUpdate);
    }

    /**
     * Updates the Firestore database with the products from the Excel file.
     */
    async function updateInventoryFromExcel(products) {
        _showModal('Confirmar Carga', `
            <p>Se encontraron ${products.length} productos en el archivo de Excel.</p>
            <p class="mt-2 font-bold text-red-600">¡Atención! Esta acción sobrescribirá los productos existentes que coincidan. Los productos nuevos serán creados.</p>
            <p class="mt-2">¿Deseas continuar con la actualización del inventario?</p>
        `, async () => {
            _showModal('Progreso', 'Actualizando inventario... Por favor, no cierres la aplicación.');

            try {
                const batch = _writeBatch(_db);
                const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);

                const addMasterData = async (collectionName, name, localBatch) => {
                    const masterRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/${collectionName}`);
                    const q = _query(masterRef, _where("name", "==", name));
                    const snapshot = await _getDocs(q);
                    if (snapshot.empty) {
                        const newDocRef = _doc(masterRef);
                        localBatch.set(newDocRef, { name: name });
                    }
                };

                for (const producto of products) {
                    await addMasterData('rubros', producto.rubro, batch);
                    await addMasterData('segmentos', producto.segmento, batch);
                    await addMasterData('marcas', producto.marca, batch);

                    const q = _query(inventarioRef,
                        _where("rubro", "==", producto.rubro),
                        _where("segmento", "==", producto.segmento),
                        _where("marca", "==", producto.marca),
                        _where("presentacion", "==", producto.presentacion),
                        _where("unidadTipo", "==", producto.unidadTipo)
                    );

                    const snapshot = await _getDocs(q);
                    if (snapshot.empty) {
                        const newDocRef = _doc(inventarioRef);
                        batch.set(newDocRef, producto);
                    } else {
                        const docId = snapshot.docs[0].id;
                        const docRef = _doc(inventarioRef, docId);
                        batch.set(docRef, producto);
                    }
                }

                await batch.commit();
                _showModal('Éxito', 'El inventario se ha actualizado correctamente desde el archivo de Excel.');
                showInventarioSubMenu();
            } catch (error) {
                console.error("Error updating inventory from Excel:", error);
                _showModal('Error', `Ocurrió un error al actualizar el inventario: ${error.message}`);
            }
        }, 'Sí, Actualizar');
    }

    /**
     * Añade los manejadores de eventos para la funcionalidad de arrastrar y soltar.
     */
    function addDragAndDropHandlers(container) {
        let draggedItem = null;

        container.addEventListener('dragstart', e => {
            draggedItem = e.target;
            setTimeout(() => { if(draggedItem) draggedItem.style.opacity = '0.5'; }, 0);
        });

        container.addEventListener('dragend', e => {
            if(draggedItem) {
                draggedItem.style.opacity = '1';
            }
            draggedItem = null;
        });

        container.addEventListener('dragover', e => {
            e.preventDefault();
            const afterElement = getDragAfterElement(container, e.clientY);
            if (draggedItem) {
                if (afterElement == null) {
                    container.appendChild(draggedItem);
                } else {
                    container.insertBefore(draggedItem, afterElement);
                }
            }
        });

        function getDragAfterElement(container, y) {
            const draggableElements = [...container.querySelectorAll('li:not([style*="opacity: 0.5"])')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
    }

    /**
     * Guarda el nuevo orden de los segmentos.
     */
    async function handleGuardarOrdenSegmentos() {
        const listItems = document.querySelectorAll('#segmentos-sortable-list li');
        if (listItems.length === 0) {
            _showModal('Aviso', 'No hay segmentos para ordenar.');
            return;
        }

        const batch = _writeBatch(_db);
        listItems.forEach((item, index) => {
            const docId = item.dataset.id;
            const docRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/segmentos`, docId);
            batch.update(docRef, { orden: index });
        });

        try {
            await batch.commit();
            invalidateSegmentOrderCache(); // Forzar recarga en la próxima vista
            _showModal('Éxito', 'El orden de los segmentos ha sido guardado.');
            showInventarioSubMenu();
        } catch (error) {
            console.error("Error guardando el orden de los segmentos:", error);
            _showModal('Error', 'Hubo un error al guardar el nuevo orden.');
        }
    }

    /**
     * Muestra la vista para el ajuste masivo de cantidades.
     */
    function showAjusteMasivoView() {
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Ajuste Masivo de Cantidades</h2>
                        <div class="mb-4">
                           <label for="ajusteRubroFilter" class="block text-gray-700 font-medium mb-2">Filtrar por Rubro:</label>
                           <select id="ajusteRubroFilter" class="w-full px-4 py-2 border rounded-lg">
                               <option value="">Todos los Rubros</option>
                           </select>
                        </div>
                        <div id="ajusteListContainer" class="overflow-x-auto max-h-96">
                            <p class="text-gray-500 text-center">Cargando productos...</p>
                        </div>
                        <div class="mt-6 flex flex-col sm:flex-row gap-4">
                            <button id="backToInventarioBtn" class="w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                            <button id="saveAjusteBtn" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Guardar Cambios</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        document.getElementById('saveAjusteBtn').addEventListener('click', handleGuardarAjusteMasivo);
        const rubroFilter = document.getElementById('ajusteRubroFilter');
        _populateDropdown('rubros', 'ajusteRubroFilter', 'Rubro');
        rubroFilter.addEventListener('change', () => renderAjusteMasivoList(rubroFilter.value));
        renderAjusteMasivoList('');
    }

    /**
     * Renderiza la lista de productos para el ajuste masivo, agrupada por marca.
     */
    async function renderAjusteMasivoList(rubro = '') {
        const container = document.getElementById('ajusteListContainer');
        if (!container) return;

        const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
        const unsubscribe = _onSnapshot(collectionRef, async (snapshot) => {
            let productos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            _inventarioCache = productos; 
            
            const segmentoOrderMap = await getSegmentoOrderMap();
            if (segmentoOrderMap) {
                productos.sort((a, b) => {
                    const orderA = segmentoOrderMap[a.segmento] ?? 9999;
                    const orderB = segmentoOrderMap[b.segmento] ?? 9999;
                    if (orderA !== orderB) return orderA - orderB;
                    if (a.marca.localeCompare(b.marca) !== 0) return a.marca.localeCompare(b.marca);
                    return a.presentacion.localeCompare(b.presentacion);
                });
            }

            if (rubro) {
                productos = productos.filter(p => p.rubro === rubro);
            }

            if (productos.length === 0) {
                container.innerHTML = `<p class="text-gray-500 text-center">No hay productos que coincidan.</p>`;
                return;
            }
            
            let tableHTML = `<table class="min-w-full bg-white border"><thead class="bg-gray-100 sticky top-0"><tr><th class="py-2 px-4 border-b text-left text-sm">Producto</th><th class="py-2 px-4 border-b text-center text-sm w-32">Cantidad Nueva</th></tr></thead><tbody>`;
            
            let currentMarca = null;
            productos.forEach(p => {
                const marca = p.marca || 'Sin Marca';
                if (marca !== currentMarca) {
                    currentMarca = marca;
                    tableHTML += `<tr><td colspan="2" class="py-2 px-4 bg-gray-200 font-bold text-gray-700">${currentMarca}</td></tr>`;
                }
                tableHTML += `
                    <tr class="hover:bg-gray-50">
                        <td class="py-2 px-4 border-b text-sm">
                            <p class="font-semibold">${p.presentacion} <span class="text-xs text-gray-500">(${p.unidadTipo || 'und.'})</span></p>
                            <p class="text-xs text-gray-600">Actual: ${p.cantidad}</p>
                        </td>
                        <td class="py-2 px-4 border-b text-center">
                            <input type="number" value="${p.cantidad}" data-doc-id="${p.id}" class="w-24 p-1 text-center border rounded-lg">
                        </td>
                    </tr>
                `;
            });

            tableHTML += `</tbody></table>`;
            container.innerHTML = tableHTML;
        });
        _activeListeners.push(unsubscribe);
    }
    
    /**
     * Guarda los cambios de cantidad realizados masivamente.
     */
    async function handleGuardarAjusteMasivo() {
        const inputs = document.querySelectorAll('#ajusteListContainer input[data-doc-id]');
        if (inputs.length === 0) {
            _showModal('Aviso', 'No hay cambios que guardar.');
            return;
        }

        const batch = _writeBatch(_db);
        let changesCount = 0;

        inputs.forEach(input => {
            const docId = input.dataset.docId;
            const nuevaCantidad = parseInt(input.value, 10);
            const productoOriginal = _inventarioCache.find(p => p.id === docId);

            if (!isNaN(nuevaCantidad) && productoOriginal && productoOriginal.cantidad !== nuevaCantidad) {
                const docRef = _doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, docId);
                batch.update(docRef, { cantidad: nuevaCantidad });
                changesCount++;
            }
        });

        if (changesCount === 0) {
            _showModal('Aviso', 'No se detectaron cambios en las cantidades.');
            return;
        }

        _showModal('Confirmar Cambios', `Estás a punto de actualizar ${changesCount} producto(s). ¿Deseas continuar?`, async () => {
            try {
                await batch.commit();
                _showModal('Éxito', 'Las cantidades del inventario se han actualizado correctamente.');
                showInventarioSubMenu();
            } catch (error) {
                console.error("Error al guardar ajuste masivo:", error);
                _showModal('Error', 'Hubo un error al guardar los cambios.');
            }
        });
    }

    /**
     * Muestra la vista para modificar los datos maestros (Rubros, Segmentos, Marcas).
     */
    function showModificarDatosView() {
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Modificar Datos Maestros</h2>
                        
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <!-- Columna de Rubros -->
                            <div>
                                <h3 class="text-lg font-semibold text-gray-700 mb-2 border-b pb-2">Rubros</h3>
                                <div id="rubros-list" class="space-y-2 max-h-60 overflow-y-auto"></div>
                            </div>
                            <!-- Columna de Segmentos -->
                            <div>
                                <h3 class="text-lg font-semibold text-gray-700 mb-2 border-b pb-2">Segmentos</h3>
                                <div id="segmentos-list" class="space-y-2 max-h-60 overflow-y-auto"></div>
                            </div>
                            <!-- Columna de Marcas -->
                            <div>
                                <h3 class="text-lg font-semibold text-gray-700 mb-2 border-b pb-2">Marcas</h3>
                                <div id="marcas-list" class="space-y-2 max-h-60 overflow-y-auto"></div>
                            </div>
                        </div>

                        <button id="backToInventarioBtn" class="mt-8 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);

        renderDataListForEditing('rubros', 'rubros-list', 'Rubro');
        renderDataListForEditing('segmentos', 'segmentos-list', 'Segmento');
        renderDataListForEditing('marcas', 'marcas-list', 'Marca');
    }

    /**
     * Renderiza una lista de datos (rubros, etc.) con botones para eliminar.
     */
    function renderDataListForEditing(collectionName, containerId, itemName) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/${collectionName}`);
        const unsubscribe = _onSnapshot(collectionRef, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name));
            if (items.length === 0) {
                container.innerHTML = `<p class="text-gray-500 text-sm">No hay ${itemName.toLowerCase()}s.</p>`;
                return;
            }
            container.innerHTML = items.map(item => `
                <div class="flex justify-between items-center bg-gray-50 p-2 rounded">
                    <span class="text-gray-800">${item.name}</span>
                    <button onclick="window.inventarioModule.handleDeleteDataItem('${collectionName}', '${item.name}', '${itemName}')" class="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">Eliminar</button>
                </div>
            `).join('');
        });
        _activeListeners.push(unsubscribe);
    }

    /**
     * Maneja la eliminación de un item de datos maestros, con validación de uso.
     */
    async function handleDeleteDataItem(collectionName, itemName, itemType) {
        const fieldMap = {
            rubros: 'rubro',
            segmentos: 'segmento',
            marcas: 'marca'
        };
        const fieldName = fieldMap[collectionName];
        const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
        const q = _query(inventarioRef, _where(fieldName, "==", itemName));
        
        try {
            const usageSnapshot = await _getDocs(q);
            if (!usageSnapshot.empty) {
                _showModal('Error al Eliminar', `No se puede eliminar el ${itemType.toLowerCase()} "${itemName}" porque está siendo utilizado por ${usageSnapshot.size} producto(s).`);
                return;
            }
            _showModal('Confirmar Eliminación', `¿Estás seguro de que deseas eliminar el ${itemType.toLowerCase()} "${itemName}"?`, async () => {
                const itemQuery = _query(_collection(_db, `artifacts/${_appId}/users/${_userId}/${collectionName}`), _where("name", "==", itemName));
                const itemSnapshot = await _getDocs(itemQuery);

                if (!itemSnapshot.empty) {
                    const docId = itemSnapshot.docs[0].id;
                    await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/${collectionName}`, docId));
                    _showModal('Éxito', `${itemType} "${itemName}" ha sido eliminado.`);
                } else {
                    _showModal('Error', `No se pudo encontrar el ${itemType.toLowerCase()} para eliminar.`);
                }
            });
        } catch (error) {
            _showModal('Error', 'Ocurrió un error al intentar eliminar el item.');
        }
    }

    /**
     * Muestra un modal para agregar un nuevo item (Rubro, Segmento, Marca) con validación de duplicados.
     */
    function showValidatedAddItemModal(collectionName, itemName) {
        const modalContainer = document.getElementById('modalContainer');
        const modalContent = document.getElementById('modalContent');
        
        modalContent.innerHTML = `
            <div class="text-center">
                <h3 class="text-xl font-bold text-gray-800 mb-4">Agregar Nuevo ${itemName}</h3>
                <form id="addItemForm" class="space-y-4">
                    <input type="text" id="newItemInput" placeholder="Nombre del ${itemName}" class="w-full px-4 py-2 border rounded-lg" required>
                    <button type="submit" class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Agregar</button>
                </form>
                <p id="addItemMessage" class="text-sm mt-2 h-4"></p>
                <div class="mt-4">
                     <button id="closeItemBtn" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500">Cerrar</button>
                </div>
            </div>
        `;
        modalContainer.classList.remove('hidden');

        const newItemInput = document.getElementById('newItemInput');
        const addItemMessage = document.getElementById('addItemMessage');

        document.getElementById('closeItemBtn').addEventListener('click', () => modalContainer.classList.add('hidden'));

        document.getElementById('addItemForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newItemName = newItemInput.value.trim();
            if (!newItemName) return;
            
            addItemMessage.textContent = '';
            addItemMessage.classList.remove('text-green-600', 'text-red-600');

            try {
                const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/${collectionName}`);
                const snapshot = await _getDocs(collectionRef);
                const existingItems = snapshot.docs.map(doc => doc.data().name.toLowerCase());
                
                if (existingItems.includes(newItemName.toLowerCase())) {
                    addItemMessage.classList.add('text-red-600');
                    addItemMessage.textContent = `"${newItemName}" ya existe.`;
                    return;
                }
                
                await _addDoc(collectionRef, { name: newItemName });
                addItemMessage.classList.add('text-green-600');
                addItemMessage.textContent = `¡"${newItemName}" agregado!`;
                newItemInput.value = '';
                newItemInput.focus();
                setTimeout(() => { addItemMessage.textContent = ''; }, 2000);
            } catch (err) {
                addItemMessage.classList.add('text-red-600');
                addItemMessage.textContent = `Error al guardar o validar.`;
            }
        });
    }

    /**
     * Muestra la vista para agregar un nuevo producto.
     */
    function showAgregarProductoView() {
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">Agregar Producto</h2>
                        <form id="productoForm" class="space-y-4 text-left">
                            <div>
                                <label for="rubro" class="block text-gray-700 font-medium mb-2">Rubro:</label>
                                <div class="flex items-center space-x-2">
                                    <select id="rubro" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required></select>
                                    <button type="button" id="addRubroBtn" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500">Agregar</button>
                                </div>
                            </div>
                            <div>
                                <label for="segmento" class="block text-gray-700 font-medium mb-2">Segmento:</label>
                                <div class="flex items-center space-x-2">
                                    <select id="segmento" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required></select>
                                    <button type="button" id="addSegmentoBtn" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500">Agregar</button>
                                </div>
                            </div>
                            <div>
                                <label for="marca" class="block text-gray-700 font-medium mb-2">Marca:</label>
                                <div class="flex items-center space-x-2">
                                    <select id="marca" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required></select>
                                    <button type="button" id="addMarcaBtn" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500">Agregar</button>
                                </div>
                            </div>
                            <div>
                                <label for="presentacion" class="block text-gray-700 font-medium mb-2">Presentación:</label>
                                <div class="flex items-center gap-2">
                                    <input type="text" id="presentacion" class="w-full px-4 py-2 border rounded-lg" required>
                                    <select id="unidadTipo" class="px-2 py-2 border rounded-lg bg-gray-50">
                                        <option value="und.">und.</option>
                                        <option value="cj.">cj.</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label for="precio" class="block text-gray-700 font-medium mb-2">Precio (USD):</label>
                                <input type="number" step="0.01" id="precio" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="cantidad" class="block text-gray-700 font-medium mb-2">Cantidad:</label>
                                <input type="number" id="cantidad" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="ivaTipo" class="block text-gray-700 font-medium mb-2">Tipo de IVA:</label>
                                <select id="ivaTipo" class="w-full px-4 py-2 border rounded-lg" required>
                                    <option value="16">IVA 16%</option>
                                    <option value="0">Excento</option>
                                </select>
                            </div>
                            <button type="submit" class="w-full px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600">Guardar Producto</button>
                        </form>
                        <button id="backToInventarioBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        _populateDropdown('rubros', 'rubro', 'rubro');
        _populateDropdown('segmentos', 'segmento', 'segmento');
        _populateDropdown('marcas', 'marca', 'marca');
        
        document.getElementById('productoForm').addEventListener('submit', agregarProducto);
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        
        document.getElementById('addRubroBtn').addEventListener('click', () => showValidatedAddItemModal('rubros', 'Rubro'));
        document.getElementById('addSegmentoBtn').addEventListener('click', () => showValidatedAddItemModal('segmentos', 'Segmento'));
        document.getElementById('addMarcaBtn').addEventListener('click', () => showValidatedAddItemModal('marcas', 'Marca'));
    }

    /**
     * Agrega un nuevo producto al inventario con validación de duplicados.
     */
    async function agregarProducto(e) {
        e.preventDefault();
        const producto = {
            rubro: document.getElementById('rubro').value,
            segmento: document.getElementById('segmento').value,
            marca: document.getElementById('marca').value,
            presentacion: document.getElementById('presentacion').value.trim(),
            unidadTipo: document.getElementById('unidadTipo').value,
            precio: parseFloat(document.getElementById('precio').value),
            cantidad: parseInt(document.getElementById('cantidad').value, 10),
            iva: parseInt(document.getElementById('ivaTipo').value, 10)
        };

        if (!producto.rubro || !producto.segmento || !producto.marca || !producto.presentacion) {
            _showModal('Error', 'Todos los campos (Rubro, Segmento, Marca y Presentación) son obligatorios.');
            return;
        }

        try {
            const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
            const q = _query(inventarioRef, 
                _where("rubro", "==", producto.rubro),
                _where("segmento", "==", producto.segmento),
                _where("marca", "==", producto.marca),
                _where("presentacion", "==", producto.presentacion),
                _where("unidadTipo", "==", producto.unidadTipo)
            );

            const querySnapshot = await _getDocs(q);

            if (!querySnapshot.empty) {
                _showModal('Producto Duplicado', 'Ya existe un producto con el mismo Rubro, Segmento, Marca, Presentación y Tipo de Unidad.');
                return;
            }

            await _addDoc(inventarioRef, producto);
            _showModal('Éxito', 'Producto agregado correctamente.');
            e.target.reset();

        } catch (err) {
            console.error("Error al agregar producto:", err);
            _showModal('Error', 'Hubo un error al guardar el producto.');
        }
    }

    /**
     * Muestra la vista de "Ver Inventario".
     */
    function showVerInventarioView() {
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Ver Inventario</h2>
                        <div class="mb-4">
                           <label for="verInventarioRubroFilter" class="block text-gray-700 font-medium mb-2">Filtrar por Rubro:</label>
                           <select id="verInventarioRubroFilter" class="w-full px-4 py-2 border rounded-lg">
                               <option value="">Todos los Rubros</option>
                           </select>
                        </div>
                        <div id="productosListContainer" class="overflow-x-auto max-h-96">
                            <p class="text-gray-500 text-center">Cargando productos...</p>
                        </div>
                        <button id="backToInventarioBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        const rubroFilter = document.getElementById('verInventarioRubroFilter');
        _populateDropdown('rubros', 'verInventarioRubroFilter', 'Rubro');
        rubroFilter.addEventListener('change', () => renderProductosList('productosListContainer', true));
        renderProductosList('productosListContainer', true);
    }

    /**
     * Muestra la vista para modificar o eliminar un producto.
     */
    function showModifyDeleteView() {
        _floatingControls.classList.add('hidden');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Modificar / Eliminar Producto</h2>
                        
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-lg">
                            <input type="text" id="search-input" placeholder="Buscar por presentación..." class="md:col-span-4 w-full px-4 py-2 border rounded-lg">
                            <div>
                                <label for="filter-rubro" class="text-sm font-medium">Rubro</label>
                                <select id="filter-rubro" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos</option></select>
                            </div>
                             <div>
                                <label for="filter-segmento" class="text-sm font-medium">Segmento</label>
                                <select id="filter-segmento" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos</option></select>
                            </div>
                             <div>
                                <label for="filter-marca" class="text-sm font-medium">Marca</label>
                                <select id="filter-marca" class="w-full px-2 py-1 border rounded-lg text-sm"><option value="">Todos</option></select>
                            </div>
                            <button id="clear-filters-btn" class="bg-gray-300 text-sm font-semibold rounded-lg self-end py-1">Limpiar Filtros</button>
                        </div>
                        
                        <div id="productosListContainer" class="overflow-x-auto max-h-96">
                            <p class="text-gray-500 text-center">Cargando productos...</p>
                        </div>
                        <button id="backToInventarioBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('backToInventarioBtn').addEventListener('click', showInventarioSubMenu);
        
        _populateDropdown('rubros', 'filter-rubro', 'Rubro');
        _populateDropdown('segmentos', 'filter-segmento', 'Segmento');
        _populateDropdown('marcas', 'filter-marca', 'Marca');
        
        document.getElementById('search-input').value = _lastFilters.searchTerm;
        document.getElementById('filter-rubro').value = _lastFilters.rubro;
        document.getElementById('filter-segmento').value = _lastFilters.segmento;
        document.getElementById('filter-marca').value = _lastFilters.marca;

        const applyAndSaveFilters = () => {
            _lastFilters.searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
            _lastFilters.rubro = document.getElementById('filter-rubro')?.value || '';
            _lastFilters.segmento = document.getElementById('filter-segmento')?.value || '';
            _lastFilters.marca = document.getElementById('filter-marca')?.value || '';
            renderProductosList('productosListContainer', false);
        };

        document.getElementById('search-input').addEventListener('input', applyAndSaveFilters);
        document.getElementById('filter-rubro').addEventListener('change', applyAndSaveFilters);
        document.getElementById('filter-segmento').addEventListener('change', applyAndSaveFilters);
        document.getElementById('filter-marca').addEventListener('change', applyAndSaveFilters);
        
        document.getElementById('clear-filters-btn').addEventListener('click', () => {
            document.getElementById('search-input').value = '';
            document.getElementById('filter-rubro').value = '';
            document.getElementById('filter-segmento').value = '';
            document.getElementById('filter-marca').value = '';
            applyAndSaveFilters();
        });

        renderProductosList('productosListContainer', false);
    }

    /**
     * Renderiza la lista de productos en una tabla, agrupada por marca y ordenada por segmento.
     */
    async function renderProductosList(elementId, readOnly = false) {
        const container = document.getElementById(elementId);
        if (!container) return;
        container.innerHTML = `<p class="text-gray-500 text-center">Cargando y ordenando productos...</p>`;

        const collectionRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
        const unsubscribe = _onSnapshot(collectionRef, async (snapshot) => {
            let productos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            _inventarioCache = productos;
            
            const segmentoOrderMap = await getSegmentoOrderMap();
            if (segmentoOrderMap) {
                productos.sort((a, b) => {
                    const orderA = segmentoOrderMap[a.segmento] ?? 9999;
                    const orderB = segmentoOrderMap[b.segmento] ?? 9999;
                    if (orderA !== orderB) return orderA - orderB;
                    if (a.marca.localeCompare(b.marca) !== 0) return a.marca.localeCompare(b.marca);
                    return a.presentacion.localeCompare(b.presentacion);
                });
            }

            if (readOnly) {
                const rubroFilter = document.getElementById('verInventarioRubroFilter')?.value || '';
                if (rubroFilter) productos = productos.filter(p => p.rubro === rubroFilter);
            } else {
                productos = productos.filter(p => {
                    const searchMatch = !_lastFilters.searchTerm || p.presentacion.toLowerCase().includes(_lastFilters.searchTerm);
                    const rubroMatch = !_lastFilters.rubro || p.rubro === _lastFilters.rubro;
                    const segmentoMatch = !_lastFilters.segmento || p.segmento === _lastFilters.segmento;
                    const marcaMatch = !_lastFilters.marca || p.marca === _lastFilters.marca;
                    return searchMatch && rubroMatch && segmentoMatch && marcaMatch;
                });
            }

            if (productos.length === 0) {
                container.innerHTML = `<p class="text-gray-500 text-center">No hay productos que coincidan.</p>`;
                return;
            }
            
            let tableHTML = `<table class="min-w-full bg-white border border-gray-200"><thead class="bg-gray-200 sticky top-0"><tr><th class="py-2 px-4 border-b text-left text-sm">Presentación</th><th class="py-2 px-4 border-b text-left text-sm">Marca</th><th class="py-2 px-4 border-b text-right text-sm">Precio</th><th class="py-2 px-4 border-b text-center text-sm">Cantidad</th>${!readOnly ? `<th class="py-2 px-4 border-b text-center text-sm">Acciones</th>` : ''}</tr></thead><tbody>`;
            
            let currentMarca = null;
            productos.forEach(p => {
                const marca = p.marca || 'Sin Marca';
                if (marca !== currentMarca) {
                    currentMarca = marca;
                    tableHTML += `<tr><td colspan="${readOnly ? 4 : 5}" class="py-2 px-4 bg-gray-100 font-bold text-gray-600">${currentMarca}</td></tr>`;
                }

                tableHTML += `
                    <tr class="hover:bg-gray-50">
                        <td class="py-2 px-4 border-b text-sm">${p.presentacion} <span class="text-xs text-gray-500">(${p.unidadTipo || 'und.'})</span> (${p.segmento})</td>
                        <td class="py-2 px-4 border-b text-sm">${p.marca}</td>
                        <td class="py-2 px-4 border-b text-right text-sm">$${p.precio.toFixed(2)}</td>
                        <td class="py-2 px-4 border-b text-center text-sm">${p.cantidad}</td>
                        ${!readOnly ? `
                        <td class="py-2 px-4 border-b text-center space-x-2">
                            <button onclick="window.inventarioModule.editProducto('${p.id}')" class="px-3 py-1 bg-yellow-500 text-white text-xs rounded-lg hover:bg-yellow-600">Editar</button>
                            <button onclick="window.inventarioModule.deleteProducto('${p.id}')" class="px-3 py-1 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600">Eliminar</button>
                        </td>` : ''}
                    </tr>
                `;
            });

            tableHTML += `</tbody></table>`;
            container.innerHTML = tableHTML;
        });
        _activeListeners.push(unsubscribe);
    }
    
    /**
     * Muestra el formulario para editar un producto.
     */
    function editProducto(productId) {
        _floatingControls.classList.add('hidden');
        const producto = _inventarioCache.find(p => p.id === productId);
        if (!producto) return;

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">Editar Producto</h2>
                        <form id="editProductoForm" class="space-y-4 text-left">
                            <p class="text-sm">Nota: Rubro, Segmento y Marca no se pueden editar para mantener la consistencia de los datos.</p>
                            <div>
                                <label for="editPresentacion" class="block text-gray-700 font-medium mb-2">Presentación:</label>
                                <div class="flex items-center gap-2">
                                    <input type="text" id="editPresentacion" value="${producto.presentacion}" class="w-full px-4 py-2 border rounded-lg" required>
                                    <select id="editUnidadTipo" class="px-2 py-2 border rounded-lg bg-gray-50">
                                        <option value="und." ${producto.unidadTipo === 'und.' ? 'selected' : ''}>und.</option>
                                        <option value="cj." ${producto.unidadTipo === 'cj.' ? 'selected' : ''}>cj.</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label for="editPrecio" class="block text-gray-700 font-medium mb-2">Precio (USD):</label>
                                <input type="number" step="0.01" id="editPrecio" value="${producto.precio}" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                            <div>
                                <label for="editCantidad" class="block text-gray-700 font-medium mb-2">Cantidad:</label>
                                <input type="number" id="editCantidad" value="${producto.cantidad}" class="w-full px-4 py-2 border rounded-lg" required>
                            </div>
                             <div>
                                <label for="editIvaTipo" class="block text-gray-700 font-medium mb-2">Tipo de IVA:</label>
                                <select id="editIvaTipo" class="w-full px-4 py-2 border rounded-lg" required>
                                    <option value="16" ${producto.iva === 16 ? 'selected' : ''}>IVA 16%</option>
                                    <option value="0" ${producto.iva === 0 ? 'selected' : ''}>Excento</option>
                                </select>
                            </div>
                            <button type="submit" class="w-full px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600">Guardar Cambios</button>
                        </form>
                        <button id="backToModifyDeleteBtn" class="mt-4 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('editProductoForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await _setDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, productId), {
                    presentacion: document.getElementById('editPresentacion').value.trim(),
                    unidadTipo: document.getElementById('editUnidadTipo').value,
                    precio: parseFloat(document.getElementById('editPrecio').value),
                    cantidad: parseInt(document.getElementById('editCantidad').value, 10),
                    iva: parseInt(document.getElementById('editIvaTipo').value, 10)
                }, { merge: true });
                _showModal('Éxito', 'Producto modificado exitosamente.');
                showModifyDeleteView();
            } catch (err) {
                _showModal('Error', 'Hubo un error al modificar el producto.');
            }
        });
        document.getElementById('backToModifyDeleteBtn').addEventListener('click', showModifyDeleteView);
    };

    /**
     * Elimina un producto.
     */
    function deleteProducto(productId) {
        _showModal('Confirmar Eliminación', '¿Estás seguro de que deseas eliminar este producto?', async () => {
            try {
                await _deleteDoc(_doc(_db, `artifacts/${_appId}/users/${_userId}/inventario`, productId));
                _showModal('Éxito', 'Producto eliminado correctamente.');
            } catch (e) {
                _showModal('Error', 'Hubo un error al eliminar el producto.');
            }
        });
    };

    // Exponer funciones públicas al objeto window para ser llamadas desde el HTML
    window.inventarioModule = {
        editProducto,
        deleteProducto,
        handleDeleteDataItem,
        getSegmentoOrderMap, // Exponer para que otros módulos puedan usarla
        invalidateSegmentOrderCache
    };

})();
