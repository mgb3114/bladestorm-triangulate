# bs-triangulate

## Project Description

bs-triangulate is a lightweight browser-based triangulation and measurement tool built with vanilla JavaScript and Leaflet. It provides an intuitive interface for creating and editing lines and range rings on a map, enabling geodesic distance and bearing calculations without any backend dependencies.

## Features

- Interactive line and range-ring creation.
- Geodesic distance and true bearing calculations.
- Editable coordinates in both Decimal and Degrees-Minutes-Seconds (DMS) formats.
- Support for multiple measurement units.
- Native Leaflet base-layer switching, including OpenStreetMap, Esri World Imagery, and OpenTopoMap.
- Automatic persistence using localStorage.
- JSON import and export functionality for project data.
- Fullscreen mode support for enhanced usability.

## Design

The project follows a simple three-file architecture:

- `index.html` — the main HTML structure.
- `styles.css` — styling for the application.
- `app.js` — JavaScript logic handling state, geometry, and rendering.

The application runs entirely in the browser without any build system or server-side component. The project model acts as the single source of truth, while Leaflet is used solely as the rendering engine for map visualization and interaction.

## Implementation Notes

- **Project Model:** Maintains the state of lines, range rings, measurement units, and base layers.
- **Geometry Utilities:** Implements Haversine formula for distance, great-circle initial bearing, and destination point calculations.
- **Persistence:** Automatically saves and loads project data from localStorage.
- **Separation of Concerns:** Clear distinction between rendering logic (Leaflet), geometry calculations, and application state management.

## Usage

- **Drawing Lines:** Use the line tool to create geodesic lines by clicking on the map.
- **Drawing Circles:** Use the circle tool to create range rings centered on a point with a specified radius.
- **Editing Objects:** Click on existing lines or circles to edit their coordinates and properties.
- **Changing Units:** Select different measurement units for distances and bearings.
- **Switching Base Maps:** Choose between OpenStreetMap, Esri World Imagery, and OpenTopoMap base layers.
- **Saving/Loading Projects:** Export your current project to JSON or import a saved project.
- **Keyboard Shortcuts:**
  - `Esc` — Cancel current drawing or editing.
  - `L` — Activate line drawing mode.
  - `C` — Activate circle drawing mode.
  - `Ctrl+N` — Create a new project.
  - `Ctrl+O` — Open a saved project.
  - `Ctrl+S` — Save the current project.

## Base Maps

- **OpenStreetMap Standard:** The default open-source map layer.
- **Esri World Imagery:** High-resolution satellite imagery.
- **OpenTopoMap:** Topographic map layer with terrain information.

The selected base layer is persisted along with the project data to maintain your preferred view.

## Third-party Components

- [Leaflet](https://leafletjs.com/) — for interactive map rendering.
- [OpenStreetMap](https://www.openstreetmap.org/) — base map tiles.
- [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) — satellite imagery tiles.
- [OpenTopoMap](https://opentopomap.org/) — topographic map tiles.
- [Phosphor Icons](https://phosphoricons.com/) — iconography used in the UI.

## Data Sources and Attribution

Map tiles and data remain subject to their respective providers' attribution and usage policies. Please refer to each provider's terms for details on permitted use.

## Browser Support

bs-triangulate targets modern Chromium-based browsers, Firefox, and Safari with JavaScript enabled for full functionality.

## License

(C) 2026 Michael G Brown
This project is released under the BSD 3-Clause License.
