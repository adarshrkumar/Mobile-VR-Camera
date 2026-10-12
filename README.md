# Mobile VR Camera

A small web app that turns your phone into a see-through VR headset. It shows your phone's **rear camera** twice, side by side, one image per eye, the way **Google Cardboard** and **YouTube's VR mode** did. Put the phone in a Cardboard (or any phone VR viewer) and you see the world around you through the camera.

No install, build step or dependencies: it's plain HTML, CSS and JavaScript.

## Features

- **Rear camera, shown twice.** Uses the camera on the back of the phone (the side away from the screen) and renders it once for each eye.
- **Cardboard-style lens distortion.** A WebGL barrel-distortion shader cancels out the pincushion distortion of the viewer's lenses, so straight lines look straight through the headset.
- **Fullscreen and landscape lock** where the browser supports them.
- **Screen stays awake** while you use it (Screen Wake Lock API).
- **Adjustable settings** (tap the screen, then ⚙):
  - Lens distortion on/off
  - Distortion strength
  - Zoom (1×–3×)
  - Lens spacing, to match the distance between your viewer's lenses
  - Center divider line on/off

  Settings are saved on the device.

## Usage

1. Open the app on your phone (it has to be served over **HTTPS**; see below).
2. Tap **Start VR** and allow camera access.
3. Turn the phone to landscape.
4. Put it in your VR viewer.

Tap the screen at any time to show the controls: **⚙** settings, **⛶** fullscreen, **✕** exit.

## Running it

Browsers only allow camera access on secure origins (`https://` or `localhost`), so the app has to be served over HTTPS to work on a phone.

### GitHub Pages (easiest)

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, select your branch and the `/ (root)` folder, then save.
3. Open `https://<your-username>.github.io/<repo-name>/` on your phone.

### Locally

Any static file server works, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000` on the same machine. To test on a phone over your local network you need HTTPS. A tunnel such as `ngrok http 8000` or `cloudflared tunnel --url http://localhost:8000` gives you an HTTPS link.

## Browser support

| Feature | Android Chrome | iPhone Safari |
| --- | --- | --- |
| Rear camera + stereo view | ✅ | ✅ |
| Fullscreen | ✅ | ❌ (use *Add to Home Screen* for a full-screen app) |
| Landscape lock | ✅ (in fullscreen) | ❌ (rotate the phone yourself) |
| Keep screen awake | ✅ | ✅ (iOS 16.4+) |

## Notes

- Both eyes see the same camera image, because phones have one rear camera facing forward. The view isn't true 3D, but it looks right in a headset, just like Cardboard's camera passthrough.
- If the image looks doubled or hard to focus, adjust **Lens spacing** until the two images line up for your viewer.

## Files

- `index.html`: page structure, start screen and settings panel
- `style.css`: layout and styling
- `script.js`: camera access, WebGL stereo renderer with lens distortion, and the controls
