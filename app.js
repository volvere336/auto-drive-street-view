// Street View Route Driver - Main Application
(function() {
  'use strict';

  // ==================== State ====================
  let map = null;
  let streetView = null;
  let directionsService = null;
  let directionsRenderer = null;
  let routePoints = [];
  let currentPointIndex = 0;
  let isPlaying = false;
  let playbackInterval = null;
  let travelMode = 'DRIVING';
  let currentMarker = null;
  let waypoints = []; // Array of {address: string, marker: Marker}
  let waypointCount = 0;
  let pendingSliderJumpTimeout = null;
  let pendingSliderJumpIndex = null;

  // Speed settings (milliseconds between moves)
  const speedSettings = {
    1: { label: 'Very Slow', interval: 3000 },
    2: { label: 'Slow', interval: 2000 },
    3: { label: 'Medium', interval: 1200 },
    4: { label: 'Fast', interval: 700 },
    5: { label: 'Very Fast', interval: 350 }
  };
  
  // Track if current route is from GPX (affects playback behavior)
  let isGPXRoute = false;
  
  // ==================== Debug Logger ====================
  let debugEnabled = false;
  let debugLines = [];
  const maxDebugLines = 50;
  
  function debugLog(message) {
    if (!debugEnabled) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] ${message}`;
    
    console.log(line); // Also log to console
    
    debugLines.push(line);
    if (debugLines.length > maxDebugLines) {
      debugLines.shift();
    }
    
    const debugContent = document.getElementById('debug-content');
    const debugPanel = document.getElementById('debug-log');
    
    if (debugContent && debugPanel) {
      debugPanel.style.display = 'block';
      debugContent.innerHTML = debugLines.map(l => `<div>${l}</div>`).join('');
      debugContent.scrollTop = debugContent.scrollHeight;
    }
  }
  
  function clearDebugLog() {
    debugLines = [];
    const debugContent = document.getElementById('debug-content');
    if (debugContent) {
      debugContent.innerHTML = '';
    }
  }

  // ==================== Initialize ====================
  function init() {
    // Check for saved API key and auto-load
    const savedKey = localStorage.getItem('googleMapsApiKey');
    if (savedKey) {
      document.getElementById('api-key-input').value = savedKey;
      document.getElementById('api-key-input-area').style.display = 'none';
      document.getElementById('api-key-saved-area').style.display = 'block';
      // Auto-load the API
      loadGoogleMapsApi();
    }

    // API key loading
    document.getElementById('load-api-btn').addEventListener('click', loadGoogleMapsApi);
    document.getElementById('api-key-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loadGoogleMapsApi();
    });
    
    // Change API key button
    document.getElementById('change-api-btn').addEventListener('click', () => {
      document.getElementById('api-key-input-area').style.display = 'block';
      document.getElementById('api-key-saved-area').style.display = 'none';
      document.getElementById('api-key-input').value = '';
      document.getElementById('api-key-input').focus();
    });

    // Panel collapse
    document.getElementById('collapse-btn').addEventListener('click', togglePanel);
    document.getElementById('restore-panel-btn').addEventListener('click', togglePanel);

    // Travel mode buttons
    document.getElementById('mode-drive').addEventListener('click', () => setTravelMode('DRIVING'));
    document.getElementById('mode-walk').addEventListener('click', () => setTravelMode('WALKING'));
    document.getElementById('mode-bike').addEventListener('click', () => setTravelMode('BICYCLING'));

    // Route button
    document.getElementById('get-route-btn').addEventListener('click', getRoute);

    // Playback controls
    document.getElementById('play-btn').addEventListener('click', play);
    document.getElementById('pause-btn').addEventListener('click', pause);
    document.getElementById('stop-btn').addEventListener('click', stop);

    // Speed slider
    document.getElementById('speed-slider').addEventListener('input', updateSpeed);
    updateSpeed();
    
    // Route options - add listeners that trigger route recalculation
    document.getElementById('avoid-tolls').addEventListener('change', handleRouteOptionChange);
    document.getElementById('avoid-highways').addEventListener('change', handleRouteOptionChange);
    document.getElementById('avoid-ferries').addEventListener('change', handleRouteOptionChange);
    
    // Position slider - drag to jump to any point on route (debounced to avoid jitter)
    document.getElementById('position-slider').addEventListener('input', (e) => {
      if (routePoints.length === 0) return;

      const percent = parseInt(e.target.value, 10);
      const index = Math.floor((percent / 100) * (routePoints.length - 1));
      pendingSliderJumpIndex = index;

      if (pendingSliderJumpTimeout) {
        clearTimeout(pendingSliderJumpTimeout);
      }

      pendingSliderJumpTimeout = setTimeout(() => {
        pendingSliderJumpTimeout = null;
        if (pendingSliderJumpIndex !== null) {
          performManualJump(pendingSliderJumpIndex, 'SLIDER');
          pendingSliderJumpIndex = null;
        }
      }, 120);
    });

    // Ensure final slider release applies immediately.
    document.getElementById('position-slider').addEventListener('change', (e) => {
      if (routePoints.length === 0) return;

      const percent = parseInt(e.target.value, 10);
      const index = Math.floor((percent / 100) * (routePoints.length - 1));

      if (pendingSliderJumpTimeout) {
        clearTimeout(pendingSliderJumpTimeout);
        pendingSliderJumpTimeout = null;
      }

      pendingSliderJumpIndex = null;
      performManualJump(index, 'SLIDER');
    });
    
    // Add stop button
    document.getElementById('add-stop-btn').addEventListener('click', addWaypointInput);
    
    // Debug log clear button
    const clearLogBtn = document.getElementById('clear-log-btn');
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', clearDebugLog);
    }
    
    debugLog('App initialized');
    
    // GPX file handling
    const gpxDropZone = document.getElementById('gpx-drop-zone');
    const gpxFileInput = document.getElementById('gpx-file-input');
    
    // Click to browse
    gpxDropZone.addEventListener('click', (e) => {
      if (e.target.id !== 'clear-gpx-btn') {
        gpxFileInput.click();
      }
    });
    
    // File input change
    gpxFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleGPXFile(e.target.files[0]);
      }
    });
    
    // Drag and drop
    gpxDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      gpxDropZone.classList.add('drag-over');
    });
    
    gpxDropZone.addEventListener('dragleave', () => {
      gpxDropZone.classList.remove('drag-over');
    });
    
    gpxDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      gpxDropZone.classList.remove('drag-over');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.gpx') || file.name.endsWith('.kml')) {
          handleGPXFile(file);
        } else {
          showStatus('Please drop a GPX or KML file', 'error');
        }
      }
    });
    
    // Clear GPX button
    document.getElementById('clear-gpx-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      clearGPXRoute();
    });
  }
  
  // ==================== Route Options ====================
  function handleRouteOptionChange() {
    // Don't auto-trigger route - user can click "Get Route" button if they want
  }
  
  function performManualJump(index, source) {
    if (index < 0 || index >= routePoints.length) return;

    if (isPlaying) {
      pause();
    } else {
      waitingForStreetView = false;
    }

    currentPointIndex = index;
    debugLog(`${source}: Jump to ${index}`);
    moveToPoint(index);
  }

  // ==================== GPX File Handling ====================
  function handleGPXFile(file) {
    showStatus('Loading GPX file...', 'info');
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const gpxText = e.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(gpxText, 'text/xml');
        
        // Check for parsing errors
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
          showStatus('Invalid GPX file format', 'error');
          return;
        }
        
        // Try to parse GPX format
        let points = parseGPX(xmlDoc);
        
        // If no points found, try KML format
        if (points.length === 0) {
          points = parseKML(xmlDoc);
        }
        
        if (points.length === 0) {
          showStatus('No route data found in file', 'error');
          return;
        }
        
        // Process the GPX route
        loadGPXRoute(points, file.name);
        
      } catch (error) {
        console.error('Error parsing GPX file:', error);
        showStatus('Error reading GPX file', 'error');
      }
    };
    
    reader.onerror = () => {
      showStatus('Error reading file', 'error');
    };
    
    reader.readAsText(file);
  }
  
  function parseGPX(xmlDoc) {
    const points = [];
    
    // Try track points first (most common in GPX)
    const trkpts = xmlDoc.querySelectorAll('trkpt');
    if (trkpts.length > 0) {
      trkpts.forEach(pt => {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lng = parseFloat(pt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lng)) {
          points.push({ lat, lng });
        }
      });
      return points;
    }
    
    // Try route points
    const rtepts = xmlDoc.querySelectorAll('rtept');
    if (rtepts.length > 0) {
      rtepts.forEach(pt => {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lng = parseFloat(pt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lng)) {
          points.push({ lat, lng });
        }
      });
      return points;
    }
    
    // Try waypoints as fallback
    const wpts = xmlDoc.querySelectorAll('wpt');
    wpts.forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lng = parseFloat(pt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({ lat, lng });
      }
    });
    
    return points;
  }
  
  function parseKML(xmlDoc) {
    const points = [];
    
    // Look for coordinates in KML format
    const coordinates = xmlDoc.querySelectorAll('coordinates');
    coordinates.forEach(coordElement => {
      const coordText = coordElement.textContent.trim();
      const coordPairs = coordText.split(/\s+/);
      
      coordPairs.forEach(pair => {
        const parts = pair.split(',');
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lng)) {
            points.push({ lat, lng });
          }
        }
      });
    });
    
    return points;
  }
  
  function loadGPXRoute(points, filename) {
    // Stop any current playback
    if (isPlaying) {
      stop();
    }
    
    isGPXRoute = true; // Mark this as a GPX route
    debugLog(`Loading GPX: ${filename}`);
    
    showStatus('Processing GPX track...', 'info');
    
    // Remove duplicates
    const filteredPoints = points.filter((point, index) => {
      if (index === 0) return true;
      const prev = points[index - 1];
      return point.lat !== prev.lat || point.lng !== prev.lng;
    });
    
    // Calculate total distance and simplify if needed
    let totalDistance = 0;
    for (let i = 1; i < filteredPoints.length; i++) {
      if (google.maps.geometry && google.maps.geometry.spherical) {
        const from = new google.maps.LatLng(filteredPoints[i - 1].lat, filteredPoints[i - 1].lng);
        const to = new google.maps.LatLng(filteredPoints[i].lat, filteredPoints[i].lng);
        totalDistance += google.maps.geometry.spherical.computeDistanceBetween(from, to);
      }
    }
    
    // Keep all GPS points - don't throw away user's data
    let simplifiedPoints = filteredPoints;
    debugLog(`Processing ${filteredPoints.length} GPS points`);
    
    // For GPX tracks, use minimal interpolation since we already simplified
    // We want ~20 meter gaps between points to match Street View panorama spacing
    routePoints = isGPXRoute ? interpolateGPXRoute(simplifiedPoints, 0.0002) : interpolateGPXRoute(simplifiedPoints, 0.0001);
    currentPointIndex = 0;
    
    debugLog(`Route processed: ${routePoints.length} interpolated points`);
    
    // Show GPX file info
    document.querySelector('.drop-zone-content').style.display = 'none';
    document.getElementById('gpx-file-info').style.display = 'block';
    document.getElementById('gpx-filename').textContent = filename;
    document.getElementById('gpx-stats').textContent = 
      `${simplifiedPoints.length} points • ${(totalDistance / 1000).toFixed(1)} km`;
    
    // Draw the route on the map
    if (window.gpxPolyline) {
      window.gpxPolyline.setMap(null);
    }
    
    window.gpxPolyline = new google.maps.Polyline({
      path: routePoints,
      geodesic: true,
      strokeColor: '#ea4335', // Red color to distinguish from directions routes
      strokeOpacity: 0.8,
      strokeWeight: 4,
      map: map
    });
    
    // Fit map to route
    const bounds = new google.maps.LatLngBounds();
    routePoints.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
    
    // Move to start
    moveToPoint(0);
    
    // Show playback controls
    document.getElementById('playback-controls').classList.add('visible');
    
    // Check Street View availability at start point (async warning if not available)
    checkStreetViewAvailability(routePoints[0]);
    
    showStatus(`GPX loaded: ${(totalDistance / 1000).toFixed(1)} km`, 'success');
    updateProgress();
  }
  
  // Simplify GPS track by reducing point density
  function simplifyGPXTrack(points, tolerance) {
    if (points.length <= 2) return points;
    
    const simplified = [points[0]]; // Always keep first point
    let lastKept = 0;
    
    for (let i = 1; i < points.length - 1; i++) {
      const distanceFromLast = i - lastKept;
      
      // Keep point if it's far enough from the last kept point
      if (distanceFromLast >= tolerance) {
        simplified.push(points[i]);
        lastKept = i;
      }
    }
    
    simplified.push(points[points.length - 1]); // Always keep last point
    return simplified;
  }
  
  // Interpolate GPX route with configurable density
  function interpolateGPXRoute(points, minDistance) {
    if (points.length < 2) return points;

    const interpolated = [];

    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      
      interpolated.push(start);

      // Calculate distance
      const dLat = end.lat - start.lat;
      const dLng = end.lng - start.lng;
      const distance = Math.sqrt(dLat * dLat + dLng * dLng);

      // Add intermediate points if needed for smooth curves
      if (distance > minDistance) {
        const steps = Math.ceil(distance / minDistance);
        for (let j = 1; j < steps; j++) {
          const t = j / steps;
          interpolated.push({
            lat: start.lat + dLat * t,
            lng: start.lng + dLng * t
          });
        }
      }
    }

    interpolated.push(points[points.length - 1]);
    return interpolated;
  }
  
  // Check if Street View is available at a location
  function checkStreetViewAvailability(point) {
    const streetViewService = new google.maps.StreetViewService();
    const STREETVIEW_MAX_DISTANCE = 50; // meters
    
    streetViewService.getPanorama({
      location: new google.maps.LatLng(point.lat, point.lng),
      radius: STREETVIEW_MAX_DISTANCE,
      source: google.maps.StreetViewSource.OUTDOOR
    }, (data, status) => {
      if (status !== 'OK') {
        showStatus('⚠️ Limited Street View coverage on this track', 'info');
        console.warn('Street View may not be available along entire GPX route');
      } else {
        console.log('Street View available at start point');
      }
    });
  }
  
  function clearGPXRoute() {
    // Clear the route
    routePoints = [];
    currentPointIndex = 0;
    isGPXRoute = false;
    
    // Hide heading indicator
    document.getElementById('heading-indicator').style.display = 'none';
    
    // Remove polyline from map
    if (window.gpxPolyline) {
      window.gpxPolyline.setMap(null);
      window.gpxPolyline = null;
    }
    
    // Reset UI
    document.querySelector('.drop-zone-content').style.display = 'flex';
    document.getElementById('gpx-file-info').style.display = 'none';
    document.getElementById('gpx-file-input').value = '';
    
    // Hide playback controls
    document.getElementById('playback-controls').classList.remove('visible');
    
    showStatus('GPX route cleared', 'info');
  }
  
  // ==================== Waypoints ====================
  function addWaypointInput() {
    waypointCount++;
    const container = document.getElementById('waypoints-container');
    const letter = String.fromCharCode(65 + waypoints.length + 1); // B, C, D, etc.
    
    const div = document.createElement('div');
    div.className = 'input-group waypoint-group';
    div.id = `waypoint-${waypointCount}`;
    div.innerHTML = `
      <label style="display: flex; justify-content: space-between; align-items: center;">
        <span>Stop ${waypoints.length + 1}</span>
        <button type="button" class="remove-waypoint" data-id="${waypointCount}" style="background: none; border: none; color: #ea4335; cursor: pointer; font-size: 14px;">✕</button>
      </label>
      <input type="text" class="waypoint-input" data-id="${waypointCount}" placeholder="Enter stop address...">
    `;
    
    container.appendChild(div);
    
    // Store waypoint
    const waypointData = { id: waypointCount, address: '' };
    waypoints.push(waypointData);
    
    // Setup autocomplete
    const input = div.querySelector('.waypoint-input');
    if (window.google && google.maps && google.maps.places) {
      const autocomplete = new google.maps.places.Autocomplete(input);
      autocomplete.setFields(['place_id', 'geometry', 'formatted_address']);
      
      // Listen for place selection
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place && place.formatted_address) {
          waypointData.address = place.formatted_address;
          input.value = place.formatted_address;
        } else {
          waypointData.address = input.value;
        }
        console.log('Waypoint updated:', waypointData.address);
        triggerRouteUpdate();
      });
    }
    
    // Setup remove button
    div.querySelector('.remove-waypoint').addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      removeWaypoint(id);
    });
    
    // Also listen for blur/change as fallback
    input.addEventListener('blur', () => {
      const id = parseInt(input.dataset.id);
      const wp = waypoints.find(w => w.id === id);
      if (wp && input.value && wp.address !== input.value) {
        wp.address = input.value;
        console.log('Waypoint updated (blur):', wp.address);
        triggerRouteUpdate();
      }
    });
    
    input.focus();
  }
  
  function triggerRouteUpdate() {
    // Don't auto-trigger route - user can click "Get Route" button
  }
  
  function removeWaypoint(id) {
    const div = document.getElementById(`waypoint-${id}`);
    if (div) {
      div.remove();
    }
    waypoints = waypoints.filter(w => w.id !== id);
    // Don't auto-recalculate - let user click button
  }

  // ==================== Google Maps API Loading ====================
  function loadGoogleMapsApi() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    // Save API key
    localStorage.setItem('googleMapsApiKey', apiKey);

    // Check if already loaded
    if (window.google && window.google.maps) {
      initMaps();
      return;
    }

    // Load the API
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=initMapsCallback`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      showStatus('Failed to load Google Maps API. Check your API key.', 'error');
    };
    document.head.appendChild(script);

    showStatus('Loading Google Maps...', 'info');
  }

  // Global callback for Google Maps
  window.initMapsCallback = function() {
    initMaps();
  };

  // Global error handler for Google Maps
  window.gm_authFailure = function() {
    showStatus('API Key error! Check: 1) Key is correct, 2) Billing enabled, 3) APIs enabled (Maps JavaScript, Directions, Places)', 'error');
    console.error('Google Maps authentication failed. Common causes:', 
      '\n1. Invalid API key',
      '\n2. Billing not enabled on the project',
      '\n3. Required APIs not enabled',
      '\n4. API key restrictions blocking this domain');
  };

  function initMaps() {
    // Show API key saved message, hide input area, show main controls
    document.getElementById('api-key-input-area').style.display = 'none';
    document.getElementById('api-key-saved-area').style.display = 'block';
    document.getElementById('main-controls').style.display = 'block';

    // Initialize Street View
    streetView = new google.maps.StreetViewPanorama(
      document.getElementById('street-view'),
      {
        position: { lat: 40.7128, lng: -74.0060 }, // Default: NYC
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        addressControl: true,
        showRoadLabels: true,
        motionTracking: false,
        motionTrackingControl: false
      }
    );

    // Initialize mini map
    map = new google.maps.Map(document.getElementById('mini-map'), {
      center: { lat: 40.7128, lng: -74.0060 },
      zoom: 12,
      disableDefaultUI: true,
      zoomControl: true,
      streetViewControl: false,
      disableDoubleClickZoom: true
    });
    map.setStreetView(streetView);
    

    // Initialize directions
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      map: map,
      suppressMarkers: true,
      draggable: true,
      polylineOptions: {
        strokeColor: '#4285f4',
        strokeWeight: 5
      }
    });
    
    // Listen for route changes (when user drags the route)
    directionsRenderer.addListener('directions_changed', () => {
      const directions = directionsRenderer.getDirections();
      if (directions) {
        processRoute(directions);
        showStatus('Route updated!', 'success');
      }
    });

    // Setup autocomplete for inputs
    setupAutocomplete('origin-input');
    setupAutocomplete('destination-input');
    
    // Setup map click to set origin/destination
    setupMapClickHandlers();
    
    // Create draggable markers for origin and destination
    createRouteMarkers();

    showStatus('Ready! Enter route or click map to set points.', 'success');
  }
  
  let originMarker = null;
  let destinationMarker = null;
  let clickMode = null; // 'origin', 'destination', or null
  
  function createRouteMarkers() {
    // These will be created when needed
  }
  
  function jumpToNearestPoint(latLng) {
    if (routePoints.length === 0) {
      showStatus('Load a route first', 'info');
      return;
    }
    
    // Find the closest point on the route
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    for (let i = 0; i < routePoints.length; i++) {
      const point = routePoints[i];
      const pointLatLng = new google.maps.LatLng(point.lat, point.lng);
      const distance = google.maps.geometry.spherical.computeDistanceBetween(latLng, pointLatLng);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }
    
    console.log('Jumping to point:', closestIndex, 'of', routePoints.length);
    
    // Jump to that point
    if (isPlaying) {
      pause();
    }
    currentPointIndex = closestIndex;
    moveToPoint(closestIndex);
    showStatus(`Jumped to point ${closestIndex + 1} of ${routePoints.length}`, 'info');
  }
  
  function setupMapClickHandlers() {
    // Handle all map clicks
    map.addListener('click', (e) => {
      // Shift+Click = jump to nearest point on route
      if (e.domEvent && e.domEvent.shiftKey) {
        console.log('Shift+Click detected');
        jumpToNearestPoint(e.latLng);
        return;
      }
      // Normal click = set origin/destination
      handleMapClick(e);
    });
    
    // Double-click = jump to nearest point on route
    map.addListener('dblclick', (e) => {
      console.log('Double-click on map');
      jumpToNearestPoint(e.latLng);
    });
    
    // Show hint when route is loaded
    map.addListener('mouseover', () => {
      if (routePoints.length > 0) {
        const hint = document.getElementById('map-hint');
        if (hint) hint.style.display = 'block';
      }
    });
    
    map.addListener('mouseout', () => {
      const hint = document.getElementById('map-hint');
      if (hint) hint.style.display = 'none';
    });
  }
  
  function handleMapClick(e) {
    const latLng = e.latLng;
    
    // Geocode the clicked location to get an address
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: latLng }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const address = results[0].formatted_address;
        
        if (clickMode === 'origin') {
          document.getElementById('origin-input').value = address;
          updateOriginMarker(latLng);
          clickMode = null;
          document.getElementById('origin-input').style.background = '';
          showStatus('Origin set! Click destination or enter address.', 'success');
        } else if (clickMode === 'destination') {
          document.getElementById('destination-input').value = address;
          updateDestinationMarker(latLng);
          clickMode = null;
          document.getElementById('destination-input').style.background = '';
          showStatus('Destination set! Click "Get Route" button.', 'success');
        } else {
          // Default: if origin is empty, set origin; otherwise set destination
          if (!document.getElementById('origin-input').value) {
            document.getElementById('origin-input').value = address;
            updateOriginMarker(latLng);
            showStatus('Origin set! Click map again for destination.', 'success');
          } else {
            document.getElementById('destination-input').value = address;
            updateDestinationMarker(latLng);
            showStatus('Destination set! Click "Get Route" button.', 'success');
          }
        }
      }
    });
  }
  
  function updateOriginMarker(latLng) {
    if (originMarker) {
      originMarker.setPosition(latLng);
    } else {
      originMarker = new google.maps.Marker({
        position: latLng,
        map: map,
        draggable: true,
        label: 'A',
        title: 'Drag to change origin'
      });
      
      originMarker.addListener('dragend', () => {
        const pos = originMarker.getPosition();
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: pos }, (results, status) => {
          if (status === 'OK' && results[0]) {
            document.getElementById('origin-input').value = results[0].formatted_address;
            // Don't auto-trigger route
          }
        });
      });
    }
  }
  
  function updateDestinationMarker(latLng) {
    if (destinationMarker) {
      destinationMarker.setPosition(latLng);
    } else {
      destinationMarker = new google.maps.Marker({
        position: latLng,
        map: map,
        draggable: true,
        label: 'B',
        title: 'Drag to change destination'
      });
      
      destinationMarker.addListener('dragend', () => {
        const pos = destinationMarker.getPosition();
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: pos }, (results, status) => {
          if (status === 'OK' && results[0]) {
            document.getElementById('destination-input').value = results[0].formatted_address;
            // Don't auto-trigger route
          }
        });
      });
    }
  }

  function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.setFields(['place_id', 'geometry', 'formatted_address']);
  }

  function setTravelMode(mode) {
    // Stop any current playback
    if (isPlaying) {
      stop();
    }
    
    travelMode = mode;
    console.log('Travel mode set to:', travelMode);
    
    document.querySelectorAll('.travel-mode button').forEach(btn => btn.classList.remove('active'));
    
    // Map mode to button ID
    const buttonMap = {
      'DRIVING': 'mode-drive',
      'WALKING': 'mode-walk',
      'BICYCLING': 'mode-bike'
    };
    document.getElementById(buttonMap[mode]).classList.add('active');
    
    // Show/hide route options based on mode
    const avoidTollsRow = document.getElementById('avoid-tolls').closest('.option-row');
    const avoidHighwaysRow = document.getElementById('avoid-highways').closest('.option-row');
    
    if (mode === 'DRIVING') {
      avoidTollsRow.style.display = 'block';
      avoidHighwaysRow.style.display = 'block';
    } else {
      avoidTollsRow.style.display = 'none';
      avoidHighwaysRow.style.display = 'none';
    }
    
    // DON'T auto-recalculate - let user click "Get Route" button
  }

  function getRoute() {
    const origin = document.getElementById('origin-input').value.trim();
    const destination = document.getElementById('destination-input').value.trim();

    if (!origin || !destination) {
      showStatus('Please enter both origin and destination', 'error');
      return;
    }

    document.getElementById('get-route-btn').disabled = true;
    document.getElementById('get-route-btn').textContent = 'Getting route...';
    showStatus('Calculating route...', 'info');

    // Build waypoints array from inputs
    const waypointLocations = waypoints
      .filter(w => w.address && w.address.trim())
      .map(w => ({
        location: w.address,
        stopover: true
      }));
    
    const request = {
      origin: origin,
      destination: destination,
      travelMode: google.maps.TravelMode[travelMode],
      provideRouteAlternatives: false,
      waypoints: waypointLocations,
      optimizeWaypoints: false // Keep the order user specified
    };
    
    // Add avoidance options based on checkbox states
    if (travelMode === 'DRIVING') {
      request.avoidTolls = document.getElementById('avoid-tolls').checked;
      request.avoidHighways = document.getElementById('avoid-highways').checked;
      request.avoidFerries = document.getElementById('avoid-ferries').checked;
    } else {
      // For walking and bicycling, only ferries apply
      request.avoidFerries = document.getElementById('avoid-ferries').checked;
    }
    
    console.log('Requesting route with mode:', travelMode, 'waypoints:', waypointLocations.length, 'options:', {
      avoidTolls: request.avoidTolls,
      avoidHighways: request.avoidHighways,
      avoidFerries: request.avoidFerries
    });

    directionsService.route(request, (result, status) => {
      document.getElementById('get-route-btn').disabled = false;
      document.getElementById('get-route-btn').textContent = 'Get Route';

      if (status === 'OK') {
        directionsRenderer.setDirections(result);
        processRoute(result);
      } else {
        showStatus('Could not find route: ' + status, 'error');
      }
    });
  }

  function processRoute(directionsResult) {
    routePoints = [];
    currentPointIndex = 0;
    isGPXRoute = false; // This is a directions route, not GPX
    
    // Hide heading indicator (only for GPX)
    document.getElementById('heading-indicator').style.display = 'none';
    
    // Clear GPX polyline if it exists
    if (window.gpxPolyline) {
      window.gpxPolyline.setMap(null);
      window.gpxPolyline = null;
    }

    const route = directionsResult.routes[0];
    const legs = route.legs;

    // Extract points from the route - use the overview polyline for smoothest path
    const overviewPath = route.overview_path;
    if (overviewPath && overviewPath.length > 0) {
      // Use the overview path which contains the full route polyline
      overviewPath.forEach(point => {
        routePoints.push({
          lat: point.lat(),
          lng: point.lng()
        });
      });
    } else {
      // Fallback: extract from each step
      legs.forEach(leg => {
        leg.steps.forEach(step => {
          // Try to decode the polyline
          if (step.polyline && step.polyline.points) {
            try {
              const decoded = google.maps.geometry.encoding.decodePath(step.polyline.points);
              decoded.forEach(point => {
                routePoints.push({
                  lat: point.lat(),
                  lng: point.lng()
                });
              });
            } catch (e) {
              // Fallback to step locations
              routePoints.push({
                lat: step.start_location.lat(),
                lng: step.start_location.lng()
              });
            }
          } else if (step.path && step.path.length > 0) {
            step.path.forEach(point => {
              routePoints.push({
                lat: point.lat(),
                lng: point.lng()
              });
            });
          } else {
            routePoints.push({
              lat: step.start_location.lat(),
              lng: step.start_location.lng()
            });
          }
        });

        // Add leg end
        routePoints.push({
          lat: leg.end_location.lat(),
          lng: leg.end_location.lng()
        });
      });
    }

    // Remove duplicate consecutive points
    routePoints = routePoints.filter((point, index) => {
      if (index === 0) return true;
      const prev = routePoints[index - 1];
      return point.lat !== prev.lat || point.lng !== prev.lng;
    });

    // Interpolate to get smoother path
    routePoints = interpolateRoute(routePoints);

    console.log(`Route processed: ${routePoints.length} points`);

    // Show playback controls
    document.getElementById('playback-controls').classList.add('visible');

    // Fit map to route
    const bounds = new google.maps.LatLngBounds();
    routePoints.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);

    // Move to start
    moveToPoint(0);

    const distance = legs.reduce((sum, leg) => sum + leg.distance.value, 0);
    const duration = legs.reduce((sum, leg) => sum + leg.duration.value, 0);
    
    showStatus(
      `Route ready: ${(distance / 1000).toFixed(1)} km, ~${Math.round(duration / 60)} min`,
      'success'
    );
    updateProgress();
  }

  // Interpolate between points for smoother movement
  function interpolateRoute(points) {
    if (points.length < 2) return points;

    const interpolated = [];
    const minDistance = 0.00015; // Roughly 15 meters

    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      
      interpolated.push(start);

      // Calculate distance
      const dLat = end.lat - start.lat;
      const dLng = end.lng - start.lng;
      const distance = Math.sqrt(dLat * dLat + dLng * dLng);

      // Add intermediate points if needed
      if (distance > minDistance) {
        const steps = Math.ceil(distance / minDistance);
        for (let j = 1; j < steps; j++) {
          const t = j / steps;
          interpolated.push({
            lat: start.lat + dLat * t,
            lng: start.lng + dLng * t
          });
        }
      }
    }

    interpolated.push(points[points.length - 1]);
    return interpolated;
  }

  // ==================== Street View Navigation ====================
  let waitingForStreetView = false;
  let lastPanoId = null; // Track which panorama we're on
  let samePanoCount = 0; // Count how many times we stayed on same panorama
  
  function moveToPoint(index) {
    if (index < 0 || index >= routePoints.length) return;

    currentPointIndex = index;
    const point = routePoints[index];
    
    debugLog(`moveToPoint(${index}/${routePoints.length})`);
    debugLog(`  GPX: ${isGPXRoute}, Pos: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`);

    // Keep heading on the immediate next segment so the camera does not pre-turn before corners.
    let heading = 0;
    const targetIndex = Math.min(index + 1, routePoints.length - 1);
    
    debugLog(`  Target index: ${targetIndex} (next segment)`);
    
    if (targetIndex > index) {
      const target = routePoints[targetIndex];
      
      const lat1 = point.lat * Math.PI / 180;
      const lat2 = target.lat * Math.PI / 180;
      const dLng = (target.lng - point.lng) * Math.PI / 180;
      
      const y = Math.sin(dLng) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
      heading = Math.atan2(y, x) * 180 / Math.PI;
      
      // Convert to 0-360 range
      if (heading < 0) {
        heading += 360;
      }
      
      debugLog(`  Calculated heading: ${heading.toFixed(1)}°`);
    } else {
      debugLog(`  At end of route`);
    }

    // Set position and heading
    const targetLatLng = new google.maps.LatLng(point.lat, point.lng);
    
    // Correct heading after Street View snaps to an actual panorama (for both auto + manual moves)
    const shouldWaitForSnap = isPlaying && !waitingForStreetView;
    if (shouldWaitForSnap) {
      waitingForStreetView = true;
      debugLog(`  [AUTO MODE] Waiting for Street View to load...`);
    } else {
      debugLog(`  [MANUAL MODE] Snap correction enabled`);
    }

    const positionChangedListener = streetView.addListener('position_changed', function() {
      google.maps.event.removeListener(positionChangedListener);

      if (shouldWaitForSnap) {
        waitingForStreetView = false;
        debugLog(`  [AUTO MODE] Position changed - ready for next`);
      }

      // Recalculate heading from snapped panorama position to reduce side-facing starts/jumps
      const snappedPos = streetView.getPosition();
      if (targetIndex > index && snappedPos) {
        heading = calculateHeading(
          { lat: snappedPos.lat(), lng: snappedPos.lng() },
          routePoints[targetIndex]
        );
        debugLog(`  [SNAP] Adjusted heading to ${heading.toFixed(1)}°`);
      }

      streetView.setPov({
        heading: heading,
        pitch: 0,
        zoom: 1
      });
    });

    // Timeout fallback in case position_changed doesn't fire
    setTimeout(() => {
      google.maps.event.removeListener(positionChangedListener);
      if (shouldWaitForSnap && waitingForStreetView) {
        waitingForStreetView = false;
        debugLog(`  [AUTO MODE] TIMEOUT - forcing continue (Street View may be stuck)`);
      }
    }, 800);
    
    streetView.setPosition(targetLatLng);
    streetView.setPov({
      heading: heading,
      pitch: 0,
      zoom: 1
    });
    
    // Check if we're stuck on the same panorama
    setTimeout(() => {
      const currentPano = streetView.getPano();
      const actualPos = streetView.getPosition();
      const actualPov = streetView.getPov();
      
      debugLog(`  Pano ID: ${currentPano}`);
      debugLog(`  Actual pos: ${actualPos.lat().toFixed(5)}, ${actualPos.lng().toFixed(5)}`);
      debugLog(`  Actual heading: ${actualPov.heading.toFixed(1)}°`);
      
      if (currentPano === lastPanoId && isPlaying) {
        samePanoCount++;
        debugLog(`  ⚠️ STUCK on same panorama (${samePanoCount}x)`);
        
        // If stuck on same panorama 3+ times, jump ahead 10 points
        if (samePanoCount >= 3) {
          samePanoCount = 0;
          currentPointIndex += 10;
          debugLog(`  ⏭️ JUMPING ahead 10 points to ${currentPointIndex}`);
          if (currentPointIndex < routePoints.length) {
            moveToPoint(currentPointIndex);
          }
          return; // Don't continue normal flow
        }
      } else if (currentPano !== lastPanoId) {
        samePanoCount = 0;
        lastPanoId = currentPano;
        debugLog(`  ✓ Moved to new panorama`);
      }
    }, 200);
    
    debugLog(`  Street View updated`);

    // Update marker
    updateMarker(point);
    
    // Update heading indicator
    if (isGPXRoute) {
      const indicator = document.getElementById('heading-indicator');
      const arrow = document.getElementById('compass-arrow');
      const value = document.getElementById('heading-value');
      
      if (indicator && arrow && value) {
        indicator.style.display = 'block';
        arrow.style.transform = `rotate(${heading}deg)`;
        value.textContent = `${Math.round(heading)}°`;
      }
    }
    
    updateProgress();
  }

  function calculateHeading(from, to) {
    const dLng = (to.lng - from.lng) * Math.PI / 180;
    const lat1 = from.lat * Math.PI / 180;
    const lat2 = to.lat * Math.PI / 180;
    
    const x = Math.sin(dLng) * Math.cos(lat2);
    const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    
    return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
  }

  function updateMarker(point) {
    if (currentMarker) {
      currentMarker.setPosition(point);
    } else {
      currentMarker = new google.maps.Marker({
        position: point,
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#4285f4',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });
    }
  }

  // ==================== Playback Controls ====================
  function play() {
    if (routePoints.length === 0) {
      showStatus('No route loaded', 'error');
      return;
    }

    if (currentPointIndex >= routePoints.length - 1) {
      currentPointIndex = 0;
    }

    isPlaying = true;
    updateProgress();
    scheduleNextMove();
  }

  function pause() {
    isPlaying = false;
    waitingForStreetView = false; // Reset flag
    if (playbackInterval) {
      clearTimeout(playbackInterval);
      playbackInterval = null;
    }
    if (pendingSliderJumpTimeout) {
      clearTimeout(pendingSliderJumpTimeout);
      pendingSliderJumpTimeout = null;
      pendingSliderJumpIndex = null;
    }
    updateProgress();
    debugLog('PAUSED');
  }

  function stop() {
    pause();
    currentPointIndex = 0;
    if (routePoints.length > 0) {
      moveToPoint(0);
    }
    updateProgress();
    debugLog('STOPPED');
  }

  function scheduleNextMove() {
    debugLog(`scheduleNextMove: isPlaying=${isPlaying}, waiting=${waitingForStreetView}`);

    if (!isPlaying) {
      debugLog(`  Not playing - stopping`);
      return;
    }

    // Ensure only one playback timer exists at a time.
    if (playbackInterval) {
      clearTimeout(playbackInterval);
      playbackInterval = null;
    }

    if (waitingForStreetView) {
      debugLog(`  Waiting for Street View, will retry in 100ms`);
      playbackInterval = setTimeout(() => {
        playbackInterval = null;
        if (!isPlaying) return;
        scheduleNextMove();
      }, 100);
      return;
    }

    const speed = parseInt(document.getElementById('speed-slider').value, 10);
    const interval = speedSettings[speed].interval;

    debugLog(`  Scheduling next move in ${interval}ms`);

    playbackInterval = setTimeout(() => {
      playbackInterval = null;
      if (!isPlaying) return;

      currentPointIndex += 1;

      if (currentPointIndex >= routePoints.length) {
        isPlaying = false;
        currentPointIndex = routePoints.length - 1;
        showStatus('Route complete!', 'success');
        debugLog('AUTO: Route complete');
        updateProgress();
        return;
      }

      debugLog(`AUTO: Step to ${currentPointIndex}`);
      moveToPoint(currentPointIndex);
      scheduleNextMove();
    }, interval);
  }

  function updateSpeed() {
    const speed = parseInt(document.getElementById('speed-slider').value);
    document.getElementById('speed-value').textContent = speedSettings[speed].label;

    // If playing, restart with new speed
    if (isPlaying) {
      if (playbackInterval) clearTimeout(playbackInterval);
      scheduleNextMove();
    }
  }

  // ==================== UI Updates ====================
  function updateProgress() {
    const total = routePoints.length;
    const current = currentPointIndex + 1;
    const percent = total > 0 ? (current / total) * 100 : 0;

    // Update progress fill - with null check
    const progressFill = document.getElementById('progress-fill');
    if (progressFill) {
      progressFill.style.width = percent + '%';
    }
    
    // Update position slider
    const positionSlider = document.getElementById('position-slider');
    if (positionSlider) {
      positionSlider.value = percent;
    }
    
    let statusText = '';
    if (total === 0) {
      statusText = 'No route loaded';
    } else if (isPlaying) {
      statusText = `Driving... ${current} / ${total} points`;
    } else if (current >= total) {
      statusText = 'Route complete!';
    } else {
      statusText = `Paused at ${current} / ${total} points`;
    }
    
    const progressText = document.getElementById('progress-text');
    if (progressText) {
      progressText.textContent = statusText;
    }
  }

  function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = type;
    
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        if (status.textContent === message) {
          status.textContent = '';
          status.className = '';
        }
      }, 5000);
    }
  }
  function togglePanel() {
    const panel = document.getElementById('control-panel');
    const restoreBtn = document.getElementById('restore-panel-btn');
    const isHidden = panel.classList.toggle('hidden');
    restoreBtn.style.display = isHidden ? 'block' : 'none';
  }

  // ==================== Keyboard Controls ====================
  document.addEventListener('keydown', (e) => {
    // Don't capture if typing in input
    if (e.target.tagName === 'INPUT') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        debugLog('SPACEBAR: ' + (isPlaying ? 'PAUSE' : 'PLAY'));
        isPlaying ? pause() : play();
        break;
      case 'ArrowRight':
        if (!isPlaying && currentPointIndex < routePoints.length - 1) {
          debugLog('ARROW RIGHT: Manual step forward');
          moveToPoint(currentPointIndex + 1);
        }
        break;
      case 'ArrowLeft':
        if (!isPlaying && currentPointIndex > 0) {
          debugLog('ARROW LEFT: Manual step backward');
          moveToPoint(currentPointIndex - 1);
        }
        break;
      case 'Escape':
        debugLog('ESCAPE: Stop');
        stop();
        break;
    }
  });

  // Initialize on load
  init();
})();
