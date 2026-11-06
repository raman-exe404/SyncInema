// Generates SyncCinema PWA icons from an SVG (clapperboard + sync arcs motif).
const sharp = require("/home/z/my-project/node_modules/sharp");

const svg = (maskable) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${maskable ? "#0d0d16" : "#12121d"}"/>
      <stop offset="1" stop-color="#07070b"/>
    </linearGradient>
    <linearGradient id="v" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a78bfa"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="url(#bg)"/>
  <g transform="translate(256 246)">
    <!-- clapperboard -->
    <rect x="-110" y="-20" width="220" height="140" rx="26" fill="url(#v)"/>
    <rect x="-110" y="-64" width="220" height="52" rx="18" fill="url(#v)"/>
    <g transform="skewX(-18)" fill="#07070b" opacity="0.85">
      <rect x="-88" y="-64" width="30" height="52" rx="6"/>
      <rect x="-30" y="-64" width="30" height="52" rx="6"/>
      <rect x="28" y="-64" width="30" height="52" rx="6"/>
      <rect x="86" y="-64" width="30" height="52" rx="6"/>
    </g>
    <circle cx="0" cy="50" r="30" fill="#07070b" opacity="0.9"/>
    <path d="M -8 32 L 22 50 L -8 68 Z" fill="#e9d5ff"/>
  </g>
  <!-- sync arcs -->
  <g fill="none" stroke="#38bdf8" stroke-width="17" stroke-linecap="round" opacity="0.95">
    <path d="M 96 380 A 176 176 0 0 0 416 380" transform="rotate(0 256 256)"/>
  </g>
</svg>`;

(async () => {
  const out = "/home/z/my-project/public/icons/";
  await sharp(Buffer.from(svg(false))).resize(192, 192).png().toFile(out + "icon-192.png");
  await sharp(Buffer.from(svg(false))).resize(512, 512).png().toFile(out + "icon-512.png");
  await sharp(Buffer.from(svg(true))).resize(512, 512).png().toFile(out + "icon-maskable-512.png");
  // favicon
  await sharp(Buffer.from(svg(false))).resize(64, 64).png().toFile("/home/z/my-project/src/app/favicon.png");
  console.log("icons generated");
})();
