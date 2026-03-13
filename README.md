Street View Route Driver

A web-based tool that lets you drive through routes in Google Street View, plan trips with multiple stops, and control playback speed.

This project uses the Google Maps JavaScript API, Directions API, and Places API.

Features

Enter origin, destination, and optional waypoints (stops).

Choose travel mode: Driving 🚗, Walking 🚶, Cycling 🚴.

Automatically fetch and display routes on a mini map.

Playback route in Street View with adjustable speed.

Jump to any point on the route with a slider or by clicking on the map.

Keyboard controls: Play/Pause (Space), Next/Previous point (Arrow Keys), Stop (Escape).

Setup Instructions
1. Get a Google Maps API Key

You need a Google Cloud API key with the following APIs enabled:

Maps JavaScript API

Directions API

Places API

Steps:

Go to Google Cloud Console
.

Create a new project (or select an existing one).

Navigate to APIs & Services → Credentials → Create Credentials → API Key.

Copy the generated API key.

Make sure billing is enabled on your project (required for Google Maps APIs).

(Optional) Restrict the key to your domain or localhost for security.

2. Organize Files

Place the following files together in the same folder:

StreetViewRouteDriver/
├── streetview.html       ← Main HTML file
├── app.js           ← JavaScript file (your code)
└── style.css        ← Optional separate CSS (if you move it out of HTML)


index.html: The main interface.

app.js: Contains all the functionality.

style.css: Optional, if you want to separate the CSS from the HTML.

You can keep CSS inside <style> in the HTML, as in your code, or move it to style.css and link it.

3. Open the App

Open streetview.html in a modern browser (Chrome, Firefox, Edge).

Enter your Google Maps API key in the input field.

Click Load Google Maps.

Start adding your Origin, Destination, and optional Waypoints.

Click Get Route to display the path and start Street View playback.

4. Usage Notes

Speed Control: Adjust playback speed with the slider (Very Slow → Very Fast).

Keyboard Shortcuts:

Space → Play / Pause

Arrow Right → Move to next point

Arrow Left → Move to previous point

Escape → Stop playback

Map Clicks:

Click map → set Origin/Destination

Shift+Click → jump to nearest route point

5. Important Notes

API key is stored locally in the browser (localStorage) for convenience. It does not leave your machine.

Each user will need their own API key; your key is not included in the published code.

Make sure your API key has billing enabled; otherwise the app won’t load Google Maps.

The app does not save routes or waypoints permanently. Reloading the page clears the data.

6. Optional Enhancements

Add your own styling in style.css.

Enable domain restrictions on your API key for security.

Add support for route saving in localStorage or via a backend (not included).

7. Support

If Google Maps fails to load:

Check that your API key is correct.

Make sure billing is enabled on your Google Cloud project.

Ensure the required APIs (Maps JavaScript, Directions, Places) are enabled.

Check the browser console for errors.

Enjoy planning your virtual trips in Street View! 🚗🌍
