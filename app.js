'use strict';

/*
 * bs-triangulate
 *
 * A small Leaflet/OpenStreetMap browser app for range/bearing and circle-based
 * triangulation. This file deliberately avoids build tooling and classes. Leaflet.Geodesic is used as a rendering plugin while the project model remains the source of truth; Leaflet layers are treated as a render target.
 */

// =============================================================================
// Constants
// =============================================================================

const APP_NAME = 'bs-triangulate';
const PROJECT_VERSION = 1;
const STORAGE_KEY = 'bs-triangulate-project';

const DEFAULT_MAP_CENTER = [-25.2744, 133.7751];
const DEFAULT_MAP_ZOOM = 4;
const GEOLOCATION_ZOOM = 12;
const LOCATE_ZOOM = 15;

const MODE_SELECT = 'select';
const MODE_DRAW_LINE = 'draw-line';
const MODE_DRAW_CIRCLE = 'draw-circle';

const OBJECT_TYPE_LINE = 'line';
const OBJECT_TYPE_CIRCLE = 'circle';

const EARTH_RADIUS_METERS = 6371008.8;
const LINE_HIT_TOLERANCE_PIXELS = 10;
const CIRCLE_HIT_TOLERANCE_PIXELS = 10;
const CLICK_CYCLE_TOLERANCE_PIXELS = 8;

const SIDEBAR_EXPANDED_CLASS = 'sidebar-expanded';
const SIDEBAR_COLLAPSED_CLASS = 'sidebar-collapsed';
const SELECTED_CLASS = 'is-selected';
const ACTIVE_CLASS = 'is-active';
const HIDDEN_CLASS = 'is-hidden';

const UNITS = {
    m: {
        label: 'metres',
        suffix: 'm',
        meters: 1,
        precision: 0
    },
    km: {
        label: 'kilometres',
        suffix: 'km',
        meters: 1000,
        precision: 2
    },
    nm: {
        label: 'nautical miles',
        suffix: 'nm',
        meters: 1852,
        precision: 2
    },
    mi: {
        label: 'statute miles',
        suffix: 'mi',
        meters: 1609.344,
        precision: 2
    },
    ft: {
        label: 'feet',
        suffix: 'ft',
        meters: 0.3048,
        precision: 0
    }
};

// =============================================================================
// Application state
// =============================================================================

let map;
let project;
let currentMode = MODE_SELECT;
let selectedObjectId = null;
let drawState = null;
let hasLoadedSavedProject = false;

const leafletLayers = new Map();
const elements = {};

let userLocationMarker = null;
let userLocationAccuracyCircle = null;

let lastClickCycle = {
    point: null,
    candidateIds: [],
    index: -1
};

// Leaflet native base layer support
let baseLayers = {};
let layerControl = null;

// =============================================================================
// Startup
// =============================================================================

/**
 * Boots the application after the DOM has loaded.
 *
 * The startup sequence intentionally creates the project model before Leaflet is
 * initialised. That allows saved map state to drive the initial map view.
 *
 * @returns {void}
 */
function bootApplication() {
    cacheDomElements();
    const savedProject = loadProjectFromLocalStorage();
    project = savedProject || createEmptyProject();
    hasLoadedSavedProject = Boolean(savedProject);

    normaliseLoadedProject(project);
    selectedObjectId = project.selectedObjectId || null;

    initialiseMap();
    registerGlobalEventHandlers();
    initialiseToolbarState();
    initialiseSidebarState();
    renderAllObjects();
    renderObjectList();
    renderPropertiesPanel();
    setMode(MODE_SELECT);

    if (!hasLoadedSavedProject) {
        initialiseMapFromGeolocation();
    }
}

/**
 * Stores references to DOM elements used by the app.
 *
 * Missing elements are tolerated so that early HTML skeletons can still load the
 * script without crashing. Functions that need a particular element guard
 * against null references.
 *
 * @returns {void}
 */
function cacheDomElements() {
    elements.app = document.getElementById('app');
    elements.map = document.getElementById('map');
    elements.sidebar = document.getElementById('sidebar');
    elements.sidebarToggleButton = document.getElementById('sidebar-toggle');
    elements.fileMenuButton = document.getElementById('file-menu-button');
    elements.fileMenu = document.getElementById('file-menu');
    elements.newButton = document.getElementById('new-project');
    elements.openButton = document.getElementById('open-project');
    elements.saveButton = document.getElementById('save-project');
    elements.openFileInput = document.getElementById('open-file-input');
    elements.selectButton = document.getElementById('mode-select');
    elements.lineButton = document.getElementById('mode-line');
    elements.circleButton = document.getElementById('mode-circle');
    elements.unitsSelect = document.getElementById('units-select');
    elements.fullscreenButton = document.getElementById('fullscreen-toggle');
    elements.propertiesAccordion = document.getElementById('properties-accordion');
    elements.propertiesHeader = document.getElementById('properties-header');
    elements.propertiesBody = document.getElementById('properties-body');
    elements.objectsAccordion = document.getElementById('objects-accordion');
    elements.objectsHeader = document.getElementById('objects-header');
    elements.objectsBody = document.getElementById('objects-body');
    elements.status = document.getElementById('status');
}

// =============================================================================
// Project model
// =============================================================================

/**
 * Creates a fresh empty project model.
 *
 * @returns {Object} New project object.
 */
function createEmptyProject() {
    return {
        version: PROJECT_VERSION,
        app: APP_NAME,
        units: 'km',
        map: {
            center: [...DEFAULT_MAP_CENTER],
            zoom: DEFAULT_MAP_ZOOM,
            baseLayer: 'osm'
        },
        ui: {
            sidebarCollapsed: false,
            propertiesExpanded: true,
            objectsExpanded: true
        },
        counters: {
            line: 0,
            circle: 0
        },
        selectedObjectId: null,
        objects: []
    };
}

/**
 * Ensures a loaded project has all fields expected by the current app version.
 *
 * This gives the JSON format a small amount of forward tolerance while still
 * rejecting genuinely incompatible data at open time.
 *
 * @param {Object} loadedProject - Project loaded from JSON/localStorage.
 * @returns {void}
 */
function normaliseLoadedProject(loadedProject) {
    loadedProject.version = loadedProject.version || PROJECT_VERSION;
    loadedProject.app = loadedProject.app || APP_NAME;
    loadedProject.units = UNITS[loadedProject.units] ? loadedProject.units : 'km';
    loadedProject.map = loadedProject.map || { center: [...DEFAULT_MAP_CENTER], zoom: DEFAULT_MAP_ZOOM };
    loadedProject.map.center = Array.isArray(loadedProject.map.center) ? loadedProject.map.center : [...DEFAULT_MAP_CENTER];
    loadedProject.map.zoom = Number.isFinite(loadedProject.map.zoom) ? loadedProject.map.zoom : DEFAULT_MAP_ZOOM;
    // Normalise baseLayer to one of 'osm', 'satellite', 'topo', default 'osm'
    const allowedBaseLayers = ['osm', 'satellite', 'topo'];
    let baseLayerKey = loadedProject.map.baseLayer;
    if (!allowedBaseLayers.includes(baseLayerKey)) {
        baseLayerKey = 'osm';
    }
    loadedProject.map.baseLayer = baseLayerKey;
    loadedProject.ui = loadedProject.ui || {};
    loadedProject.ui.sidebarCollapsed = Boolean(loadedProject.ui.sidebarCollapsed);
    loadedProject.ui.propertiesExpanded = loadedProject.ui.propertiesExpanded !== false;
    loadedProject.ui.objectsExpanded = loadedProject.ui.objectsExpanded !== false;
    loadedProject.counters = loadedProject.counters || { line: 0, circle: 0 };
    loadedProject.counters.line = Number.isFinite(loadedProject.counters.line) ? loadedProject.counters.line : 0;
    loadedProject.counters.circle = Number.isFinite(loadedProject.counters.circle) ? loadedProject.counters.circle : 0;
    loadedProject.objects = Array.isArray(loadedProject.objects) ? loadedProject.objects : [];
    loadedProject.selectedObjectId = loadedProject.selectedObjectId || null;
}

/**
 * Finds an object in the project by ID.
 *
 * @param {string} objectId - Object ID to locate.
 * @returns {Object|null} Matching object, or null.
 */
function findObjectById(objectId) {
    return project.objects.find((object) => object.id === objectId) || null;
}

/**
 * Adds an object to the project and selects it.
 *
 * @param {Object} object - Line or circle object.
 * @returns {void}
 */
function addObject(object) {
    project.objects.push(object);
    selectObject(object.id);
    persistAndRender();
}

/**
 * Removes an object from the project.
 *
 * @param {string} objectId - Object ID to remove.
 * @returns {void}
 */
function removeObject(objectId) {
    const index = project.objects.findIndex((object) => object.id === objectId);
    if (index === -1) {
        return;
    }

    removeLeafletLayers(objectId);
    project.objects.splice(index, 1);

    if (selectedObjectId === objectId) {
        selectedObjectId = null;
        project.selectedObjectId = null;
    }

    persistAndRender();
}

/**
 * Creates the next stable object ID for a type.
 *
 * @param {string} type - Object type.
 * @returns {string} New object ID.
 */
function createObjectId(type) {
    return `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates the next display name for a line or circle.
 *
 * @param {'line'|'circle'} type - Object type.
 * @returns {string} Display name.
 */
function createObjectName(type) {
    project.counters[type] += 1;
    return type === OBJECT_TYPE_LINE ? `Line ${project.counters[type]}` : `Circle ${project.counters[type]}`;
}

// =============================================================================
// Map initialisation
// =============================================================================

/**
 * Initialises the Leaflet map and base OpenStreetMap tile layer.
 *
 * @returns {void}
 */
function initialiseMap() {
    if (!elements.map || typeof L === 'undefined') {
        setStatus('Map could not be initialised. Confirm Leaflet and #map are present.');
        return;
    }

    map = L.map(elements.map, {
        zoomControl: true,
        preferCanvas: true
    }).setView(project.map.center, project.map.zoom);

    // Setup base layers
    baseLayers = getConfiguredBaseLayers();
    const allowedBaseLayers = ['osm', 'satellite', 'topo'];
    let initialBaseLayerKey = project.map.baseLayer;
    if (!allowedBaseLayers.includes(initialBaseLayerKey)) {
        initialBaseLayerKey = 'osm';
    }
    // Add only the saved base layer to the map
    baseLayers[initialBaseLayerKey].addTo(map);

    // Create native L.control.layers
    const baseLayerLabels = {
        'osm': 'OpenStreetMap',
        'satellite': 'Satellite',
        'topo': 'Topographic'
    };
    const layersForControl = {};
    for (const key of allowedBaseLayers) {
        layersForControl[baseLayerLabels[key]] = baseLayers[key];
    }
    layerControl = L.control.layers(layersForControl, null, { position: 'topright', collapsed: true }).addTo(map);

    // Listen for base layer changes
    map.on('baselayerchange', function (e) {
        const key = resolveBaseLayerKey(e.layer);
        project.map.baseLayer = key;
        persistProject();
    });

    invalidateMapSizeSoon();
    addLocateControl();

    map.on('click', handleMapClick);
    map.on('mousemove', handleMapMouseMove);
    map.on('moveend zoomend', handleMapViewChanged);
}

/**
 * Returns an object with configured Leaflet tile layers for the three supported base layers.
 * @returns {{osm: L.TileLayer, satellite: L.TileLayer, topo: L.TileLayer}}
 */
function getConfiguredBaseLayers() {
    // OpenStreetMap Standard
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    });
    // Esri World Imagery
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });
    // OpenTopoMap
    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)'
    });
    return { osm, satellite, topo };
}

/**
 * Resolves the base layer key ('osm', 'satellite', or 'topo') from a given Leaflet tile layer instance.
 * Returns 'osm' as a fallback.
 * @param {L.TileLayer} layer
 * @returns {'osm'|'satellite'|'topo'}
 */
function resolveBaseLayerKey(layer) {
    for (const key of ['osm', 'satellite', 'topo']) {
        if (baseLayers[key] === layer) {
            return key;
        }
    }
    return 'osm';
}

/**
 * Attempts to centre the map on the browser geolocation result.
 *
 * If permission is denied or geolocation is unavailable, the default Australia
 * view is retained.
 *
 * @returns {void}
 */
function initialiseMapFromGeolocation() {
    if (!navigator.geolocation || !map) {
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            project.map.center = [lat, lng];
            project.map.zoom = GEOLOCATION_ZOOM;
            map.setView(project.map.center, project.map.zoom);
        },
        () => {
            // Permission denied or unavailable: the default map view is already set.
        },
        {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 600000
        }
    );
}

/**
 * Adds a lightweight Leaflet-style control for centring on the user's location.
 *
 * This avoids pulling in a locate-control plugin while still giving the map a
 * conventional native control. The control performs a one-shot geolocation
 * lookup rather than continuously tracking the user.
 *
 * @returns {void}
 */
function addLocateControl() {
    if (!map || typeof L === 'undefined') {
        return;
    }

    const LocateControl = L.Control.extend({
        options: {
            position: 'topleft'
        },

        onAdd() {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-locate');
            const button = L.DomUtil.create('button', 'locate-control-button', container);

            button.type = 'button';
            button.title = 'Centre on current location';
            button.setAttribute('aria-label', 'Centre on current location');
            button.innerHTML = '<i class="ph ph-navigation-arrow" aria-hidden="true"></i>';

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);
            L.DomEvent.on(button, 'click', handleLocateControlClick);

            return container;
        }
    });

    map.addControl(new LocateControl());
}

/**
 * Handles clicks on the custom locate control.
 *
 * @param {Event} event - Click event.
 * @returns {void}
 */
function handleLocateControlClick(event) {
    if (event) {
        L.DomEvent.stop(event);
    }

    locateAndCentreMap();
}

/**
 * Requests the browser's current position and centres the map on success.
 *
 * This is intentionally a one-shot location request. It does not watch the
 * user's location or keep the map following them.
 *
 * @returns {void}
 */
function locateAndCentreMap() {
    if (!navigator.geolocation || !map) {
        setStatus('Geolocation is not available in this browser.');
        return;
    }

    setStatus('Locating current position...');

    navigator.geolocation.getCurrentPosition(
        handleLocateSuccess,
        handleLocateFailure,
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000
        }
    );
}

/**
 * Centres the map and updates the visible user-location marker.
 *
 * @param {GeolocationPosition} position - Browser geolocation result.
 * @returns {void}
 */
function handleLocateSuccess(position) {
    const point = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };
    const accuracyMeters = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : 0;
    const targetZoom = Math.max(map.getZoom(), LOCATE_ZOOM);

    updateUserLocationLayers(point, accuracyMeters);
    map.setView(pointToLatLng(point), targetZoom);
    setStatus(`Centred on current location. Accuracy ±${Math.round(accuracyMeters)} m.`);
}

/**
 * Reports a browser geolocation failure in the status bar.
 *
 * @param {GeolocationPositionError} error - Browser geolocation error.
 * @returns {void}
 */
function handleLocateFailure(error) {
    if (error.code === error.PERMISSION_DENIED) {
        setStatus('Location permission denied.');
        return;
    }

    if (error.code === error.TIMEOUT) {
        setStatus('Location request timed out.');
        return;
    }

    setStatus('Could not determine current location.');
}

/**
 * Creates or updates the marker and accuracy circle for the user's location.
 *
 * @param {{lat: number, lng: number}} point - Current location coordinate.
 * @param {number} accuracyMeters - Browser-reported accuracy radius in metres.
 * @returns {void}
 */
function updateUserLocationLayers(point, accuracyMeters) {
    const latLng = pointToLatLng(point);

    if (!userLocationMarker) {
        userLocationMarker = L.marker(latLng, {
            interactive: false,
            icon: createUserLocationIcon(),
            keyboard: false,
            zIndexOffset: 1000
        }).addTo(map);
    } else {
        userLocationMarker.setLatLng(latLng);
    }

    if (!userLocationAccuracyCircle) {
        userLocationAccuracyCircle = L.circle(latLng, getUserLocationAccuracyStyle()).addTo(map);
    } else {
        userLocationAccuracyCircle.setLatLng(latLng);
    }

    userLocationAccuracyCircle.setRadius(Math.max(accuracyMeters, 1));
}

/**
 * Creates the blue dot icon used for the user's current location.
 *
 * @returns {L.DivIcon} Leaflet div icon.
 */
function createUserLocationIcon() {
    return L.divIcon({
        className: 'bs-user-location-marker',
        html: '<span></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });
}

/**
 * Returns the style for the browser-reported location accuracy circle.
 *
 * @returns {Object} Leaflet circle style.
 */
function getUserLocationAccuracyStyle() {
    return {
        color: '#2563eb',
        weight: 1,
        opacity: 0.45,
        fillColor: '#2563eb',
        fillOpacity: 0.12,
        interactive: false
    };
}

/**
 * Persists map centre and zoom whenever the map view changes.
 *
 * @returns {void}
 */
function handleMapViewChanged() {
    if (!map || !project) {
        return;
    }

    const center = map.getCenter();
    project.map.center = [center.lat, center.lng];
    project.map.zoom = map.getZoom();
    saveProjectToLocalStorage();
}

// =============================================================================
// Toolbar and global events
// =============================================================================

/**
 * Registers DOM and keyboard event handlers.
 *
 * @returns {void}
 */
function registerGlobalEventHandlers() {
    elements.sidebarToggleButton?.addEventListener('click', toggleSidebar);
    elements.fileMenuButton?.addEventListener('click', toggleFileMenu);
    elements.newButton?.addEventListener('click', handleNewProject);
    elements.openButton?.addEventListener('click', () => elements.openFileInput?.click());
    elements.saveButton?.addEventListener('click', saveProjectAsJsonFile);
    elements.openFileInput?.addEventListener('change', handleOpenProjectFile);
    elements.selectButton?.addEventListener('click', () => setMode(MODE_SELECT));
    elements.lineButton?.addEventListener('click', () => setMode(MODE_DRAW_LINE));
    elements.circleButton?.addEventListener('click', () => setMode(MODE_DRAW_CIRCLE));
    elements.unitsSelect?.addEventListener('change', handleUnitsChanged);
    elements.fullscreenButton?.addEventListener('click', toggleFullscreen);
    elements.propertiesHeader?.addEventListener('click', togglePropertiesAccordion);
    elements.objectsHeader?.addEventListener('click', toggleObjectsAccordion);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', updateFullscreenButtonLabel);
}

/**
 * Reflects the project state in toolbar controls.
 *
 * @returns {void}
 */
function initialiseToolbarState() {
    if (elements.unitsSelect) {
        elements.unitsSelect.value = project.units;
    }

    updateModeButtons();
    updateFullscreenButtonLabel();
}

/**
 * Handles keyboard shortcuts for mode changes and file actions.
 *
 * @param {KeyboardEvent} event - Keyboard event.
 * @returns {void}
 */
function handleKeyDown(event) {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

    if (event.key === 'Escape') {
        event.preventDefault();
        cancelDrawing();
        setMode(MODE_SELECT);
        return;
    }

    if (isTyping) {
        return;
    }

    if (event.ctrlKey || event.metaKey) {
        handleControlShortcut(event);
        return;
    }

    if (event.key.toLowerCase() === 'l') {
        setMode(MODE_DRAW_LINE);
    } else if (event.key.toLowerCase() === 'c') {
        setMode(MODE_DRAW_CIRCLE);
    }
}

/**
 * Handles Ctrl/Cmd keyboard shortcuts.
 *
 * @param {KeyboardEvent} event - Keyboard event.
 * @returns {void}
 */
function handleControlShortcut(event) {
    const key = event.key.toLowerCase();

    if (key === 'n') {
        event.preventDefault();
        handleNewProject();
    } else if (key === 'o') {
        event.preventDefault();
        elements.openFileInput?.click();
    } else if (key === 's') {
        event.preventDefault();
        saveProjectAsJsonFile();
    } else if (key === 'f') {
        event.preventDefault();
        toggleFullscreen();
    }
}

/**
 * Sets the active interaction mode.
 *
 * @param {string} mode - New mode.
 * @returns {void}
 */
function setMode(mode) {
    if (currentMode !== mode) {
        cancelDrawing();
    }

    currentMode = mode;
    updateModeButtons();
    setStatus(getModeStatusText(mode));
}

/**
 * Updates toolbar button active states for the current mode.
 *
 * @returns {void}
 */
function updateModeButtons() {
    toggleElementClass(elements.selectButton, ACTIVE_CLASS, currentMode === MODE_SELECT);
    toggleElementClass(elements.lineButton, ACTIVE_CLASS, currentMode === MODE_DRAW_LINE);
    toggleElementClass(elements.circleButton, ACTIVE_CLASS, currentMode === MODE_DRAW_CIRCLE);
}

/**
 * Returns user-facing status text for a mode.
 *
 * @param {string} mode - Current mode.
 * @returns {string} Status message.
 */
function getModeStatusText(mode) {
    if (mode === MODE_DRAW_LINE) {
        return 'Line mode: click start point, then click end point.';
    }

    if (mode === MODE_DRAW_CIRCLE) {
        return 'Circle mode: click centre point, then click radius.';
    }

    return 'Select mode.';
}

/**
 * Handles measurement unit changes.
 *
 * @returns {void}
 */
function handleUnitsChanged() {
    const unit = elements.unitsSelect?.value;
    if (!UNITS[unit]) {
        return;
    }

    project.units = unit;
    persistAndRender();
}

/**
 * Toggles the basic File menu visibility.
 *
 * @returns {void}
 */
function toggleFileMenu() {
    elements.fileMenu?.classList.toggle(HIDDEN_CLASS);
}

/**
 * Toggles browser fullscreen mode.
 *
 * @returns {void}
 */
function toggleFullscreen() {
    const root = elements.app || document.documentElement;

    if (!document.fullscreenElement) {
        root.requestFullscreen?.();
    } else {
        document.exitFullscreen?.();
    }
}

/**
 * Updates the fullscreen button label to match browser state.
 *
 * @returns {void}
 */
function updateFullscreenButtonLabel() {
    if (!elements.fullscreenButton) {
        return;
    }

    const icon = document.fullscreenElement
        ? 'ph-corners-in'
        : 'ph-corners-out';
    const label = document.fullscreenElement
        ? 'Exit Fullscreen'
        : 'Fullscreen';

    elements.fullscreenButton.innerHTML = `
        <i class="ph ${icon}" aria-hidden="true"></i>
        <span>${label}</span>
    `;
}

// =============================================================================
// Sidebar and accordions
// =============================================================================

/**
 * Applies the saved sidebar and accordion state to the DOM.
 *
 * @returns {void}
 */
function initialiseSidebarState() {
    applySidebarState();
    applyAccordionState();
}

/**
 * Toggles the sidebar collapsed state.
 *
 * @returns {void}
 */
function toggleSidebar() {
    project.ui.sidebarCollapsed = !project.ui.sidebarCollapsed;
    applySidebarState();
    saveProjectToLocalStorage();
    invalidateMapSizeSoon();
}

/**
 * Applies sidebar expanded/collapsed classes.
 *
 * @returns {void}
 */
function applySidebarState() {
    if (!elements.app) {
        return;
    }

    elements.app.classList.toggle(SIDEBAR_COLLAPSED_CLASS, project.ui.sidebarCollapsed);
    elements.app.classList.toggle(SIDEBAR_EXPANDED_CLASS, !project.ui.sidebarCollapsed);

    if (elements.sidebarToggleButton) {
        const icon = project.ui.sidebarCollapsed
            ? 'ph-sidebar-simple'
            : 'ph-sidebar-simple';
        const title = project.ui.sidebarCollapsed
            ? 'Expand sidebar'
            : 'Collapse sidebar';

        elements.sidebarToggleButton.title = title;
        elements.sidebarToggleButton.setAttribute('aria-label', title);
        elements.sidebarToggleButton.innerHTML = `
            <i class="ph ${icon}" aria-hidden="true"></i>
        `;
    }
}

/**
 * Toggles the properties accordion open/closed state.
 *
 * @returns {void}
 */
function togglePropertiesAccordion() {
    project.ui.propertiesExpanded = !project.ui.propertiesExpanded;
    applyAccordionState();
    saveProjectToLocalStorage();
}

/**
 * Toggles the objects accordion open/closed state.
 *
 * @returns {void}
 */
function toggleObjectsAccordion() {
    project.ui.objectsExpanded = !project.ui.objectsExpanded;
    applyAccordionState();
    saveProjectToLocalStorage();
}

/**
 * Applies accordion visibility to the sidebar panels.
 *
 * @returns {void}
 */
function applyAccordionState() {
    elements.propertiesBody?.classList.toggle(HIDDEN_CLASS, !project.ui.propertiesExpanded);
    elements.objectsBody?.classList.toggle(HIDDEN_CLASS, !project.ui.objectsExpanded);
    elements.propertiesAccordion?.classList.toggle('is-open', project.ui.propertiesExpanded);
    elements.objectsAccordion?.classList.toggle('is-open', project.ui.objectsExpanded);
}

/**
 * Invalidates Leaflet's map size after layout changes.
 *
 * Leaflet needs this nudge when the sidebar collapses or fullscreen state alters
 * the map container dimensions.
 *
 * @returns {void}
 */
function invalidateMapSizeSoon() {
    window.setTimeout(() => map?.invalidateSize(), 100);
}

// =============================================================================
// Drawing state transitions
// =============================================================================

/**
 * Handles map click events for the current mode.
 *
 * @param {L.LeafletMouseEvent} event - Leaflet click event.
 * @returns {void}
 */
function handleMapClick(event) {
    if (currentMode === MODE_DRAW_LINE) {
        handleLineDrawingClick(event.latlng);
        return;
    }

    if (currentMode === MODE_DRAW_CIRCLE) {
        handleCircleDrawingClick(event.latlng);
        return;
    }

    handleSelectionClick(event);
}

/**
 * Handles map mouse move events for drawing previews.
 *
 * @param {L.LeafletMouseEvent} event - Leaflet mousemove event.
 * @returns {void}
 */
function handleMapMouseMove(event) {
    if (currentMode === MODE_DRAW_LINE && drawState?.type === OBJECT_TYPE_LINE) {
        updateLinePreview(event.latlng);
    }

    if (currentMode === MODE_DRAW_CIRCLE && drawState?.type === OBJECT_TYPE_CIRCLE) {
        updateCirclePreview(event.latlng);
    }
}

/**
 * Cancels any in-progress drawing preview.
 *
 * @returns {void}
 */
function cancelDrawing() {
    if (!drawState) {
        return;
    }

    if (drawState.previewLayer) {
        map?.removeLayer(drawState.previewLayer);
    }

    if (drawState.previewMarker) {
        map?.removeLayer(drawState.previewMarker);
    }

    drawState = null;
}

// =============================================================================
// Line objects
// =============================================================================

/**
 * Handles clicks while drawing a line.
 *
 * @param {L.LatLng} latlng - Clicked map coordinate.
 * @returns {void}
 */
function handleLineDrawingClick(latlng) {
    if (!drawState) {
        drawState = {
            type: OBJECT_TYPE_LINE,
            start: latLngToPoint(latlng),
            previewMarker: createPointMarker(latlng, 'green', false).addTo(map),
            previewLayer: null
        };
        return;
    }

    const line = createLineObject(drawState.start, latLngToPoint(latlng));
    cancelDrawing();
    addObject(line);
    setMode(MODE_SELECT);
}

/**
 * Updates the temporary line preview during drawing.
 *
 * @param {L.LatLng} latlng - Current mouse coordinate.
 * @returns {void}
 */
function updateLinePreview(latlng) {
    if (!drawState?.start || !map) {
        return;
    }

    const points = [pointToLatLng(drawState.start), latlng];

    if (!drawState.previewLayer) {
        drawState.previewLayer = new L.Geodesic(points, getLineStyle(false, true)).addTo(map);
    } else {
        drawState.previewLayer.setLatLngs(points);
    }
}

/**
 * Creates a line object for the project model.
 *
 * @param {{lat: number, lng: number}} start - Start coordinate.
 * @param {{lat: number, lng: number}} end - End coordinate.
 * @returns {Object} New line object.
 */
function createLineObject(start, end) {
    return {
        id: createObjectId(OBJECT_TYPE_LINE),
        type: OBJECT_TYPE_LINE,
        name: createObjectName(OBJECT_TYPE_LINE),
        start: { ...start },
        end: { ...end }
    };
}

/**
 * Renders or updates a line object's Leaflet layers.
 *
 * @param {Object} line - Line object.
 * @returns {void}
 */
function renderLine(line) {
    const selected = line.id === selectedObjectId;
    let bundle = leafletLayers.get(line.id);

    if (!bundle) {
        bundle = createLineLayerBundle(line);
        leafletLayers.set(line.id, bundle);
    }

    const startLatLng = pointToLatLng(line.start);
    const endLatLng = pointToLatLng(line.end);

    bundle.line.setLatLngs([startLatLng, endLatLng]);
    bundle.line.setStyle(getLineStyle(selected, false));
    bundle.startMarker.setLatLng(startLatLng);
    bundle.endMarker.setLatLng(endLatLng);
    bundle.label.setLatLng(getLineMidpointLatLng(line));
    bundle.label.setIcon(createLabelIcon(getLineLabelText(line), selected));

    setMarkerSelected(bundle.startMarker, selected);
    setMarkerSelected(bundle.endMarker, selected);
}

/**
 * Creates all Leaflet layers required to display and edit a line.
 *
 * @param {Object} line - Line object.
 * @returns {Object} Leaflet layer bundle.
 */
function createLineLayerBundle(line) {
    const startLatLng = pointToLatLng(line.start);
    const endLatLng = pointToLatLng(line.end);

    const polyline = new L.Geodesic([startLatLng, endLatLng], getLineStyle(false, false)).addTo(map);
    const startMarker = createPointMarker(startLatLng, 'green', true).addTo(map);
    const endMarker = createPointMarker(endLatLng, 'red', true).addTo(map);
    const label = L.marker(getLineMidpointLatLng(line), {
        interactive: false,
        icon: createLabelIcon(getLineLabelText(line), false)
    }).addTo(map);

    polyline.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        selectObject(line.id);
    });

    startMarker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        selectObject(line.id);
    });

    endMarker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        selectObject(line.id);
    });

    startMarker.on('drag', (event) => updateLineEndpoint(line.id, 'start', latLngToPoint(event.target.getLatLng()), true));
    endMarker.on('drag', (event) => updateLineEndpoint(line.id, 'end', latLngToPoint(event.target.getLatLng()), true));
    startMarker.on('dragend', persistAndRender);
    endMarker.on('dragend', persistAndRender);

    return {
        type: OBJECT_TYPE_LINE,
        line: polyline,
        startMarker,
        endMarker,
        label
    };
}

/**
 * Updates a line endpoint in the project model.
 *
 * During live marker dragging we avoid a full render because replacing a
 * Leaflet marker icon mid-drag interrupts Leaflet's drag interaction. Instead,
 * we update only the dependent line and label geometry, then do a full render on
 * dragend.
 *
 * @param {string} lineId - Line object ID.
 * @param {'start'|'end'} endpoint - Endpoint to update.
 * @param {{lat: number, lng: number}} point - New coordinate.
 * @param {boolean} liveDrag - Whether this update is happening during marker drag.
 * @returns {void}
 */
function updateLineEndpoint(lineId, endpoint, point, liveDrag = false) {
    const line = findObjectById(lineId);
    if (!line || line.type !== OBJECT_TYPE_LINE) {
        return;
    }

    line[endpoint] = { ...point };

    if (liveDrag) {
        updateLineLiveDragVisuals(line);
        return;
    }

    renderObject(line);
    renderObjectList();
    renderPropertiesPanel();
}

/**
 * Updates line visuals during marker dragging without replacing marker icons.
 *
 * Leaflet's marker drag implementation is sensitive to the marker DOM being
 * replaced mid-drag. This function updates only the polyline and measurement
 * label, leaving the actively dragged marker untouched until dragend.
 *
 * @param {Object} line - Line object being dragged.
 * @returns {void}
 */
function updateLineLiveDragVisuals(line) {
    const bundle = leafletLayers.get(line.id);
    if (!bundle) {
        return;
    }

    const startLatLng = pointToLatLng(line.start);
    const endLatLng = pointToLatLng(line.end);

    bundle.line.setLatLngs([startLatLng, endLatLng]);
    bundle.label.setLatLng(getLineMidpointLatLng(line));
    bundle.label.setIcon(createLabelIcon(getLineLabelText(line), line.id === selectedObjectId));
}

/**
 * Updates the end point of a line from distance and bearing.
 *
 * @param {Object} line - Line object to update.
 * @param {number} distanceMeters - New distance in metres.
 * @param {number} bearingDegrees - New true bearing.
 * @returns {void}
 */
function updateLineFromDistanceAndBearing(line, distanceMeters, bearingDegrees) {
    line.end = calculateDestinationPoint(line.start, bearingDegrees, distanceMeters);
    persistAndRender();
}

/**
 * Returns style options for a line.
 *
 * @param {boolean} selected - Whether the object is selected.
 * @param {boolean} preview - Whether the line is only a drawing preview.
 * @returns {Object} Leaflet path style.
 */
function getLineStyle(selected, preview) {
    return {
        color: selected ? '#0f172a' : '#2563eb',
        weight: selected ? 4 : 3,
        opacity: preview ? 0.6 : 0.9,
        dashArray: preview ? '6 6' : null
    };
}

/**
 * Returns text for a line measurement label.
 *
 * @param {Object} line - Line object.
 * @returns {string} HTML label text.
 */
function getLineLabelText(line) {
    const distance = calculateDistanceMeters(line.start, line.end);
    const bearing = calculateInitialBearingDegrees(line.start, line.end);
    return `${formatDistance(distance)}<br>${formatBearing(bearing)} T (${bearingToCardinal(bearing)})`;
}

/**
 * Calculates an approximate midpoint for label placement.
 *
 * @param {Object} line - Line object.
 * @returns {L.LatLng} Midpoint coordinate.
 */
function getLineMidpointLatLng(line) {
    return L.latLng((line.start.lat + line.end.lat) / 2, (line.start.lng + line.end.lng) / 2);
}

// =============================================================================
// Circle objects
// =============================================================================

/**
 * Handles clicks while drawing a circle.
 *
 * @param {L.LatLng} latlng - Clicked map coordinate.
 * @returns {void}
 */
function handleCircleDrawingClick(latlng) {
    if (!drawState) {
        drawState = {
            type: OBJECT_TYPE_CIRCLE,
            center: latLngToPoint(latlng),
            previewMarker: createPointMarker(latlng, 'green', false).addTo(map),
            previewLayer: null
        };
        return;
    }

    const radiusMeters = calculateDistanceMeters(drawState.center, latLngToPoint(latlng));
    const circle = createCircleObject(drawState.center, radiusMeters);
    cancelDrawing();
    addObject(circle);
    setMode(MODE_SELECT);
}

/**
 * Updates the temporary circle preview during drawing.
 *
 * @param {L.LatLng} latlng - Current mouse coordinate.
 * @returns {void}
 */
function updateCirclePreview(latlng) {
    if (!drawState?.center || !map) {
        return;
    }

    const radiusMeters = calculateDistanceMeters(drawState.center, latLngToPoint(latlng));

    if (!drawState.previewLayer) {
        drawState.previewLayer = L.circle(pointToLatLng(drawState.center), getCircleStyle(false, true)).addTo(map);
    }

    drawState.previewLayer.setRadius(radiusMeters);
}

/**
 * Creates a circle object for the project model.
 *
 * @param {{lat: number, lng: number}} center - Circle centre coordinate.
 * @param {number} radiusMeters - Circle radius in metres.
 * @returns {Object} New circle object.
 */
function createCircleObject(center, radiusMeters) {
    return {
        id: createObjectId(OBJECT_TYPE_CIRCLE),
        type: OBJECT_TYPE_CIRCLE,
        name: createObjectName(OBJECT_TYPE_CIRCLE),
        center: { ...center },
        radiusMeters
    };
}

/**
 * Renders or updates a circle object's Leaflet layers.
 *
 * @param {Object} circle - Circle object.
 * @returns {void}
 */
function renderCircle(circle) {
    const selected = circle.id === selectedObjectId;
    let bundle = leafletLayers.get(circle.id);

    if (!bundle) {
        bundle = createCircleLayerBundle(circle);
        leafletLayers.set(circle.id, bundle);
    }

    const centerLatLng = pointToLatLng(circle.center);
    const handleLatLng = pointToLatLng(calculateDestinationPoint(circle.center, 90, circle.radiusMeters));

    bundle.circle.setLatLng(centerLatLng);
    bundle.circle.setRadius(circle.radiusMeters);
    bundle.circle.setStyle(getCircleStyle(selected, false));
    bundle.centerMarker.setLatLng(centerLatLng);
    bundle.radiusHandle.setLatLng(handleLatLng);
    bundle.radiusHandle.getElement()?.classList.toggle(HIDDEN_CLASS, !selected);
    bundle.label.setLatLng(handleLatLng);
    bundle.label.setIcon(createLabelIcon(getCircleLabelText(circle), selected));

    setMarkerSelected(bundle.centerMarker, selected);
    setMarkerSelected(bundle.radiusHandle, selected);
}

/**
 * Creates all Leaflet layers required to display and edit a circle.
 *
 * @param {Object} circle - Circle object.
 * @returns {Object} Leaflet layer bundle.
 */
function createCircleLayerBundle(circle) {
    const centerLatLng = pointToLatLng(circle.center);
    const handleLatLng = pointToLatLng(calculateDestinationPoint(circle.center, 90, circle.radiusMeters));

    const leafletCircle = L.circle(centerLatLng, getCircleStyle(false, false)).addTo(map);
    const centerMarker = createPointMarker(centerLatLng, 'green', true).addTo(map);
    const radiusHandle = createPointMarker(handleLatLng, 'neutral', true).addTo(map);
    const label = L.marker(handleLatLng, {
        interactive: false,
        icon: createLabelIcon(getCircleLabelText(circle), false)
    }).addTo(map);

    leafletCircle.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        selectObject(circle.id);
    });

    centerMarker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        selectObject(circle.id);
    });

    radiusHandle.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        selectObject(circle.id);
    });

    centerMarker.on('drag', (event) => updateCircleCenter(circle.id, latLngToPoint(event.target.getLatLng()), true));
    centerMarker.on('dragend', persistAndRender);
    radiusHandle.on('drag', (event) => updateCircleRadiusFromHandle(circle.id, latLngToPoint(event.target.getLatLng()), true));
    radiusHandle.on('dragend', persistAndRender);

    return {
        type: OBJECT_TYPE_CIRCLE,
        circle: leafletCircle,
        centerMarker,
        radiusHandle,
        label
    };
}

/**
 * Updates a circle centre coordinate.
 *
 * During live marker dragging we avoid a full render because replacing marker
 * icons mid-drag interrupts Leaflet's drag interaction. A full render happens on
 * dragend.
 *
 * @param {string} circleId - Circle object ID.
 * @param {{lat: number, lng: number}} point - New centre coordinate.
 * @param {boolean} liveDrag - Whether this update is happening during marker drag.
 * @returns {void}
 */
function updateCircleCenter(circleId, point, liveDrag = false) {
    const circle = findObjectById(circleId);
    if (!circle || circle.type !== OBJECT_TYPE_CIRCLE) {
        return;
    }

    circle.center = { ...point };

    if (liveDrag) {
        updateCircleLiveDragVisuals(circle, true);
        return;
    }

    renderObject(circle);
    renderObjectList();
    renderPropertiesPanel();
}

/**
 * Updates a circle radius from a dragged radius handle.
 *
 * During live marker dragging we update only dependent circle geometry and defer
 * the full render until dragend.
 *
 * @param {string} circleId - Circle object ID.
 * @param {{lat: number, lng: number}} handlePoint - Radius handle coordinate.
 * @param {boolean} liveDrag - Whether this update is happening during marker drag.
 * @returns {void}
 */
function updateCircleRadiusFromHandle(circleId, handlePoint, liveDrag = false) {
    const circle = findObjectById(circleId);
    if (!circle || circle.type !== OBJECT_TYPE_CIRCLE) {
        return;
    }

    circle.radiusMeters = calculateDistanceMeters(circle.center, handlePoint);

    if (liveDrag) {
        updateCircleLiveDragVisuals(circle, false);
        return;
    }

    renderObject(circle);
    renderObjectList();
    renderPropertiesPanel();
}

/**
 * Updates circle visuals during marker dragging without replacing marker icons.
 *
 * @param {Object} circle - Circle object being dragged.
 * @param {boolean} moveRadiusHandle - Whether to reposition the radius handle.
 * @returns {void}
 */
function updateCircleLiveDragVisuals(circle, moveRadiusHandle) {
    const bundle = leafletLayers.get(circle.id);
    if (!bundle) {
        return;
    }

    const centerLatLng = pointToLatLng(circle.center);
    const handleLatLng = pointToLatLng(calculateDestinationPoint(circle.center, 90, circle.radiusMeters));

    bundle.circle.setLatLng(centerLatLng);
    bundle.circle.setRadius(circle.radiusMeters);
    bundle.label.setLatLng(handleLatLng);
    bundle.label.setIcon(createLabelIcon(getCircleLabelText(circle), circle.id === selectedObjectId));

    if (moveRadiusHandle) {
        bundle.radiusHandle.setLatLng(handleLatLng);
    }
}

/**
 * Returns style options for a circle.
 *
 * @param {boolean} selected - Whether the object is selected.
 * @param {boolean} preview - Whether the circle is only a drawing preview.
 * @returns {Object} Leaflet circle style.
 */
function getCircleStyle(selected, preview) {
    return {
        color: selected ? '#0f172a' : '#7c3aed',
        weight: selected ? 4 : 2,
        opacity: preview ? 0.6 : 0.85,
        fillColor: '#7c3aed',
        fillOpacity: preview ? 0.05 : 0.03,
        dashArray: preview ? '6 6' : null
    };
}

/**
 * Returns text for a circle measurement label.
 *
 * @param {Object} circle - Circle object.
 * @returns {string} HTML label text.
 */
function getCircleLabelText(circle) {
    return `Radius: ${formatDistance(circle.radiusMeters)}`;
}

// =============================================================================
// Selection and hit testing
// =============================================================================

/**
 * Selects an object and refreshes dependent UI.
 *
 * @param {string|null} objectId - Object ID to select, or null.
 * @returns {void}
 */
function selectObject(objectId) {
    selectedObjectId = objectId;
    project.selectedObjectId = objectId;
    renderAllObjects();
    renderObjectList();
    renderPropertiesPanel();
    saveProjectToLocalStorage();
}

/**
 * Handles selection clicks in select mode.
 *
 * @param {L.LeafletMouseEvent} event - Leaflet click event.
 * @returns {void}
 */
function handleSelectionClick(event) {
    const candidates = findHitCandidates(event);

    if (candidates.length === 0) {
        resetClickCycle();
        selectObject(null);
        return;
    }

    const selectedCandidate = chooseCandidateForClickCycle(event.containerPoint, candidates);
    selectObject(selectedCandidate.id);
}

/**
 * Finds selectable project objects under the click point.
 *
 * Marker and handle clicks are normally captured by marker handlers before this
 * runs. This function covers line and circle edge hit-testing and provides the
 * overlap cycling candidate list.
 *
 * @param {L.LeafletMouseEvent} event - Leaflet click event.
 * @returns {Array<{id: string, priority: number}>} Hit candidates.
 */
function findHitCandidates(event) {
    const candidates = [];
    const clickPoint = event.containerPoint;

    for (const object of project.objects) {
        if (object.type === OBJECT_TYPE_LINE && isLineHit(object, clickPoint)) {
            candidates.push({ id: object.id, priority: 3 });
        }

        if (object.type === OBJECT_TYPE_CIRCLE && isCircleCircumferenceHit(object, clickPoint)) {
            candidates.push({ id: object.id, priority: 4 });
        }
    }

    return candidates.sort((a, b) => a.priority - b.priority);
}

/**
 * Chooses which hit candidate should be selected, cycling repeated clicks.
 *
 * @param {L.Point} clickPoint - Current click point in container pixels.
 * @param {Array<{id: string, priority: number}>} candidates - Hit candidates.
 * @returns {{id: string, priority: number}} Selected candidate.
 */
function chooseCandidateForClickCycle(clickPoint, candidates) {
    const candidateIds = candidates.map((candidate) => candidate.id);
    const isSamePoint = lastClickCycle.point && clickPoint.distanceTo(lastClickCycle.point) <= CLICK_CYCLE_TOLERANCE_PIXELS;
    const isSameCandidateSet = arraysEqual(candidateIds, lastClickCycle.candidateIds);

    if (isSamePoint && isSameCandidateSet) {
        lastClickCycle.index = (lastClickCycle.index + 1) % candidates.length;
    } else {
        lastClickCycle = {
            point: clickPoint,
            candidateIds,
            index: 0
        };
    }

    return candidates[lastClickCycle.index];
}

/**
 * Clears click cycling state.
 *
 * @returns {void}
 */
function resetClickCycle() {
    lastClickCycle = {
        point: null,
        candidateIds: [],
        index: -1
    };
}

/**
 * Tests whether a click point is close enough to a line segment.
 *
 * @param {Object} line - Line object.
 * @param {L.Point} clickPoint - Click location in container pixels.
 * @returns {boolean} True when line is hit.
 */
function isLineHit(line, clickPoint) {
    const start = map.latLngToContainerPoint(pointToLatLng(line.start));
    const end = map.latLngToContainerPoint(pointToLatLng(line.end));
    return distancePointToSegmentPixels(clickPoint, start, end) <= LINE_HIT_TOLERANCE_PIXELS;
}

/**
 * Tests whether a click point is close enough to a circle circumference.
 *
 * @param {Object} circle - Circle object.
 * @param {L.Point} clickPoint - Click location in container pixels.
 * @returns {boolean} True when circumference is hit.
 */
function isCircleCircumferenceHit(circle, clickPoint) {
    const center = map.latLngToContainerPoint(pointToLatLng(circle.center));
    const eastEdge = map.latLngToContainerPoint(pointToLatLng(calculateDestinationPoint(circle.center, 90, circle.radiusMeters)));
    const radiusPixels = center.distanceTo(eastEdge);
    const clickRadiusPixels = center.distanceTo(clickPoint);
    return Math.abs(clickRadiusPixels - radiusPixels) <= CIRCLE_HIT_TOLERANCE_PIXELS;
}

// =============================================================================
// Rendering
// =============================================================================

/**
 * Renders every project object, removing stale Leaflet layers first.
 *
 * @returns {void}
 */
function renderAllObjects() {
    if (!map) {
        return;
    }

    const objectIds = new Set(project.objects.map((object) => object.id));

    for (const objectId of leafletLayers.keys()) {
        if (!objectIds.has(objectId)) {
            removeLeafletLayers(objectId);
        }
    }

    for (const object of project.objects) {
        renderObject(object);
    }
}

/**
 * Renders a single project object.
 *
 * @param {Object} object - Project object.
 * @returns {void}
 */
function renderObject(object) {
    if (object.type === OBJECT_TYPE_LINE) {
        renderLine(object);
    } else if (object.type === OBJECT_TYPE_CIRCLE) {
        renderCircle(object);
    }
}

/**
 * Removes all Leaflet layers associated with an object.
 *
 * @param {string} objectId - Object ID.
 * @returns {void}
 */
function removeLeafletLayers(objectId) {
    const bundle = leafletLayers.get(objectId);
    if (!bundle || !map) {
        return;
    }

    for (const value of Object.values(bundle)) {
        if (value && typeof value.remove === 'function') {
            value.remove();
        }
    }

    leafletLayers.delete(objectId);
}

/**
 * Creates a small dot marker for endpoints, centres and handles.
 *
 * @param {L.LatLng} latlng - Marker location.
 * @param {'green'|'red'|'neutral'} colour - Marker colour role.
 * @param {boolean} draggable - Whether marker can be dragged.
 * @returns {L.Marker} Leaflet marker.
 */
function createPointMarker(latlng, colour, draggable) {
    return L.marker(latlng, {
        draggable,
        icon: createPointIcon(colour, false),
        keyboard: false,
        riseOnHover: true
    });
}

/**
 * Creates a Leaflet div icon for a point marker.
 *
 * @param {'green'|'red'|'neutral'} colour - Marker colour role.
 * @param {boolean} selected - Whether marker is selected.
 * @returns {L.DivIcon} Leaflet div icon.
 */
function createPointIcon(colour, selected) {
    return L.divIcon({
        className: `bs-point-marker bs-point-marker-${colour} ${selected ? SELECTED_CLASS : ''}`,
        html: '<span></span>',
        iconSize: selected ? [18, 18] : [14, 14],
        iconAnchor: selected ? [9, 9] : [7, 7]
    });
}

/**
 * Applies selected styling to a marker by replacing its icon.
 *
 * @param {L.Marker} marker - Leaflet marker.
 * @param {boolean} selected - Whether marker is selected.
 * @returns {void}
 */
function setMarkerSelected(marker, selected) {
    const element = marker.getElement();
    if (!element) {
        return;
    }

    const colour = getMarkerColourFromElement(element);
    marker.setIcon(createPointIcon(colour, selected));
}

/**
 * Deduces a marker colour role from its current DOM element classes.
 *
 * @param {HTMLElement} element - Marker element.
 * @returns {'green'|'red'|'neutral'} Colour role.
 */
function getMarkerColourFromElement(element) {
    if (element.classList.contains('bs-point-marker-red')) {
        return 'red';
    }

    if (element.classList.contains('bs-point-marker-neutral')) {
        return 'neutral';
    }

    return 'green';
}

/**
 * Creates a label icon used for map measurement labels.
 *
 * @param {string} html - Label HTML.
 * @param {boolean} selected - Whether owning object is selected.
 * @returns {L.DivIcon} Leaflet div icon.
 */
function createLabelIcon(html, selected) {
    return L.divIcon({
        className: `bs-measure-label ${selected ? SELECTED_CLASS : ''}`,
        html,
        iconSize: null,
        iconAnchor: [0, 0]
    });
}

/**
 * Saves the current project state.
 *
 * @returns {void}
 */
function persistProject() {
    saveProjectToLocalStorage();
}

/**
 * Refreshes the sidebar UI for the currently selected object.
 *
 * @returns {void}
 */
function refreshSelectionUi() {
    renderObjectList();
    renderPropertiesPanel();
}

/**
 * Persists and refreshes the full UI.
 *
 * @returns {void}
 */
function persistAndRender() {
    renderAllObjects();
    renderObjectList();
    renderPropertiesPanel();
    persistProject();
}

// =============================================================================
// Properties panel
// =============================================================================

/**
 * Renders the selected object's editable properties.
 *
 * @returns {void}
 */
function renderPropertiesPanel() {
    if (!elements.propertiesBody) {
        return;
    }

    const object = findObjectById(selectedObjectId);

    if (!object) {
        elements.propertiesBody.innerHTML = '<p class="empty-state">No object selected.</p>';
        return;
    }

    if (object.type === OBJECT_TYPE_LINE) {
        renderLineProperties(object);
    } else if (object.type === OBJECT_TYPE_CIRCLE) {
        renderCircleProperties(object);
    }
}

/**
 * Renders editable line properties.
 *
 * @param {Object} line - Selected line object.
 * @returns {void}
 */
function renderLineProperties(line) {
    const distanceMeters = calculateDistanceMeters(line.start, line.end);
    const bearing = calculateInitialBearingDegrees(line.start, line.end);

    elements.propertiesBody.innerHTML = `
        <div class="property-form" data-object-id="${escapeHtml(line.id)}">
            ${renderNameField(line)}
            ${renderCoordinateFields('start', 'Start', line.start)}
            ${renderCoordinateFields('end', 'End', line.end)}
            <label class="field">
                <span>Distance</span>
                <input id="line-distance" type="text" value="${escapeHtml(formatDistance(distanceMeters))}">
            </label>
            <label class="field">
                <span>Bearing</span>
                <input id="line-bearing" type="text" value="${escapeHtml(formatBearing(bearing))}">
            </label>
            <button class="danger" id="remove-object" type="button">Remove line</button>
        </div>
    `;

    bindCommonPropertyEvents(line);
    bindCoordinateFieldEvents(line, 'start');
    bindCoordinateFieldEvents(line, 'end');
    document.getElementById('line-distance')?.addEventListener('change', () => handleLineDistanceBearingChanged(line));
    document.getElementById('line-bearing')?.addEventListener('change', () => handleLineDistanceBearingChanged(line));
}

/**
 * Renders editable circle properties.
 *
 * @param {Object} circle - Selected circle object.
 * @returns {void}
 */
function renderCircleProperties(circle) {
    elements.propertiesBody.innerHTML = `
        <div class="property-form" data-object-id="${escapeHtml(circle.id)}">
            ${renderNameField(circle)}
            ${renderCoordinateFields('center', 'Centre', circle.center)}
            <label class="field">
                <span>Radius</span>
                <input id="circle-radius" type="text" value="${escapeHtml(formatDistance(circle.radiusMeters))}">
            </label>
            <button class="danger" id="remove-object" type="button">Remove circle</button>
        </div>
    `;

    bindCommonPropertyEvents(circle);
    bindCoordinateFieldEvents(circle, 'center');
    document.getElementById('circle-radius')?.addEventListener('change', () => handleCircleRadiusChanged(circle));
}

/**
 * Returns HTML for the editable name field.
 *
 * @param {Object} object - Selected object.
 * @returns {string} HTML string.
 */
function renderNameField(object) {
    return `
        <label class="field">
            <span>Name</span>
            <input id="object-name" type="text" value="${escapeHtml(object.name)}">
        </label>
    `;
}

/**
 * Returns HTML for editable decimal and DMS coordinate fields.
 *
 * @param {string} key - Coordinate key.
 * @param {string} label - Human-facing label.
 * @param {{lat: number, lng: number}} point - Coordinate point.
 * @returns {string} HTML string.
 */
function renderCoordinateFields(key, label, point) {
    return `
        <fieldset class="coordinate-group">
            <legend>${escapeHtml(label)} coordinate</legend>
            <label class="field">
                <span>Decimal</span>
                <input id="${key}-decimal" type="text" value="${escapeHtml(formatDecimalCoordinatePair(point))}">
            </label>
            <label class="field">
                <span>DMS</span>
                <input id="${key}-dms" type="text" value="${escapeHtml(formatDmsCoordinatePair(point))}">
            </label>
            <p class="field-error" id="${key}-error" aria-live="polite"></p>
        </fieldset>
    `;
}

/**
 * Binds property events shared by line and circle objects.
 *
 * @param {Object} object - Selected object.
 * @returns {void}
 */
function bindCommonPropertyEvents(object) {
    document.getElementById('object-name')?.addEventListener('input', (event) => {
        object.name = event.target.value.trim() || object.name;
        renderObjectList();
        saveProjectToLocalStorage();
    });

    document.getElementById('remove-object')?.addEventListener('click', () => removeObject(object.id));
}

/**
 * Binds coordinate field parsing/editing events.
 *
 * @param {Object} object - Selected object.
 * @param {string} key - Coordinate key on the object.
 * @returns {void}
 */
function bindCoordinateFieldEvents(object, key) {
    const decimalInput = document.getElementById(`${key}-decimal`);
    const dmsInput = document.getElementById(`${key}-dms`);

    decimalInput?.addEventListener('change', () => handleCoordinateInputChanged(object, key, decimalInput.value));
    dmsInput?.addEventListener('change', () => handleCoordinateInputChanged(object, key, dmsInput.value));

    decimalInput?.addEventListener('keydown', handleInputEnterAsChange);
    dmsInput?.addEventListener('keydown', handleInputEnterAsChange);
}

/**
 * Converts Enter in an input field into a change/blur style commit.
 *
 * @param {KeyboardEvent} event - Keyboard event.
 * @returns {void}
 */
function handleInputEnterAsChange(event) {
    if (event.key === 'Enter') {
        event.currentTarget.dispatchEvent(new Event('change', { bubbles: true }));
        event.currentTarget.blur();
    }
}

/**
 * Handles a coordinate edit from either decimal or DMS input.
 *
 * @param {Object} object - Object being edited.
 * @param {string} key - Coordinate property key.
 * @param {string} value - User-entered coordinate text.
 * @returns {void}
 */
function handleCoordinateInputChanged(object, key, value) {
    const result = parseCoordinatePair(value);
    const errorElement = document.getElementById(`${key}-error`);

    if (!result.ok) {
        if (errorElement) {
            errorElement.textContent = result.error;
        }
        return;
    }

    object[key] = result.point;
    persistAndRender();
}

/**
 * Handles a line distance or bearing field change.
 *
 * @param {Object} line - Line object being edited.
 * @returns {void}
 */
function handleLineDistanceBearingChanged(line) {
    const distanceInput = document.getElementById('line-distance');
    const bearingInput = document.getElementById('line-bearing');
    const distanceResult = parseDistanceInput(distanceInput?.value || '', project.units);
    const bearing = parseBearingInput(bearingInput?.value || '');

    if (!distanceResult.ok || !Number.isFinite(bearing)) {
        setStatus('Invalid distance or bearing.');
        return;
    }

    updateLineFromDistanceAndBearing(line, distanceResult.meters, bearing);
}

/**
 * Handles a circle radius field change.
 *
 * @param {Object} circle - Circle object being edited.
 * @returns {void}
 */
function handleCircleRadiusChanged(circle) {
    const input = document.getElementById('circle-radius');
    const result = parseDistanceInput(input?.value || '', project.units);

    if (!result.ok) {
        setStatus(result.error);
        return;
    }

    circle.radiusMeters = result.meters;
    persistAndRender();
}

// =============================================================================
// Object list
// =============================================================================

/**
 * Renders the scrollable object list.
 *
 * @returns {void}
 */
function renderObjectList() {
    if (!elements.objectsBody) {
        return;
    }

    if (project.objects.length === 0) {
        elements.objectsBody.innerHTML = '<p class="empty-state">No objects yet.</p>';
        return;
    }

    elements.objectsBody.innerHTML = project.objects.map(renderObjectListItem).join('');

    for (const button of elements.objectsBody.querySelectorAll('[data-object-id]')) {
        button.addEventListener('click', () => selectObject(button.dataset.objectId));
    }
}

/**
 * Returns HTML for one object list item.
 *
 * @param {Object} object - Project object.
 * @returns {string} HTML string.
 */
function renderObjectListItem(object) {
    const selected = object.id === selectedObjectId;
    const iconClass = object.type === OBJECT_TYPE_LINE
        ? 'ph-ruler'
        : 'ph-circle';
    return `
        <button type="button" class="object-list-item ${selected ? SELECTED_CLASS : ''}" data-object-id="${escapeHtml(object.id)}">
            <span class="object-name"><i class="ph ${iconClass}" aria-hidden="true"></i> ${escapeHtml(object.name)}</span>
            <span class="object-summary">${escapeHtml(getObjectSummary(object))}</span>
        </button>
    `;
}

/**
 * Returns a compact summary for an object list item.
 *
 * @param {Object} object - Project object.
 * @returns {string} Summary text.
 */
function getObjectSummary(object) {
    if (object.type === OBJECT_TYPE_LINE) {
        const distance = calculateDistanceMeters(object.start, object.end);
        const bearing = calculateInitialBearingDegrees(object.start, object.end);
        return `${formatDistance(distance)}, ${formatBearing(bearing)} T`;
    }

    if (object.type === OBJECT_TYPE_CIRCLE) {
        return `radius ${formatDistance(object.radiusMeters)}`;
    }

    return '';
}

// =============================================================================
// Persistence and file handling
// =============================================================================

/**
 * Loads the project JSON from browser localStorage.
 *
 * @returns {Object|null} Loaded project, or null.
 */
function loadProjectFromLocalStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('Failed to load localStorage project.', error);
        return null;
    }
}

/**
 * Saves the current project to localStorage.
 *
 * @returns {void}
 */
function saveProjectToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch (error) {
        console.warn('Failed to save localStorage project.', error);
    }
}

/**
 * Handles creation of a new project.
 *
 * @returns {void}
 */
function handleNewProject() {
    if (project.objects.length > 0 && !window.confirm('Create a new project and remove all current objects?')) {
        return;
    }

    for (const objectId of Array.from(leafletLayers.keys())) {
        removeLeafletLayers(objectId);
    }

    localStorage.removeItem(STORAGE_KEY);
    project = createEmptyProject();
    selectedObjectId = null;
    drawState = null;

    map?.setView(project.map.center, project.map.zoom);
    initialiseToolbarState();
    initialiseSidebarState();
    renderAllObjects();
    renderObjectList();
    renderPropertiesPanel();
    setStatus('New project created.');
}

/**
 * Downloads the current project as a JSON file.
 *
 * @returns {void}
 */
function saveProjectAsJsonFile() {
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${APP_NAME}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();

    URL.revokeObjectURL(url);
}

/**
 * Handles project JSON file selection.
 *
 * @param {Event} event - File input change event.
 * @returns {void}
 */
function handleOpenProjectFile(event) {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = () => openProjectJson(String(reader.result || ''));
    reader.readAsText(file);
    event.target.value = '';
}

/**
 * Opens a project from a JSON string.
 *
 * @param {string} json - Project JSON.
 * @returns {void}
 */
function openProjectJson(json) {
    try {
        const nextProject = JSON.parse(json);
        validateProject(nextProject);

        for (const objectId of Array.from(leafletLayers.keys())) {
            removeLeafletLayers(objectId);
        }

        project = nextProject;
        normaliseLoadedProject(project);
        selectedObjectId = project.selectedObjectId || null;
        map?.setView(project.map.center, project.map.zoom);
        initialiseToolbarState();
        initialiseSidebarState();
        persistAndRender();
        setStatus('Project opened.');
    } catch (error) {
        setStatus(`Could not open project: ${error.message}`);
    }
}

/**
 * Performs minimal validation on a loaded project.
 *
 * @param {Object} candidate - Parsed project candidate.
 * @returns {void}
 * @throws {Error} When the project is incompatible.
 */
function validateProject(candidate) {
    if (!candidate || typeof candidate !== 'object') {
        throw new Error('file is not a project object');
    }

    if (candidate.app && candidate.app !== APP_NAME) {
        throw new Error('project belongs to another app');
    }

    if (candidate.version && candidate.version > PROJECT_VERSION) {
        throw new Error('project version is newer than this app supports');
    }

    if (candidate.objects && !Array.isArray(candidate.objects)) {
        throw new Error('project objects are invalid');
    }
}

// =============================================================================
// Geometry utilities
// =============================================================================

/**
 * Calculates great-circle distance between two coordinates using haversine.
 *
 * @param {{lat: number, lng: number}} start - Start coordinate.
 * @param {{lat: number, lng: number}} end - End coordinate.
 * @returns {number} Distance in metres.
 */
function calculateDistanceMeters(start, end) {
    const lat1 = toRadians(start.lat);
    const lat2 = toRadians(end.lat);
    const deltaLat = toRadians(end.lat - start.lat);
    const deltaLng = toRadians(end.lng - start.lng);

    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_METERS * c;
}

/**
 * Calculates the initial true bearing from one point to another.
 *
 * The result follows navigation convention: 0 degrees is north, 90 degrees is
 * east, and values increase clockwise.
 *
 * @param {{lat: number, lng: number}} start - Start coordinate.
 * @param {{lat: number, lng: number}} end - End coordinate.
 * @returns {number} Bearing in degrees from 0 inclusive to 360 exclusive.
 */
function calculateInitialBearingDegrees(start, end) {
    const lat1 = toRadians(start.lat);
    const lat2 = toRadians(end.lat);
    const deltaLng = toRadians(end.lng - start.lng);

    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

    return normalizeBearing(toDegrees(Math.atan2(y, x)));
}

/**
 * Calculates a destination point from a start coordinate, bearing and distance.
 *
 * @param {{lat: number, lng: number}} start - Start coordinate.
 * @param {number} bearingDegrees - True bearing in degrees.
 * @param {number} distanceMeters - Distance in metres.
 * @returns {{lat: number, lng: number}} Destination coordinate.
 */
function calculateDestinationPoint(start, bearingDegrees, distanceMeters) {
    const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
    const bearing = toRadians(bearingDegrees);
    const lat1 = toRadians(start.lat);
    const lng1 = toRadians(start.lng);

    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const lng2 = lng1 + Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

    return {
        lat: toDegrees(lat2),
        lng: normalizeLongitude(toDegrees(lng2))
    };
}

/**
 * Normalises a bearing into 0 inclusive to 360 exclusive.
 *
 * @param {number} degrees - Input degrees.
 * @returns {number} Normalised bearing.
 */
function normalizeBearing(degrees) {
    return ((degrees % 360) + 360) % 360;
}

/**
 * Normalises longitude into -180 to 180.
 *
 * @param {number} degrees - Longitude degrees.
 * @returns {number} Normalised longitude.
 */
function normalizeLongitude(degrees) {
    return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/**
 * Converts a bearing into a 16-point compass cardinal.
 *
 * @param {number} degrees - Bearing degrees.
 * @returns {string} Cardinal direction.
 */
function bearingToCardinal(degrees) {
    const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(normalizeBearing(degrees) / 22.5) % 16;
    return cardinals[index];
}

/**
 * Calculates pixel distance from a point to a line segment.
 *
 * @param {L.Point} point - Point to test.
 * @param {L.Point} segmentStart - Segment start.
 * @param {L.Point} segmentEnd - Segment end.
 * @returns {number} Pixel distance.
 */
function distancePointToSegmentPixels(point, segmentStart, segmentEnd) {
    const dx = segmentEnd.x - segmentStart.x;
    const dy = segmentEnd.y - segmentStart.y;

    if (dx === 0 && dy === 0) {
        return point.distanceTo(segmentStart);
    }

    const t = Math.max(0, Math.min(1, ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / (dx * dx + dy * dy)));
    const projection = L.point(segmentStart.x + t * dx, segmentStart.y + t * dy);
    return point.distanceTo(projection);
}

// =============================================================================
// Coordinate parsing and formatting
// =============================================================================

/**
 * Parses a latitude/longitude pair from flexible decimal or DMS text.
 *
 * @param {string} text - Coordinate pair text.
 * @returns {{ok: true, point: {lat: number, lng: number}}|{ok: false, error: string}} Parse result.
 */
function parseCoordinatePair(text) {
    const parts = splitCoordinatePair(text);

    if (!parts.ok) {
        return parts;
    }

    const lat = parseSingleCoordinate(parts.lat, 'lat');
    const lng = parseSingleCoordinate(parts.lng, 'lng');

    if (!lat.ok) {
        return { ok: false, error: `Latitude: ${lat.error}` };
    }

    if (!lng.ok) {
        return { ok: false, error: `Longitude: ${lng.error}` };
    }

    if (lat.value < -90 || lat.value > 90) {
        return { ok: false, error: 'Latitude must be between -90 and 90.' };
    }

    if (lng.value < -180 || lng.value > 180) {
        return { ok: false, error: 'Longitude must be between -180 and 180.' };
    }

    return {
        ok: true,
        point: {
            lat: lat.value,
            lng: lng.value
        }
    };
}

/**
 * Splits a coordinate pair into latitude and longitude text.
 *
 * Only comma, semicolon and slash are treated as pair separators. Plain
 * whitespace is intentionally not used because it is ambiguous with DMS values.
 *
 * @param {string} text - Coordinate pair text.
 * @returns {{ok: true, lat: string, lng: string}|{ok: false, error: string}} Split result.
 */
function splitCoordinatePair(text) {
    const trimmed = text.trim();
    const separatorMatch = trimmed.match(/[,;/]/);

    if (!separatorMatch) {
        return { ok: false, error: 'Use comma, semicolon or slash between latitude and longitude.' };
    }

    const separator = separatorMatch[0];
    const parts = trimmed.split(separator).map((part) => part.trim()).filter(Boolean);

    if (parts.length !== 2) {
        return { ok: false, error: 'Enter one latitude and one longitude.' };
    }

    return { ok: true, lat: parts[0], lng: parts[1] };
}

/**
 * Parses one latitude or longitude value.
 *
 * The parser accepts signed decimal degrees, hemisphere suffix/prefixes, and DMS
 * expressed with symbols or whitespace. If decimal degrees are supplied, minutes
 * and seconds are ignored by design.
 *
 * @param {string} text - Single coordinate text.
 * @param {'lat'|'lng'} axis - Coordinate axis.
 * @returns {{ok: true, value: number}|{ok: false, error: string}} Parse result.
 */
function parseSingleCoordinate(text, axis) {
    const hemisphere = extractHemisphere(text);
    const numbers = extractNumbers(text);

    if (numbers.length === 0) {
        return { ok: false, error: 'no numeric coordinate value found.' };
    }

    const degrees = numbers[0];
    const minutes = numbers[1];
    const seconds = numbers[2];
    const sign = Math.sign(degrees) || 1;

    if (hemisphere && !isHemisphereValidForAxis(hemisphere, axis)) {
        return { ok: false, error: `hemisphere ${hemisphere} is not valid for ${axis === 'lat' ? 'latitude' : 'longitude'}.` };
    }

    if (hemisphere && degrees < 0 && (hemisphere === 'N' || hemisphere === 'E')) {
        return { ok: false, error: 'negative value conflicts with northern/eastern hemisphere.' };
    }

    if (hemisphere && degrees < 0 && (hemisphere === 'S' || hemisphere === 'W')) {
        return { ok: false, error: 'use either a minus sign or S/W hemisphere, not both.' };
    }

    if (minutes !== undefined && Math.abs(minutes) >= 60) {
        return { ok: false, error: 'minutes must be less than 60.' };
    }

    if (seconds !== undefined && Math.abs(seconds) >= 60) {
        return { ok: false, error: 'seconds must be less than 60.' };
    }

    let absoluteDegrees;

    if (isDecimal(degrees)) {
        absoluteDegrees = Math.abs(degrees);
    } else if (minutes !== undefined && isDecimal(minutes)) {
        absoluteDegrees = Math.abs(degrees) + Math.abs(minutes) / 60;
    } else {
        absoluteDegrees = Math.abs(degrees) + (Math.abs(minutes || 0) / 60) + (Math.abs(seconds || 0) / 3600);
    }

    const hemisphereSign = hemisphereToSign(hemisphere);
    const finalSign = hemisphereSign || sign;

    return { ok: true, value: finalSign * absoluteDegrees };
}

/**
 * Extracts a hemisphere letter from coordinate text.
 *
 * @param {string} text - Coordinate text.
 * @returns {string|null} Hemisphere letter, or null.
 */
function extractHemisphere(text) {
    const matches = text.toUpperCase().match(/[NSEW]/g);
    return matches && matches.length === 1 ? matches[0] : null;
}

/**
 * Extracts numeric tokens from coordinate text.
 *
 * @param {string} text - Coordinate text.
 * @returns {number[]} Numeric values.
 */
function extractNumbers(text) {
    const matches = text.match(/[+-]?\d+(?:\.\d+)?/g) || [];
    return matches.map(Number).filter(Number.isFinite);
}

/**
 * Checks whether a number includes a decimal component.
 *
 * @param {number} value - Numeric value.
 * @returns {boolean} True when value is non-integer.
 */
function isDecimal(value) {
    return Math.abs(value % 1) > Number.EPSILON;
}

/**
 * Checks whether a hemisphere belongs to a coordinate axis.
 *
 * @param {string} hemisphere - Hemisphere letter.
 * @param {'lat'|'lng'} axis - Coordinate axis.
 * @returns {boolean} True when valid.
 */
function isHemisphereValidForAxis(hemisphere, axis) {
    return axis === 'lat' ? ['N', 'S'].includes(hemisphere) : ['E', 'W'].includes(hemisphere);
}

/**
 * Converts a hemisphere to a coordinate sign.
 *
 * @param {string|null} hemisphere - Hemisphere letter.
 * @returns {number|null} Sign or null.
 */
function hemisphereToSign(hemisphere) {
    if (hemisphere === 'S' || hemisphere === 'W') {
        return -1;
    }

    if (hemisphere === 'N' || hemisphere === 'E') {
        return 1;
    }

    return null;
}

/**
 * Formats a coordinate pair as decimal degrees.
 *
 * @param {{lat: number, lng: number}} point - Coordinate point.
 * @returns {string} Decimal coordinate pair.
 */
function formatDecimalCoordinatePair(point) {
    return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
}

/**
 * Formats a coordinate pair as DMS.
 *
 * @param {{lat: number, lng: number}} point - Coordinate point.
 * @returns {string} DMS coordinate pair.
 */
function formatDmsCoordinatePair(point) {
    return `${formatSingleDms(point.lat, 'lat')}, ${formatSingleDms(point.lng, 'lng')}`;
}

/**
 * Formats one coordinate value as DMS with hemisphere.
 *
 * @param {number} value - Decimal degree value.
 * @param {'lat'|'lng'} axis - Coordinate axis.
 * @returns {string} DMS coordinate.
 */
function formatSingleDms(value, axis) {
    const hemisphere = axis === 'lat'
        ? (value < 0 ? 'S' : 'N')
        : (value < 0 ? 'W' : 'E');
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minuteFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minuteFloat);
    const seconds = (minuteFloat - minutes) * 60;

    return `${degrees}° ${minutes}' ${seconds.toFixed(2)}" ${hemisphere}`;
}

// =============================================================================
// Unit and bearing parsing/formatting
// =============================================================================

/**
 * Parses a distance or radius input into metres.
 *
 * @param {string} text - User-entered distance.
 * @param {string} defaultUnit - Unit assumed when no suffix is present.
 * @returns {{ok: true, meters: number}|{ok: false, error: string}} Parse result.
 */
function parseDistanceInput(text, defaultUnit) {
    const match = text.trim().toLowerCase().match(/^([+-]?\d+(?:\.\d+)?)\s*(m|km|nm|mi|ft)?$/);

    if (!match) {
        return { ok: false, error: 'Invalid distance.' };
    }

    const value = Number(match[1]);
    const unit = match[2] || defaultUnit;

    if (!Number.isFinite(value) || value < 0) {
        return { ok: false, error: 'Distance must be a positive number.' };
    }

    if (!UNITS[unit]) {
        return { ok: false, error: 'Unsupported distance unit.' };
    }

    return { ok: true, meters: convertUnitToMeters(value, unit) };
}

/**
 * Parses a bearing input into normalised degrees.
 *
 * @param {string} text - Bearing text.
 * @returns {number} Bearing degrees, or NaN.
 */
function parseBearingInput(text) {
    const match = text.trim().match(/[+-]?\d+(?:\.\d+)?/);
    return match ? normalizeBearing(Number(match[0])) : Number.NaN;
}

/**
 * Converts metres to a supported display unit.
 *
 * @param {number} meters - Distance in metres.
 * @param {string} unit - Unit key.
 * @returns {number} Converted value.
 */
function convertMetersToUnit(meters, unit) {
    return meters / UNITS[unit].meters;
}

/**
 * Converts a supported unit into metres.
 *
 * @param {number} value - Unit value.
 * @param {string} unit - Unit key.
 * @returns {number} Metres.
 */
function convertUnitToMeters(value, unit) {
    return value * UNITS[unit].meters;
}

/**
 * Formats metres in the currently selected project unit.
 *
 * @param {number} meters - Distance in metres.
 * @returns {string} Formatted distance.
 */
function formatDistance(meters) {
    const unit = UNITS[project.units] || UNITS.km;
    const value = convertMetersToUnit(meters, project.units);
    return `${value.toFixed(unit.precision)} ${unit.suffix}`;
}

/**
 * Formats a bearing for display.
 *
 * @param {number} degrees - Bearing degrees.
 * @returns {string} Formatted bearing.
 */
function formatBearing(degrees) {
    return `${normalizeBearing(degrees).toFixed(1)}°`;
}

// =============================================================================
// General utilities
// =============================================================================

/**
 * Converts degrees to radians.
 *
 * @param {number} degrees - Degrees.
 * @returns {number} Radians.
 */
function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

/**
 * Converts radians to degrees.
 *
 * @param {number} radians - Radians.
 * @returns {number} Degrees.
 */
function toDegrees(radians) {
    return radians * 180 / Math.PI;
}

/**
 * Converts a Leaflet LatLng object to the app's plain point object.
 *
 * @param {L.LatLng} latlng - Leaflet coordinate.
 * @returns {{lat: number, lng: number}} Plain coordinate.
 */
function latLngToPoint(latlng) {
    return { lat: latlng.lat, lng: latlng.lng };
}

/**
 * Converts a plain point object to a Leaflet LatLng object.
 *
 * @param {{lat: number, lng: number}} point - Plain coordinate.
 * @returns {L.LatLng} Leaflet coordinate.
 */
function pointToLatLng(point) {
    return L.latLng(point.lat, point.lng);
}

/**
 * Toggles a CSS class on an element when it exists.
 *
 * @param {HTMLElement|null|undefined} element - Target element.
 * @param {string} className - CSS class.
 * @param {boolean} enabled - Whether class should be present.
 * @returns {void}
 */
function toggleElementClass(element, className, enabled) {
    element?.classList.toggle(className, enabled);
}

/**
 * Sets a small status message if the status element exists.
 *
 * @param {string} message - Status text.
 * @returns {void}
 */
function setStatus(message) {
    if (elements.status) {
        elements.status.textContent = message;
    }
}

/**
 * Escapes text for safe insertion into HTML strings.
 *
 * @param {string} value - Raw value.
 * @returns {string} Escaped value.
 */
function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

/**
 * Compares two arrays for strict ordered equality.
 *
 * @param {Array} left - First array.
 * @param {Array} right - Second array.
 * @returns {boolean} True when arrays are equal.
 */
function arraysEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

window.addEventListener('DOMContentLoaded', bootApplication);
