# Bladestorm Triangulate  
  
## Purpose  

**bs-triangulate** is a lightweight browser-based triangulation and measurement tool for use at:  

```txt
https://bladestorm.co/triangulate

```

It uses OpenStreetMap through Leaflet and allows multiple range/bearing lines and omnidirectional range circles to be created, edited, saved and restored.  
  
## Deliverable  

Three files only:  

```txt
index.html
styles.css
app.js

```

No build system. No framework. Leaflet loaded from CDN.  
  
## Layout  

```txt
+------------------------------------------------------------+
| Toolbar: File | Select Esc | Line L | Circle C | Units | FS |
+--------------------------+---------------------------------+
| Sidebar                  | Map                             |
|                          |                                 |
| Properties accordion     | Leaflet map                     |
| - selected object editor |                                 |
|                          |                                 |
| Objects accordion        |                                 |
| - Line 1                 |                                 |
| - Circle 1               |                                 |
+--------------------------+---------------------------------+

```

The app fills the browser viewport. The page itself does not scroll.  
Sidebar:  

* Expanded by default.  
* Can be collapsed/expanded.  
* Expanded width around 340px.  
* Collapsed width around 40–50px.  
* Properties shown above Objects.  
* Properties has fixed height.  
* Objects uses remaining sidebar height and scrolls internally.  
Fullscreen:  
* Fullscreen toggle in toolbar.  
* Sidebar state is preserved when entering/exiting fullscreen.  
  
## Toolbar  

Toolbar items:  

```txt
File | Sidebar | Select (Esc) | Measure Line (L) | Draw Circle (C) | Units | Fullscreen

```

File menu:  

* New  
* Open JSON  
* Save JSON  
Units dropdown:  
* metres  
* kilometres  
* nautical miles  
* statute miles  
* feet  
Keyboard shortcuts:  

| Shortcut | Action                      |
| -------- | --------------------------- |
| Esc      | Select mode                 |
| L        | Measure Line                |
| C        | Draw Circle                 |
| Ctrl+N   | New                         |
| Ctrl+O   | Open                        |
| Ctrl+S   | Save                        |
| Ctrl+F   | Toggle fullscreen, optional |
  
⸻  
  
## Internal storage  

Canonical internal representation:  

| Data            | Stored as                    |
| --------------- | ---------------------------- |
| Coordinates     | decimal degrees              |
| Distance/radius | metres                       |
| Bearing         | true compass bearing degrees |
  
Bearings use navigation/surveying convention:  

```txt
0° = North
90° = East
180° = South
270° = West
clockwise positive

```

Magnetic bearings are excluded from MVP.  
  
## Project model  

```js
const project = {
  version: 1,
  app: "bs-triangulate",
  units: "km",
  map: {
    center: [-25.2744, 133.7751],
    zoom: 4
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

```

Line object:  

```json
{
  id: "line_...",
  type: "line",
  name: "Line 1",
  start: { lat: -33.865143, lng: 151.209900 },
  end: { lat: -34.000000, lng: 151.500000 }
}

```

Circle object:  

```json
{
  id: "circle_...",
  type: "circle",
  name: "Circle 1",
  center: { lat: -33.865143, lng: 151.209900 },
  radiusMeters: 5000
}

```

Deleted numbers are not reused.  
  
## Drawing modes  

Modes:  

```txt
Select
Measure Line
Draw Circle

```

Only one mode is active at a time.  
After completing a line or circle, return to Select mode.  
  
## Line behaviour  

Creation:  

1. Select Measure Line.  
2. Click start point.  
3. Start marker appears as green dot.  
4. Pointer movement previews line.  
5. Click end point.  
6. End marker appears as red dot.  
7. Line is selected.  
Editing:  

* Start marker draggable.  
* End marker draggable.  
* Dragging either marker recalculates:  
  * distance  
  * bearing  
  * map label  
  * properties panel  
  * object list summary  
  * localStorage  
Changing distance or bearing in Properties updates the end point, keeping start fixed.  
Selected line label:  

```txt
12.47 km
127.4° T (SE)

```
  
## Circle behaviour  

Creation:  

1. Select Draw Circle.  
2. Click centre point.  
3. Centre marker appears as green dot.  
4. Pointer movement previews radius.  
5. Click to set radius.  
6. Circle is selected.  
Editing:  

* Centre marker draggable.  
* Dragging centre moves the circle without changing radius.  
* Radius handle appears when circle is selected.  
* Dragging radius handle changes radius.  
* Clicking near circumference selects the circle.  
* Clicking inside the circle away from centre/edge does not select it.  
Selected circle label:  

```txt
Radius: 5.00 km

```
  
## Selection behaviour  

Selection priority:  

```txt
1. endpoint / centre markers
2. radius handles
3. lines within pixel tolerance
4. circle circumference within pixel tolerance

```

Overlapping objects:  

* Candidate objects under cursor are collected.  
* Repeated clicks near the same screen location cycle through candidates.  
* This is important for overlapping triangulation circles.  
Selected objects:  
* Heavier stroke.  
* Larger markers/handles.  
* Measurement label visible.  
* Properties panel populated.  
* Object list item highlighted.  
  
## Properties panel  

Properties panel appears first in sidebar.  

## Line properties  

Editable:  

* Name  
* Start coordinate  
  * Decimal lat/lng pair  
  * DMS lat/lng pair  
* End coordinate  
  * Decimal lat/lng pair  
  * DMS lat/lng pair  
* Distance  
* Bearing  
* Remove button  
Changing start or end coordinates updates the map.  
Changing distance or bearing updates the end point.  

## Circle properties  

Editable:  

* Name  
* Centre coordinate  
  * Decimal lat/lng pair  
  * DMS lat/lng pair  
* Radius  
* Remove button  
Changing centre or radius updates the map.  
  
## Object list  

Objects panel appears below Properties.  
Requirements:  

* Scrollable.  
* Uses remaining sidebar height.  
* Lists all lines and circles.  
* Selecting a list item selects object on map.  
* Renaming in Properties updates list immediately.  
* Highlights selected object.  
* Shows compact summary, for example:  
  * Line 1 — 12.47 km, 127.4°  
  * Circle 1 — radius 5.00 km  
  
## Coordinate input  

Each coordinate pair is shown with two editable fields:  

```txt
Decimal:
-33.865143, 151.209900

DMS:
33° 51' 54.51" S, 151° 12' 35.64" E

```

Both fields accept flexible input.  
Accepted coordinate separators:  

```txt
,
;
/

```

Accepted examples:  

```txt
-33.865143, 151.209900
33.865143S, 151.209900E
33° 51' 54.51" S, 151° 12' 35.64" E
-33 51 54.51, 151 12 35.64
33 51.5 S / 151 12.75 E

```

Parsing rules:  

* One number = degrees.  
* Two numbers = degrees + minutes.  
* Three numbers = degrees + minutes + seconds.  
* Decimal degrees ignores following minutes/seconds.  
* Decimal minutes ignores following seconds.  
* Hemisphere/sign conflict is invalid.  
* Latitude must be -90..90.  
* Longitude must be -180..180.  
* Minutes and seconds must be 0..<60.  
On blur or Enter:  

1. Parse.  
2. Validate.  
3. Update object.  
4. Recalculate dependent values.  
5. Canonicalise both Decimal and DMS fields.  
  
## Unit handling  

Internally all distances are metres.  
Display/input units controlled by toolbar.  
Supported units:  

| Unit           | Suffix |
| -------------- | ------ |
| metres         | m      |
| kilometres     | km     |
| nautical miles | nm     |
| statute miles  | mi     |
| feet           | ft     |
  
Distance/radius inputs accept suffixes:  

```txt
1500
1.5 km
350 m
2 nm
1.2 mi
500 ft

```

If no suffix is supplied, assume selected toolbar unit.  
Changing toolbar units updates all displayed distances and radii.  
  
## Geometry utilities  

Implement as isolated functions:  

```txt
calculateDistanceMeters(start, end)
calculateInitialBearingDegrees(start, end)
calculateDestinationPoint(start, bearingDegrees, distanceMeters)
normalizeBearing(degrees)
bearingToCardinal(degrees)
formatBearing(degrees)
convertMetersToUnit(meters, unit)
convertUnitToMeters(value, unit)
parseDistanceInput(text, defaultUnit)
parseCoordinatePair(text)
formatDecimalCoordinatePair(point)
formatDmsCoordinatePair(point)

```

Use spherical geodesic calculations:  

* Haversine for distance.  
* Great-circle initial bearing.  
* Great-circle destination point.  
  
## Persistence  

## Auto-save  

Every meaningful edit writes project JSON to:  

```txt
localStorage["bs-triangulate-project"]

```

## Startup  

1. Restore localStorage project if present.  
2. Otherwise attempt browser geolocation.  
3. If unavailable or denied, default to Australia.  

## New  

New project:  

* Confirms if objects exist.  
* Clears current project.  
* Clears localStorage.  
* Resets counters.  
* Resets map view.  
* Leaves no saved localStorage state if browser is closed immediately.  

## Save/Open  

Save:  

* Downloads project JSON.  
Open:  
* Loads project JSON.  
* Validates app/version where possible.  
* Restores map, objects, units and UI state.  
  
## Styling  

General visual model:  

* Desktop GIS-style interface.  
* Functional, compact, readable.  
* Map is the primary surface.  
* Sidebar should not dominate.  
* Selected object clearly distinguishable.  
* Labels unobtrusive.  
Markers:  

| Marker               | Colour              |
| -------------------- | ------------------- |
| Line start           | green               |
| Line end             | red                 |
| Circle centre        | green               |
| Circle radius handle | neutral/contrasting |
  
## JavaScript documentation standard  

Every function should have a JSDoc header.  
Example:  

```js
/**
 * Calculates the initial true bearing from one point to another.
 *
 * The result follows navigation convention: 0 degrees is north,
 * 90 degrees is east, and values increase clockwise.
 *
 * @param {{lat: number, lng: number}} start - Start coordinate.
 * @param {{lat: number, lng: number}} end - End coordinate.
 * @returns {number} Bearing in degrees from 0 inclusive to 360 exclusive.
 */
function calculateInitialBearingDegrees(start, end) {
  // Implementation...
}

```

Use liberal comments where code intent is not obvious, especially in:  

* coordinate parsing  
* hit testing  
* selection cycling  
* drawing state transitions  
* persistence  
* geometry calculations  
  
## Implementation phases  

## Phase 1 — Skeleton  

* Create index.html, styles.css, app.js.  
* Load Leaflet.  
* Create toolbar.  
* Create collapsible sidebar.  
* Create Properties and Objects accordions.  
* Create viewport-filling layout.  
* Initialise map.  

## Phase 2 — State and persistence  

* Add project model.  
* Add counters.  
* Add auto-save.  
* Add restore from localStorage.  
* Add New/Open/Save JSON.  

## Phase 3 — Geometry and units  

* Add distance calculation.  
* Add bearing calculation.  
* Add destination point calculation.  
* Add unit conversion.  
* Add distance/radius formatting and parsing.  

## Phase 4 — Coordinate parser  

* Add decimal coordinate parsing.  
* Add DMS parsing.  
* Add flexible pair separators.  
* Add validation.  
* Add canonical decimal and DMS formatting.  

## Phase 5 — Line feature  

* Draw line mode.  
* Start/end markers.  
* Preview line.  
* Draggable endpoints.  
* Selected styling.  
* Labels.  
* Line properties.  
* Remove line.  

## Phase 6 — Circle feature  

* Draw circle mode.  
* Centre marker.  
* Radius preview.  
* Draggable centre.  
* Radius handle.  
* Selected styling.  
* Labels.  
* Circle properties.  
* Remove circle.  

## Phase 7 — Selection and object list  

* Map hit testing.  
* Marker/handle/line/circle priority.  
* Overlap candidate cycling.  
* Object list rendering.  
* Object selection from list.  
* Rename support.  

## Phase 8 — Polish and validation  

* Fullscreen toggle.  
* Keyboard shortcuts.  
* Sidebar state persistence.  
* Accordion state persistence.  
* Error messages.  
* JSDoc/comment pass.  
* Manual testing.  
  
## MVP exclusions  

Not included in first implementation:  

* Magnetic declination.  
* Terrain/line-of-sight.  
* KML/GPX import/export.  
* Undo/redo.  
* Multi-layer maps.  
* Server storage.  
* User accounts.  
* Mobile-first layout.  
* Advanced CAD/GIS editing tools.  
  
## Main implementation risks  

1. **Coordinate parser**  
    * Most complex part.  
    * Should be developed as isolated utility functions.  
2. **Overlapping object selection**  
    * Needs deterministic behaviour.  
    * Keep tolerance and cycling simple.  
3. **Leaflet circle semantics**  
    * Leaflet circles are metre-based but rendered on Web Mercator tiles.  
    * Acceptable for this app, but calculations should still use geodesic formulas.  
