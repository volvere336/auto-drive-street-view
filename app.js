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

  // Speed settings (milliseconds between moves)
  const speedSettings = {
    1: { label: 'Very Slow', interval: 3000 },
    2: { label: 'Slow', interval: 2000 },
    3: { label: 'Medium', interval: 1200 },
    4: { label: 'Fast', interval: 700 },
    5: { label: 'Very Fast', interval: 350 }
  };

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
    
    // Position slider - drag to jump to any point on route
    document.getElementById('position-slider').addEventListener('input', (e) => {
      if (routePoints.length === 0) return;
      
      const percent = parseInt(e.target.value);
      const index = Math.floor((percent / 100) * (routePoints.length - 1));
      
      if (isPlaying) {
        pause();
      }
      
      currentPointIndex = index;
      moveToPoint(index);
    });
    
    // Add stop button
    document.getElementById('add-stop-btn').addEventListener('click', addWaypointInput);
  }
  
  // ==================== Route Options ====================
  function handleRouteOptionChange() {
    // Auto-recalculate route when options change (if we have origin and destination)
    const origin = document.getElementById('origin-input').value.trim();
    const destination = document.getElementById('destination-input').value.trim();
    if (origin && destination) {
      getRoute();
    }
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
    const origin = document.getElementById('origin-input').value.trim();
    const destination = document.getElementById('destination-input').value.trim();
    if (origin && destination) {
      getRoute();
    }
  }
  
  function removeWaypoint(id) {
    const div = document.getElementById(`waypoint-${id}`);
    if (div) {
      div.remove();
    }
    waypoints = waypoints.filter(w => w.id !== id);
    
    // Recalculate route
    const origin = document.getElementById('origin-input').value.trim();
    const destination = document.getElementById('destination-input').value.trim();
    if (origin && destination) {
      getRoute();
    }
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
          // Auto-calculate route if we have both
          if (document.getElementById('origin-input').value) {
            getRoute();
          }
        } else {
          // Default: if origin is empty, set origin; otherwise set destination
          if (!document.getElementById('origin-input').value) {
            document.getElementById('origin-input').value = address;
            updateOriginMarker(latLng);
            showStatus('Origin set! Click map again for destination.', 'success');
          } else {
            document.getElementById('destination-input').value = address;
            updateDestinationMarker(latLng);
            getRoute();
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
            if (document.getElementById('destination-input').value) {
              getRoute();
            }
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
            if (document.getElementById('origin-input').value) {
              getRoute();
            }
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

  // ==================== Route Planning ====================
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
    const routeOptions = document.getElementById('route-options');
    const avoidTollsRow = document.getElementById('avoid-tolls').closest('.option-row');
    const avoidHighwaysRow = document.getElementById('avoid-highways').closest('.option-row');
    
    if (mode === 'DRIVING') {
      // Show all options for driving
      avoidTollsRow.style.display = 'block';
      avoidHighwaysRow.style.display = 'block';
    } else {
      // Hide tolls and highways for walking/biking (not applicable)
      avoidTollsRow.style.display = 'none';
      avoidHighwaysRow.style.display = 'none';
    }
    
    // Auto-recalculate if we already have origin and destination
    const origin = document.getElementById('origin-input').value.trim();
    const destination = document.getElementById('destination-input').value.trim();
    if (origin && destination) {
      getRoute();
    }
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
  function moveToPoint(index) {
    if (index < 0 || index >= routePoints.length) return;

    currentPointIndex = index;
    const point = routePoints[index];

    // Calculate heading to next point
    let heading = 0;
    if (index < routePoints.length - 1) {
      const next = routePoints[index + 1];
      heading = google.maps.geometry?.spherical?.computeHeading(
        new google.maps.LatLng(point.lat, point.lng),
        new google.maps.LatLng(next.lat, next.lng)
      ) || calculateHeading(point, next);
    } else if (index > 0) {
      // At end, maintain previous heading
      const prev = routePoints[index - 1];
      heading = calculateHeading(prev, point);
    }

    // Update Street View
    streetView.setPosition(new google.maps.LatLng(point.lat, point.lng));
    streetView.setPov({
      heading: heading,
      pitch: 0
    });

    // Update marker on mini map
    updateMarker(point);
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
    if (playbackInterval) {
      clearTimeout(playbackInterval);
      playbackInterval = null;
    }
    updateProgress();
  }

  function stop() {
    pause();
    currentPointIndex = 0;
    if (routePoints.length > 0) {
      moveToPoint(0);
    }
    updateProgress();
  }

  function scheduleNextMove() {
    if (!isPlaying) return;

    const speed = parseInt(document.getElementById('speed-slider').value);
    const interval = speedSettings[speed].interval;

    playbackInterval = setTimeout(() => {
      if (!isPlaying) return;

      currentPointIndex++;
      
      if (currentPointIndex >= routePoints.length) {
        // Route complete
        isPlaying = false;
        currentPointIndex = routePoints.length - 1;
        showStatus('Route complete!', 'success');
        updateProgress();
        return;
      }

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
    const btn = document.getElementById('collapse-btn');
    panel.classList.toggle('collapsed');
    btn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
  }

  // ==================== Keyboard Controls ====================
  document.addEventListener('keydown', (e) => {
    // Don't capture if typing in input
    if (e.target.tagName === 'INPUT') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        isPlaying ? pause() : play();
        break;
      case 'ArrowRight':
        if (!isPlaying && currentPointIndex < routePoints.length - 1) {
          moveToPoint(currentPointIndex + 1);
        }
        break;
      case 'ArrowLeft':
        if (!isPlaying && currentPointIndex > 0) {
          moveToPoint(currentPointIndex - 1);
        }
        break;
      case 'Escape':
        stop();
        break;
    }
  });

  // Initialize on load
  init();
})();
