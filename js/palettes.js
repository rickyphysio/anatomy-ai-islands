// Palettes, Themes, Procedural SVG Illustrations & Web Audio Synthesizer

export const HOST_THEMES = {
  forest: {
    id: 'forest',
    name: '森林 Forest',
    mode: 'light',
    bg: '#eef3e6',
    surface: '#ffffff',
    ink: '#162819',
    muted: '#415945',
    line: '#c2d4ba',
    primary: '#3f7d3a',
    accent: '#e3a33b',
    skyTop: '#7cc0eb',
    skyBottom: '#eef3e6',
    cloudColor: '#ffffff',
    seaColor: '#d9ecde',
    fogColor: '#e4efe0'
  },
  tundra: {
    id: 'tundra',
    name: '苔原 Tundra',
    mode: 'light',
    bg: '#dfe8d3',
    surface: '#f7faf2',
    ink: '#172619',
    muted: '#3d5240',
    line: '#b0c4a5',
    primary: '#3f7d3a',
    accent: '#d98a2b',
    skyTop: '#d99b66',
    skyBottom: '#dfe8d3',
    cloudColor: '#ffe8d1',
    seaColor: '#cadbc4',
    fogColor: '#d8e3cd'
  },
  deep: {
    id: 'deep',
    name: '深林 Deep Woods',
    mode: 'dark',
    bg: '#1b2a20',
    surface: '#24382b',
    ink: '#edf5ee',
    muted: '#b2cbb6',
    line: '#3b5743',
    primary: '#5cb855',
    accent: '#f0b347',
    skyTop: '#0b1622',
    skyBottom: '#1b2a20',
    cloudColor: '#2d4438',
    seaColor: '#15241b',
    fogColor: '#18281e'
  }
};

export const VISITOR_PALETTES = [
  // 12 Light Palettes
  { id: 'L01', name: '01 Emerald Meadow', mode: 'light', bg: '#eef3e6', surface: '#ffffff', ink: '#162819', muted: '#435b46', line: '#c4d6bc', primary: '#3f7d3a', accent: '#e3a33b', skyTop: '#7cc0eb', skyBottom: '#eef3e6' },
  { id: 'L02', name: '02 Alpine Tundra', mode: 'light', bg: '#dfe8d3', surface: '#f8fbf4', ink: '#162618', muted: '#3f5442', line: '#b4c8a9', primary: '#346e30', accent: '#d68928', skyTop: '#8ab8d9', skyBottom: '#dfe8d3' },
  { id: 'L03', name: '03 Cloud Citadel', mode: 'light', bg: '#eaf2f8', surface: '#ffffff', ink: '#142636', muted: '#41586b', line: '#bdd3e4', primary: '#256b9c', accent: '#e09132', skyTop: '#6ab2e8', skyBottom: '#eaf2f8' },
  { id: 'L04', name: '04 Warm Parchment', mode: 'light', bg: '#f6f0e4', surface: '#fffdf9', ink: '#2b2116', muted: '#5e4f3e', line: '#dccdb6', primary: '#8c5327', accent: '#d4882a', skyTop: '#9ec5e3', skyBottom: '#f6f0e4' },
  { id: 'L05', name: '05 Coral Blossom', mode: 'light', bg: '#f9ecec', surface: '#ffffff', ink: '#2e181b', muted: '#634347', line: '#e2c3c6', primary: '#a83c48', accent: '#df9235', skyTop: '#9fc4e8', skyBottom: '#f9ecec' },
  { id: 'L06', name: '06 Mint Breeze', mode: 'light', bg: '#e6f5f0', surface: '#ffffff', ink: '#122922', muted: '#3c5c52', line: '#b6dbd0', primary: '#20785f', accent: '#e09a36', skyTop: '#73c6d9', skyBottom: '#e6f5f0' },
  { id: 'L07', name: '07 Lavender Mist', mode: 'light', bg: '#efeaf6', surface: '#ffffff', ink: '#221930', muted: '#524566', line: '#cec2e0', primary: '#5e438f', accent: '#de9535', skyTop: '#92aee6', skyBottom: '#efeaf6' },
  { id: 'L08', name: '08 Sunlit Amber', mode: 'light', bg: '#f7f1de', surface: '#ffffff', ink: '#292210', muted: '#5c5136', line: '#ddd0ad', primary: '#8a6518', accent: '#d96b27', skyTop: '#8cc4e8', skyBottom: '#f7f1de' },
  { id: 'L09', name: '09 Sage Sanctuary', mode: 'light', bg: '#e8ede4', surface: '#fcfdfb', ink: '#1c261b', muted: '#495747', line: '#c0ccb9', primary: '#496e44', accent: '#cf8b30', skyTop: '#89bad9', skyBottom: '#e8ede4' },
  { id: 'L10', name: '10 Sky Harbor', mode: 'light', bg: '#e4f0f6', surface: '#ffffff', ink: '#132530', muted: '#3f5866', line: '#b5d0de', primary: '#1f6d8c', accent: '#e39630', skyTop: '#64b5e0', skyBottom: '#e4f0f6' },
  { id: 'L11', name: '11 Peach Dawn', mode: 'light', bg: '#f8eee8', surface: '#ffffff', ink: '#2b1c15', muted: '#61493e', line: '#e0c8ba', primary: '#9e4d2d', accent: '#d99329', skyTop: '#f0b189', skyBottom: '#f8eee8' },
  { id: 'L12', name: '12 Botanical Ivory', mode: 'light', bg: '#f2f4ec', surface: '#ffffff', ink: '#1d2618', muted: '#4c5944', line: '#cad1bd', primary: '#467336', accent: '#db9632', skyTop: '#85c0e6', skyBottom: '#f2f4ec' },

  // 12 Dark Palettes
  { id: 'D01', name: '13 Deep Forest Night', mode: 'dark', bg: '#1b2a20', surface: '#24382b', ink: '#edf5ee', muted: '#b2cbb6', line: '#3b5743', primary: '#5cb855', accent: '#f0b347', skyTop: '#0b1622', skyBottom: '#1b2a20' },
  { id: 'D02', name: '14 Starlit Citadel', mode: 'dark', bg: '#131d2b', surface: '#1c2a3d', ink: '#eaf2fc', muted: '#adc2db', line: '#314663', primary: '#55a6e6', accent: '#f2b44b', skyTop: '#080e17', skyBottom: '#131d2b' },
  { id: 'D03', name: '15 Midnight Synapse', mode: 'dark', bg: '#1b162a', surface: '#261f3b', ink: '#f1ecfa', muted: '#bfb3d9', line: '#413561', primary: '#9b78f2', accent: '#f0af46', skyTop: '#0d0917', skyBottom: '#1b162a' },
  { id: 'D04', name: '16 Abyssal Biolume', mode: 'dark', bg: '#102426', surface: '#183336', ink: '#e8f7f7', muted: '#a9cfd1', line: '#2c5459', primary: '#45c4b8', accent: '#f0b249', skyTop: '#071417', skyBottom: '#102426' },
  { id: 'D05', name: '17 Obsidian Ember', mode: 'dark', bg: '#241816', surface: '#33221f', ink: '#faece9', muted: '#d6b6b0', line: '#573b36', primary: '#eb7159', accent: '#f2b84b', skyTop: '#140b0a', skyBottom: '#241816' },
  { id: 'D06', name: '18 Pine Shadow', mode: 'dark', bg: '#15221b', surface: '#1f3027', ink: '#ebf5ef', muted: '#aec9b8', line: '#345242', primary: '#56b87b', accent: '#edb045', skyTop: '#09120e', skyBottom: '#15221b' },
  { id: 'D07', name: '19 Slate Observatory', mode: 'dark', bg: '#1c2128', surface: '#262d36', ink: '#eef2f6', muted: '#b5c0cc', line: '#3d4856', primary: '#66a8e0', accent: '#edb047', skyTop: '#0e1116', skyBottom: '#1c2128' },
  { id: 'D08', name: '20 Velvet Dusk', mode: 'dark', bg: '#261824', surface: '#362233', ink: '#f8ebf6', muted: '#d4b4cf', line: '#593954', primary: '#de76c7', accent: '#f2b84b', skyTop: '#140b13', skyBottom: '#261824' },
  { id: 'D09', name: '21 Bronze Archive', mode: 'dark', bg: '#241f17', surface: '#332c21', ink: '#f7f1e6', muted: '#d1c3ac', line: '#544937', primary: '#deb057', accent: '#f28d4b', skyTop: '#14100b', skyBottom: '#241f17' },
  { id: 'D10', name: '22 Aurora Borealis', mode: 'dark', bg: '#122421', surface: '#1a332f', ink: '#e8f7f4', muted: '#aad1c9', line: '#2e5750', primary: '#4ad4a8', accent: '#f2b949', skyTop: '#081412', skyBottom: '#122421' },
  { id: 'D11', name: '23 Indigo Astral', mode: 'dark', bg: '#15192e', surface: '#1f2542', ink: '#ecf0fc', muted: '#b4bee0', line: '#36406e', primary: '#758df2', accent: '#f0b347', skyTop: '#090b17', skyBottom: '#15192e' },
  { id: 'D12', name: '24 Canopy Moon', mode: 'dark', bg: '#1d261a', surface: '#283624', ink: '#eef5ec', muted: '#b7ccb1', line: '#40573a', primary: '#7bc456', accent: '#f0b246', skyTop: '#0d130b', skyBottom: '#1d261a' }
];

export function createMascotSVG(size = 64) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="Mascot Wilson">
    <defs>
      <linearGradient id="wilsonBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#3f7d3a"/>
        <stop offset="100%" stop-color="#2a5927"/>
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="56" fill="url(#wilsonBg)" stroke="#e3a33b" stroke-width="4"/>
    <!-- Sneakers -->
    <rect x="38" y="98" width="16" height="9" rx="4" fill="#ffffff" stroke="#d96b27" stroke-width="2"/>
    <rect x="66" y="98" width="16" height="9" rx="4" fill="#ffffff" stroke="#d96b27" stroke-width="2"/>
    <!-- Legs -->
    <rect x="43" y="84" width="9" height="15" rx="3" fill="#293845"/>
    <rect x="68" y="84" width="9" height="15" rx="3" fill="#293845"/>
    <!-- White shirt sleeves -->
    <rect x="26" y="56" width="14" height="22" rx="6" fill="#ffffff"/>
    <rect x="80" y="56" width="14" height="22" rx="6" fill="#ffffff"/>
    <!-- Orange Vest -->
    <rect x="36" y="53" width="48" height="35" rx="8" fill="#f07e26" stroke="#fff" stroke-width="2"/>
    <path d="M52 53 L60 67 L68 53 Z" fill="#ffffff"/>
    <!-- Head -->
    <circle cx="60" cy="36" r="19" fill="#ffdfc4"/>
    <!-- Short dark hair -->
    <path d="M40 34 C40 17, 80 17, 80 34 C76 26, 65 24, 58 25 C50 24, 44 27, 40 34 Z" fill="#2c221e"/>
    <!-- Eyes & cheerful smile -->
    <circle cx="53" cy="36" r="2.5" fill="#1d2b36"/>
    <circle cx="67" cy="36" r="2.5" fill="#1d2b36"/>
    <path d="M53 43 Q60 49 67 43" fill="none" stroke="#b84a39" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

export function createAnatomyDiagramSVG(muscleName, grouping, islandName) {
  const safeMuscle = String(muscleName || '').replace(/[<>&"]/g, '');
  const safeGroup = String(grouping || '').replace(/[<>&"]/g, '');
  return `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" width="400" height="260">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#223829"/>
        <stop offset="100%" stop-color="#3f7d3a"/>
      </linearGradient>
    </defs>
    <rect width="400" height="260" rx="14" fill="url(#g)"/>
    <circle cx="200" cy="105" r="56" fill="rgba(255,255,255,0.08)" stroke="#e3a33b" stroke-width="2" stroke-dasharray="5,4"/>
    <!-- Stylized Anatomical Muscle Fiber & Bone Diagram -->
    <path d="M150 105 C170 72, 230 72, 250 105 C230 138, 170 138, 150 105 Z" fill="#d9534f" stroke="#ffd27d" stroke-width="2.5"/>
    <path d="M162 105 Q200 86 238 105 M162 105 Q200 124 238 105 M155 105 L245 105" fill="none" stroke="#ffb8b5" stroke-width="1.5"/>
    <circle cx="145" cy="105" r="8" fill="#f5efe6"/>
    <circle cx="255" cy="105" r="8" fill="#f5efe6"/>
    <text x="200" y="34" text-anchor="middle" fill="#ffd27d" font-family="sans-serif" font-size="12" font-weight="bold">ILLUSTRATIVE DIAGRAM (示意圖) · ${islandName}</text>
    <text x="200" y="192" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold">${safeMuscle}</text>
    <text x="200" y="216" text-anchor="middle" fill="#cfe3d1" font-family="sans-serif" font-size="12">${safeGroup}</text>
    <text x="200" y="242" text-anchor="middle" fill="#e3a33b" font-family="sans-serif" font-size="11">Origin · Insertion · Action · Innervation Verified from CSV</text>
  </svg>`);
}

class SoundManager {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.timer = null;
    this.noteIdx = 0;
  }

  ensureCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMusic() {
    if (this.playing) {
      this.stopMusic();
      return false;
    } else {
      this.startMusic();
      return true;
    }
  }

  startMusic() {
    this.ensureCtx();
    if (!this.ctx) return;
    this.playing = true;
    const notes = [261.63, 329.63, 392.00, 523.25, 440.00, 392.00, 329.63, 293.66];
    const playStep = () => {
      if (!this.playing || !this.ctx) return;
      const freq = notes[this.noteIdx % notes.length];
      this.noteIdx++;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.045, this.ctx.currentTime + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0008, this.ctx.currentTime + 0.55);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.58);
      } catch (e) {}
    };
    playStep();
    this.timer = setInterval(playStep, 620);
  }

  stopMusic() {
    this.playing = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  playChime(type = 'ok') {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      if (type === 'levelup') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.08);
        osc.frequency.setValueAtTime(659.25, now + 0.16);
      } else if (type === 'wrong') {
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(180, now + 0.1);
      } else {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
      }
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.32);
    } catch (e) {}
  }
}

export const soundManager = new SoundManager();
