# Mobile VR Camera

A small web app that turns your phone into a see-through VR headset. It shows your phone's **rear camera** twice, side by side, one image per eye, the way **Google Cardboard** and **YouTube's VR mode** did. Put the phone in a Cardboard (or any phone VR viewer) and you see the world around you through the camera.

No install, build step or dependencies: it's plain HTML, CSS and JavaScript.

## Features

- **Rear camera, shown twice.** Uses the camera on the back of the phone (the side away from the screen) and renders it once for each eye.
- **Cardboard-style lens distortion.** A WebGL barrel-distortion shader cancels out the pincushion distortion of the viewer's lenses, so straight lines look straight through the headset.
- **Fullscreen and landscape lock** where the browser supports them.
- **Screen stays awake** while you use it (Screen Wake Lock API).
- **Adjustable settings:**
  - Lens distortion on/off
  - Distortion strength
  - Zoom (1×–3×)
  - Lens spacing, to match the distance between your viewer's lenses
  - Center divider line on/off

  Settings are saved on the device.

Camera access requires the page to be served over HTTPS (or `localhost`).

## Browser support

| Feature | Android Chrome | iPhone Safari |
| --- | --- | --- |
| Rear camera + stereo view | ✅ | ✅ |
| Fullscreen | ✅ | ❌ |
| Landscape lock | ✅ (in fullscreen) | ❌ |
| Keep screen awake | ✅ | ✅ (iOS 16.4+) |

## Notes

- Both eyes see the same camera image, because phones have one rear camera facing forward. The view isn't true 3D, but it looks right in a headset, just like Cardboard's camera passthrough.

## Files

- `index.html`: page structure, start screen and settings panel
- `style.css`: layout and styling
- `script.js`: camera access, WebGL stereo renderer with lens distortion, and the controls
