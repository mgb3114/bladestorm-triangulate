# bs-triangulate

## Project Description

bs-triangulate is a lightweight browser-based triangulation and measurement tool built with vanilla JavaScript and Leaflet. It provides an intuitive interface for creating and editing lines and range rings on a map, enabling geodesic distance and bearing calculations without any backend dependencies.

## Why bs-triangulate?

bs-triangulate is designed for practical applications involving triangulation from range or range plus bearing data, such as radio direction finding, navigation, range estimation, and general field measurement. It offers a straightforward way to visualize and measure geospatial relationships, making it a valuable tool for professionals and enthusiasts needing accurate, interactive geodesic computations in the field or office.

## Live Site and Source Code

- Live Site: [https://bladestorm.co/triangulate/](https://bladestorm.co/triangulate/)
- Source Code: [https://github.com/mgb3114/bs-triangulate](https://github.com/mgb3114/bs-triangulate)

## Features

- Interactive creation and editing of lines and range rings on a map.
- Geodesic distance and true bearing calculations using spherical geometry.
- Editable coordinates in both Decimal Degrees and Degrees-Minutes-Seconds (DMS) formats.
- Support for multiple measurement units for distances and bearings.
- Browser geolocation support to center the map on the user's current location.
- Native Leaflet base-layer switching, including OpenStreetMap Standard, Esri World Imagery, and OpenTopoMap.
- Automatic persistence of project data and selected base layer using localStorage.
- JSON import and export functionality for project data.
- Fullscreen mode support for enhanced usability.
- Keyboard shortcuts for efficient workflow:
  - `Esc` — Cancel current drawing or editing.
  - `L` — Activate line drawing mode.
  - `C` — Activate circle drawing mode.
  - `Ctrl+N` — Create a new project.
  - `Ctrl+O` — Open a saved project.
  - `Ctrl+S` — Save the current project.
  - `Ctrl/Cmd+F` — Toggle fullscreen mode.

## Installation

bs-triangulate requires no build process or server-side component and can be run directly in modern browsers. It can be used by opening the files locally in a browser or deployed on any static web server. Internet connectivity is required to load CDN-hosted assets and map tiles.

## Usage

- **Drawing Lines:** Use the line tool to create geodesic lines by clicking on the map.
- **Drawing Circles:** Use the circle tool to create range rings centered on a point with a specified radius.
- **Editing Objects:** Click on existing lines or circles to edit their coordinates and properties.
- **Selecting Objects:** Click on objects to select them for editing or deletion.
- **Deleting Objects:** Selected objects can be deleted via the UI controls.
- **Changing Units:** Select different measurement units for distances and bearings.
- **Switching Base Maps:** Choose between OpenStreetMap Standard, Esri World Imagery, and OpenTopoMap base layers.
- **Saving/Loading Projects:** Export your current project to JSON or import a saved project.
- **Keyboard Shortcuts:** Use keyboard shortcuts to streamline workflow as listed above.

## Base Maps

bs-triangulate supports three base map layers:

- **OpenStreetMap Standard:** The default open-source map layer.
- **Esri World Imagery:** High-resolution satellite imagery.
- **OpenTopoMap:** Topographic map layer with terrain information.

The selected base layer is persisted along with the project data to maintain your preferred view.

## Project File Format

Project data is stored and exchanged as human-readable JSON files. The format is intentionally simple, stable and self-contained, allowing projects to be inspected, archived, version controlled or generated programmatically without requiring any proprietary tooling.

Each project file contains a single root object describing the application version, user preferences, current map view, user interface state and all measurement objects. A typical structure is:

```json
{
  "version": 1,
  "app": "bs-triangulate",
  "units": "km",
  "map": {
    "center": [-25.2744, 133.7751],
    "zoom": 4,
    "baseLayer": "osm"
  },
  "ui": {
    "sidebarCollapsed": false,
    "propertiesExpanded": true,
    "objectsExpanded": true
  },
  "counters": {
    "line": 3,
    "circle": 2
  },
  "selectedObjectId": "line_...",
  "objects": [
    {
      "id": "line_...",
      "type": "line",
      "name": "Line 1",
      "start": { "lat": -33.865143, "lng": 151.209900 },
      "end": { "lat": -34.000000, "lng": 151.500000 }
    },
    {
      "id": "circle_...",
      "type": "circle",
      "name": "Circle 1",
      "center": { "lat": -33.865143, "lng": 151.209900 },
      "radiusMeters": 5000
    }
  ]
}
```

Internally, all coordinates are stored as decimal latitude/longitude values referenced to WGS-84. Distances and circle radii are always stored in metres, regardless of the units selected by the user interface. Bearings are stored and calculated as true bearings measured clockwise from true north. Unit selection affects presentation and user input only; changing between metres, kilometres, nautical miles, statute miles or feet never alters the underlying project data or measurement precision.

## Measurement Accuracy

bs-triangulate uses spherical geodesic calculations suitable for practical operational use:

- **Distance:** Calculated using the Haversine formula.
- **Bearing:** Computed as the great-circle initial bearing.
- **Destination Points:** Determined via great-circle destination calculations.

These methods provide accurate measurements appropriate for navigation, field measurement, and general use, though not intended for cadastral or legal surveying purposes.

## Browser Support

bs-triangulate targets modern Chromium-based browsers, Firefox, and Safari with JavaScript enabled to ensure full functionality.

## Architecture and Design

The project follows a simple three-file architecture:

- `index.html` — the main HTML structure.
- `styles.css` — styling for the application.
- `app.js` — JavaScript logic handling state, geometry, and rendering.

The application runs entirely in the browser without any build system or server-side component. The project model acts as the single source of truth, while Leaflet is used solely as the rendering engine for map visualization and interaction.

## Implementation Notes

- **Geometry Utilities:** Implements the Haversine formula for distance, great-circle initial bearing, and destination point calculations.
- **Persistence:** Automatically saves and loads project data including base-layer selection from localStorage.
- **Separation of Concerns:** Clear distinction between rendering logic (Leaflet), geometry calculations, and application state management.

## Development Standards

The codebase employs JSDoc annotations, functional organization, and descriptive comments to facilitate maintainability and clarity, reflecting best practices in open-source JavaScript development.

## Third-party Components

- [Leaflet](https://leafletjs.com/) — for interactive map rendering.
- [OpenStreetMap](https://www.openstreetmap.org/) — base map tiles.
- [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) — satellite imagery tiles.
- [OpenTopoMap](https://opentopomap.org/) — topographic map tiles.
- [Phosphor Icons](https://phosphoricons.com/) — iconography used in the UI.

## Data Sources and Attribution

Map tiles and data remain subject to their respective providers' attribution and usage policies. Attribution is displayed within the application where applicable, satisfying provider attribution requirements.

## Acknowledgements

Thanks to the Leaflet, OpenStreetMap, Esri, OpenTopoMap, and Phosphor Icons projects for their invaluable resources and contributions. This project is released under the BSD 3-Clause License.

## License

(C) 2026 Michael G Brown  
This project is released under the BSD 3-Clause License.
