# static/shirt-template.png

The placeholder is a 1024×1024 pure-white square. **Replace it before launch** with a real
mockup of a blank white tee photographed (or rendered) flat-lay or on a model body.

The composite pipeline (`src/lib/photon.ts`) overlays the AI-generated design onto the
chest area at ~40% width, ~34% from the top. If your template uses different proportions,
adjust the `targetWidth` / `y` constants in `compositeMockup()`.
