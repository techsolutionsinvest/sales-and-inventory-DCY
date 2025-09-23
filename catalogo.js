// --- Lógica del módulo de Catálogo ---

(function() {
    // Variables locales del módulo
    let _db, _userId, _appId, _mainContent, _showMainMenu, _collection, _getDocs, _floatingControls;
    
    // Estado específico del catálogo
    let _catalogoTasaCOP = 0;
    let _catalogoMonedaActual = 'USD';
    let _currentRubros = [];
    let _currentBgImage = '';
    let _segmentoOrderCacheCatalogo = null;

    // Caché de datos para la generación de imágenes paginadas
    let _marcasCache = [];
    let _productosAgrupadosCache = {};

    /**
     * Inicializa el módulo de catálogo. 
     */
    window.initCatalogo = function(dependencies) {
        _db = dependencies.db;
        _userId = dependencies.userId;
        _appId = dependencies.appId;
        _mainContent = dependencies.mainContent;
        _showMainMenu = dependencies.showMainMenu;
        _collection = dependencies.collection;
        _getDocs = dependencies.getDocs;
        _floatingControls = dependencies.floatingControls;
    };
    
    /**
     * Obtiene y cachea el mapa de orden de los segmentos.
     */
    async function getSegmentoOrderMapCatalogo() {
        if (_segmentoOrderCacheCatalogo) return _segmentoOrderCacheCatalogo;
        
        // Intenta llamar a la función de inventario si existe para mantener una única fuente de verdad
        if (window.inventarioModule && typeof window.inventarioModule.getSegmentoOrderMap === 'function') {
            _segmentoOrderCacheCatalogo = await window.inventarioModule.getSegmentoOrderMap();
            return _segmentoOrderCacheCatalogo;
        }

        // Fallback si el módulo de inventario no está cargado
        const map = {};
        const segmentosRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/segmentos`);
        try {
            const snapshot = await _getDocs(segmentosRef);
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                map[data.name] = (data.orden !== undefined) ? data.orden : 9999;
            });
            _segmentoOrderCacheCatalogo = map;
            return map;
        } catch (e) {
            console.warn("No se pudo obtener el orden de los segmentos en catalogo.js", e);
            return null;
        }
    }

    /**
     * Muestra el submenú de opciones del catálogo.
     */
    window.showCatalogoSubMenu = function() {
        _floatingControls.classList.add('hidden');
        document.body.classList.remove('catalogo-active');
        document.body.style.removeProperty('--catalogo-bg-image');
        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl text-center">
                        <h1 class="text-4xl font-bold text-gray-800 mb-6">Catálogo de Productos</h1>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button data-rubros='["Cerveceria y Vinos"]' data-bg="images/cervezayvinos.png" class="catalogo-btn w-full px-6 py-3 bg-yellow-500 text-white font-semibold rounded-lg shadow-md hover:bg-yellow-600">Cerveza y Vinos</button>
                            <button data-rubros='["Maltin y Pepsicola"]' data-bg="images/maltinypepsi.png" class="catalogo-btn w-full px-6 py-3 bg-blue-700 text-white font-semibold rounded-lg shadow-md hover:bg-blue-800">Maltin y Pepsicola</button>
                            <button data-rubros='["Alimentos"]' data-bg="images/alimentospolar.png" class="catalogo-btn w-full px-6 py-3 bg-red-500 text-white font-semibold rounded-lg shadow-md hover:bg-red-600">Alimentos Polar</button>
                            <button data-rubros='["P&G"]' data-bg="images/p&g.png" class="catalogo-btn w-full px-6 py-3 bg-sky-500 text-white font-semibold rounded-lg shadow-md hover:bg-sky-600">Procter & Gamble</button>
                            <button data-rubros='[]' data-bg="" class="catalogo-btn md:col-span-2 w-full px-6 py-3 bg-gray-700 text-white font-semibold rounded-lg shadow-md hover:bg-gray-800">Unificado (Todos)</button>
                        </div>
                        <button id="backToMenuBtn" class="mt-6 w-full px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Volver al Menú</button>
                    </div>
                </div>
            </div>
        `;
        document.querySelectorAll('.catalogo-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                _currentRubros = JSON.parse(e.target.dataset.rubros);
                const title = e.target.textContent.trim();
                const bgImage = e.target.dataset.bg;
                showCatalogoView(title, bgImage);
            });
        });
        document.getElementById('backToMenuBtn').addEventListener('click', _showMainMenu);
    }

    /**
     * Muestra la vista detallada de un catálogo filtrado.
     */
    function showCatalogoView(title, bgImage) {
        _currentBgImage = bgImage;
        if (bgImage) {
            document.body.style.setProperty('--catalogo-bg-image', `url('${bgImage}')`);
        }
        document.body.classList.add('catalogo-active');
        _catalogoMonedaActual = 'USD';

        _mainContent.innerHTML = `
            <div class="p-4 pt-8">
                <div class="container mx-auto">
                    <div id="catalogo-container-wrapper" class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl">
                        <div id="catalogo-para-imagen">
                            <h2 class="text-4xl font-bold text-black mb-2 text-center">${title}</h2>
                            <p class="text-center text-gray-800 mb-1 text-base">DISTRIBUIDORA CASTILLO YAÑEZ C.A</p>
                            <p class="text-center text-gray-700 mb-4 text-base italic">(Todos los precios incluyen IVA)</p>
                            <div id="tasa-input-container" class="mb-4">
                                <label for="catalogoTasaCopInput" class="block text-base font-medium mb-1">Tasa (USD a COP):</label>
                                <input type="number" id="catalogoTasaCopInput" placeholder="Ej: 4000" class="w-full px-4 py-2 border rounded-lg">
                            </div>
                            <div id="catalogo-content" class="space-y-6"><p class="text-center text-gray-500">Cargando...</p></div>
                        </div>
                        <div id="catalogo-buttons-container" class="mt-6 text-center space-y-4">
                            <button id="generateCatalogoImageBtn" class="w-full px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">Generar Imagen</button>
                            <button id="backToCatalogoMenuBtn" class="w-full px-6 py-3 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500">Volver</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const savedTasa = localStorage.getItem('tasaCOP');
        if (savedTasa) {
            _catalogoTasaCOP = parseFloat(savedTasa);
            document.getElementById('catalogoTasaCopInput').value = _catalogoTasaCOP;
        }

        document.getElementById('catalogoTasaCopInput').addEventListener('input', (e) => {
            _catalogoTasaCOP = parseFloat(e.target.value) || 0;
            localStorage.setItem('tasaCOP', _catalogoTasaCOP);
            if (_catalogoMonedaActual === 'COP') {
                renderCatalogo();
            }
        });

        document.getElementById('backToCatalogoMenuBtn').addEventListener('click', showCatalogoSubMenu);
        document.getElementById('generateCatalogoImageBtn').addEventListener('click', handleGenerateCatalogoImage);
        renderCatalogo();
    }

    /**
     * Alterna la moneda del catálogo y re-renderiza la vista.
     */
    window.toggleCatalogoMoneda = function() {
        if (_catalogoTasaCOP <= 0) {
            alert('Por favor, ingresa una tasa de cambio válida para convertir a COP.');
            return;
        }
        _catalogoMonedaActual = _catalogoMonedaActual === 'USD' ? 'COP' : 'USD';
        renderCatalogo();
    };
    
    /**
     * Renderiza la tabla de productos del catálogo.
     */
    async function renderCatalogo() {
        const container = document.getElementById('catalogo-content');
        if (!container) return;
        container.innerHTML = `<p class="text-center text-gray-500">Cargando y ordenando productos...</p>`;

        try {
            const inventarioRef = _collection(_db, `artifacts/${_appId}/users/${_userId}/inventario`);
            const snapshot = await _getDocs(inventarioRef);
            let productos = snapshot.docs.map(doc => doc.data());

            if (_currentRubros && _currentRubros.length > 0) {
                productos = productos.filter(p => _currentRubros.includes(p.rubro));
            }

            const segmentoOrderMap = await getSegmentoOrderMapCatalogo();
            if (segmentoOrderMap) {
                productos.sort((a, b) => {
                    const orderA = segmentoOrderMap[a.segmento] ?? 9999;
                    const orderB = segmentoOrderMap[b.segmento] ?? 9999;
                    if (orderA !== orderB) return orderA - orderB;
                    if ((a.marca || '').localeCompare(b.marca || '') !== 0) return (a.marca || '').localeCompare(b.marca || '');
                    return a.presentacion.localeCompare(b.presentacion);
                });
            }

            if (productos.length === 0) {
                container.innerHTML = `<p class="text-center text-gray-500">No hay productos en esta categoría.</p>`;
                return;
            }
            
            const productosAgrupados = productos.reduce((acc, p) => {
                const marca = p.marca || 'Sin Marca';
                if (!acc[marca]) acc[marca] = [];
                acc[marca].push(p);
                return acc;
            }, {});
            
            // Usar el orden de los productos ya sorteados para determinar el orden de las marcas
            const marcasOrdenadas = [...new Set(productos.map(p => p.marca || 'Sin Marca'))];
            
            _marcasCache = marcasOrdenadas;
            _productosAgrupadosCache = productosAgrupados;

            let html = '<div class="space-y-4">';
            marcasOrdenadas.forEach(marca => {
                html += `<table class="min-w-full bg-transparent text-lg">
                            <thead class="text-black">
                                <tr><th colspan="2" class="py-2 px-4 bg-gray-100 font-bold text-left text-xl">${marca}</th></tr>
                                <tr>
                                    <th class="py-2 px-2 text-left font-bold">PRESENTACIÓN</th>
                                    <th class="py-2 px-2 text-right font-bold price-toggle" onclick="toggleCatalogoMoneda()">PRECIO</th>
                                </tr>
                            </thead>
                            <tbody>`;
                
                const productosOrdenados = productosAgrupados[marca]; // Ya están ordenados por la clasificación principal

                productosOrdenados.forEach(p => {
                    let precioConIvaMostrado;

                    if (_catalogoMonedaActual === 'COP' && _catalogoTasaCOP > 0) {
                        precioConIvaMostrado = `COP ${(Math.ceil((p.precio * _catalogoTasaCOP) / 100) * 100).toLocaleString('es-CO')}`;
                    } else {
                        precioConIvaMostrado = `$${p.precio.toFixed(2)}`;
                    }

                    html += `
                        <tr class="border-b border-gray-200">
                            <td class="py-2 px-2 text-gray-900">${p.presentacion} <span class="text-base text-gray-600">(${p.unidadTipo || 'und.'})</span> (${p.segmento})</td>
                            <td class="py-2 px-2 text-right font-bold">${precioConIvaMostrado}</td>
                        </tr>
                    `;
                });
                html += `</tbody></table>`;
            });
            html += '</div>';
            container.innerHTML = html;
        } catch (error) {
            console.error("Error al renderizar el catálogo:", error);
            container.innerHTML = `<p class="text-center text-red-500">Error al cargar el catálogo.</p>`;
        }
    }

    /**
     * Genera una o varias imágenes del catálogo y las comparte.
     */
    async function handleGenerateCatalogoImage() {
        const MAX_BRANDS_PER_PAGE = 5; // Máximo de marcas por imagen

        const shareButton = document.getElementById('generateCatalogoImageBtn');
        const tasaInputContainer = document.getElementById('tasa-input-container');
        const buttonsContainer = document.getElementById('catalogo-buttons-container');

        if (_marcasCache.length === 0) return;

        const pagesOfBrands = [];
        for (let i = 0; i < _marcasCache.length; i += MAX_BRANDS_PER_PAGE) {
            pagesOfBrands.push(_marcasCache.slice(i, i + MAX_BRANDS_PER_PAGE));
        }
        const totalPages = pagesOfBrands.length;

        shareButton.textContent = `Generando ${totalPages} imagen(es)...`;
        shareButton.disabled = true;
        tasaInputContainer.classList.add('hidden');
        buttonsContainer.classList.add('hidden');

        try {
            const imageFiles = await Promise.all(pagesOfBrands.map(async (brands, index) => {
                const pageNum = index + 1;

                let contentHtml = '<div class="space-y-4">';
                brands.forEach(marca => {
                    contentHtml += `<table class="min-w-full bg-transparent text-lg">
                                <thead class="text-black">
                                    <tr><th colspan="2" class="py-2 px-4 bg-gray-100 font-bold text-left text-xl">${marca}</th></tr>
                                    <tr><th class="py-2 px-2 text-left font-bold">PRESENTACIÓN</th><th class="py-2 px-2 text-right font-bold">PRECIO</th></tr>
                                </thead><tbody>`;
                    const productosDeMarca = _productosAgrupadosCache[marca]; // Ya están ordenados
                    productosDeMarca.forEach(p => {
                        let precioConIvaMostrado = _catalogoMonedaActual === 'COP' && _catalogoTasaCOP > 0
                            ? `COP ${(Math.ceil((p.precio * _catalogoTasaCOP) / 100) * 100).toLocaleString('es-CO')}`
                            : `$${p.precio.toFixed(2)}`;
                        contentHtml += `<tr class="border-b border-gray-200"><td class="py-2 px-2 text-gray-900">${p.presentacion} <span class="text-base text-gray-600">(${p.unidadTipo || 'und.'})</span> (${p.segmento})</td><td class="py-2 px-2 text-right font-bold">${precioConIvaMostrado}</td></tr>`;
                    });
                    contentHtml += `</tbody></table>`;
                });
                contentHtml += '</div>';
                
                const title = document.querySelector('#catalogo-para-imagen h2').textContent;
                const fullPageHtml = `
                    <div class="bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-xl" style="width: 800px;">
                        <h2 class="text-4xl font-bold text-black mb-2 text-center">${title}</h2>
                        <p class="text-center text-gray-800 mb-1 text-base">DISTRIBUIDORA CASTILLO YAÑEZ C.A</p>
                        <p class="text-center text-gray-700 mb-4 text-base italic">(Todos los precios incluyen IVA)</p>
                        ${contentHtml}
                        <p class="text-center text-gray-600 mt-4 text-sm">Página ${pageNum} de ${totalPages}</p>
                    </div>`;

                const tempDiv = document.createElement('div');
                tempDiv.style.position = 'absolute';
                tempDiv.style.left = '-9999px';
                tempDiv.innerHTML = fullPageHtml;
                document.body.appendChild(tempDiv);

                const pageWrapper = tempDiv.firstElementChild;
                if (_currentBgImage) {
                    pageWrapper.style.backgroundImage = `linear-gradient(rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.6)), url('${_currentBgImage}')`;
                    pageWrapper.style.backgroundSize = 'cover';
                    pageWrapper.style.backgroundPosition = 'center';
                }

                // --- MEJORA DE CALIDAD APLICADA AQUÍ ---
                const canvas = await html2canvas(pageWrapper, { scale: 3, useCORS: true, allowTaint: true });
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                
                document.body.removeChild(tempDiv);
                return new File([blob], `catalogo-pagina-${pageNum}.png`, { type: "image/png" });
            }));

            if (navigator.share && imageFiles.length > 0) {
                await navigator.share({ files: imageFiles, title: "Catálogo de Productos" });
            } else {
                alert('La función para compartir no está disponible o no se generaron imágenes.');
            }
        } catch (error) {
            console.error("Error al generar imagen del catálogo: ", error);
        } finally {
            shareButton.textContent = 'Generar Imagen';
            shareButton.disabled = false;
            tasaInputContainer.classList.remove('hidden');
            buttonsContainer.classList.remove('hidden');
        }
    }
    
    // Exponer función para invalidar la caché
    window.catalogoModule = {
        invalidateCache: () => { _segmentoOrderCacheCatalogo = null; }
    };

})();
