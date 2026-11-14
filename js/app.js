import { HOST_THEMES, VISITOR_PALETTES, createMascotSVG, createAnatomyDiagramSVG, soundManager } from './palettes.js';
import { ArchipelagoWorld } from './world3d.js';

const STORAGE_KEYS = {
  PROFILES: 'anatomy_island_rpg_profiles_v1',
  ACTIVE_CODE: 'anatomy_island_active_code_v1',
  BROWSE_ONLY: 'anatomy_island_browse_only_v1',
  THEME_CHOICE: 'anatomy_island_theme_choice_v1',
  PALETTE_ID: 'anatomy_island_palette_id_v1',
  TIME_MODE: 'anatomy_island_time_mode_v1',
  BACKPACK: 'anatomy_island_backpack_v1',
  DAILY_KEYS: 'anatomy_island_daily_keys_v1',
  REDUCED_MOTION: 'anatomy_island_reduced_motion_v1',
  LOW_QUALITY: 'anatomy_island_low_quality_v1',
  INTRO_SEEN: 'anatomy_island_intro_seen_v1'
};

class AnatomyIslandApp {
  constructor() {
    this.content = null;
    this.world = null;

    this.profiles = {};
    this.activeCode = '';
    this.browseOnly = false;

    this.themeChoice = 'auto'; // 'auto' | 'forest' | 'tundra' | 'deep'
    this.activePaletteId = '';
    this.timeSetting = 'day'; // 'day' | 'dusk' | 'night' | 'auto' | 'realtime'
    this.effectivePhase = 'day'; // 'day' | 'dusk' | 'night'
    this.virtualMinutes = 9 * 60 + 30; // 09:30

    this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lowQuality = window.innerWidth <= 768;

    this.backpack = { shell: 3, berry: 0, herb: 0, scroll: 0, osteon: 0, crystal: 0, postcard: 0 };
    this.dailyKeyState = { day: '', left: 3 };

    this.currentIslandId = null;
    this.currentGroupFilter = 'ALL';
    this.activeEntity = null;
    this.entityLineIdx = 0;

    this.quizSession = null;
    this.tourState = { active: false, paused: false, index: 0, timer: 0, duration: 5.0 };
  }

  async start() {
    const res = await fetch('./data/content.json');
    this.content = await res.json();

    this.loadLocalStorage();
    this.renderStaticUI();
    this.initWorld();
    this.initGuestbook();
    this.applyThemeAndTime(true);
    this.updateHUD();
    this.renderLocationList();

    // Clock & Auto-Cycle / Guided Tour interval
    setInterval(() => this.tickTimer(0.25), 250);

    // Check first-visit Adventurer Modal & Cinema Intro
    if (!this.activeCode && !this.browseOnly) {
      this.openAdventurerModal();
    } else if (this.activeCode && this.profiles[this.activeCode]) {
      this.world.setAdventurer(this.profiles[this.activeCode]);
    }

    const introSeen = localStorage.getItem(STORAGE_KEYS.INTRO_SEEN);
    if (!introSeen && !this.reducedMotion) {
      localStorage.setItem(STORAGE_KEYS.INTRO_SEEN, '1');
      this.world.playEpicCinemaIntro();
    }
  }

  loadLocalStorage() {
    try {
      const pRaw = localStorage.getItem(STORAGE_KEYS.PROFILES);
      if (pRaw) this.profiles = JSON.parse(pRaw) || {};
      this.activeCode = localStorage.getItem(STORAGE_KEYS.ACTIVE_CODE) || '';
      this.browseOnly = localStorage.getItem(STORAGE_KEYS.BROWSE_ONLY) === '1';

      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME_CHOICE);
      if (savedTheme) this.themeChoice = savedTheme;

      const savedPalette = localStorage.getItem(STORAGE_KEYS.PALETTE_ID);
      if (savedPalette) this.activePaletteId = savedPalette;

      const savedTime = localStorage.getItem(STORAGE_KEYS.TIME_MODE);
      if (savedTime) this.timeSetting = savedTime;

      const bpRaw = localStorage.getItem(STORAGE_KEYS.BACKPACK);
      if (bpRaw) {
        this.backpack = { ...this.backpack, ...JSON.parse(bpRaw) };
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const dkRaw = localStorage.getItem(STORAGE_KEYS.DAILY_KEYS);
      if (dkRaw) {
        const parsed = JSON.parse(dkRaw);
        if (parsed && parsed.day === todayStr) {
          this.dailyKeyState = parsed;
        } else {
          this.dailyKeyState = { day: todayStr, left: 3 };
        }
      } else {
        this.dailyKeyState = { day: todayStr, left: 3 };
      }

      const rmRaw = localStorage.getItem(STORAGE_KEYS.REDUCED_MOTION);
      if (rmRaw !== null) this.reducedMotion = rmRaw === '1';

      const lqRaw = localStorage.getItem(STORAGE_KEYS.LOW_QUALITY);
      if (lqRaw !== null) this.lowQuality = lqRaw === '1';
    } catch (e) {
      console.warn('Storage load fallback:', e);
    }
  }

  saveProfiles() {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(this.profiles));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CODE, this.activeCode);
      localStorage.setItem(STORAGE_KEYS.BROWSE_ONLY, this.browseOnly ? '1' : '0');
    } catch (e) {}
  }

  saveBackpack() {
    try {
      localStorage.setItem(STORAGE_KEYS.BACKPACK, JSON.stringify(this.backpack));
    } catch (e) {}
  }

  saveDailyKeys() {
    try {
      localStorage.setItem(STORAGE_KEYS.DAILY_KEYS, JSON.stringify(this.dailyKeyState));
    } catch (e) {}
  }

  getOrCreateProfile(codename, style = 0) {
    const clean = String(codename || '').trim().slice(0, 12);
    if (!this.profiles[clean]) {
      this.profiles[clean] = {
        code: clean,
        style: Number(style) || 0,
        currentIsland: 'center',
        visitedIslands: [],
        correctQuestions: [],
        repeatCorrectCount: 0,
        bestScores: {},
        stamps: [],
        completedTrades: [],
        finalCleared: false
      };
    } else if (style !== undefined) {
      this.profiles[clean].style = Number(style) || 0;
    }
    return this.profiles[clean];
  }

  getActiveProfile() {
    if (!this.activeCode) return null;
    return this.profiles[this.activeCode] || null;
  }

  // Strictly derive EXP & Level from recorded actions (Requirement: EXP 與等級一律由「作答紀錄」推算，不另外存一個可以亂改的總分)
  computeExpAndLevel(profile) {
    if (!profile) return { exp: 0, level: 1, nextLevelExp: 30, progressPct: 0 };
    const rules = this.content.rpgRules;
    const visitExp = (profile.visitedIslands ? profile.visitedIslands.length : 0) * rules.firstVisit;
    const firstCorrExp = (profile.correctQuestions ? profile.correctQuestions.length : 0) * rules.firstCorrect;
    const repeatCorrExp = (Number(profile.repeatCorrectCount) || 0) * rules.repeatCorrect;
    const clearExp = (profile.stamps ? profile.stamps.length : 0) * rules.firstClear;
    const tradeExp = (profile.completedTrades ? profile.completedTrades.length : 0) * (rules.firstTrade || 2);
    const exp = visitExp + firstCorrExp + repeatCorrExp + clearExp + tradeExp;

    const thresholds = rules.levels || [0, 30, 80, 150, 250];
    let level = 1;
    for (let i = 0; i < thresholds.length; i++) {
      if (exp >= thresholds[i]) level = i + 1;
    }
    if (exp >= 250) {
      level = 5 + Math.floor((exp - 250) / 120);
    }

    const curFloor = level <= thresholds.length ? thresholds[level - 1] : 250 + (level - 5) * 120;
    const nextCeil = level < thresholds.length ? thresholds[level] : curFloor + 120;
    const progressPct = Math.min(100, Math.round(((exp - curFloor) / Math.max(1, nextCeil - curFloor)) * 100));

    return { exp, level, nextLevelExp: nextCeil, progressPct };
  }

  initWorld() {
    const container = document.getElementById('canvas-container');
    const labelsLayer = document.getElementById('island-labels');
    const meteorCanvas = document.getElementById('meteor-canvas');

    this.world = new ArchipelagoWorld({
      container,
      labelsLayer,
      meteorCanvas,
      content: this.content,
      onSelectIsland: (islandId, source) => this.handleSelectIsland(islandId, source),
      onSelectEntity: (entity) => this.handleSelectEntity(entity),
      onPickupShell: (islandId) => this.handlePickupShell(islandId),
      onOpenGuestbook: () => {
        if (window.IslandGuestbook) window.IslandGuestbook.open();
      },
      onToast: (msg) => this.showToast(msg),
      onTourInteracted: () => {
        if (this.tourState.active && !this.tourState.paused) {
          this.tourState.paused = true;
          this.updateTourUI();
        }
      }
    });

    this.world.setReducedMotion(this.reducedMotion);
    this.world.setLowQuality(this.lowQuality);

    if (!this.world.webglSupported) {
      document.getElementById('webgl-fallback-banner').hidden = false;
      this.openModal('list-modal');
    }
  }

  initGuestbook() {
    if (!window.IslandGuestbook || !this.content.guestbook) return;
    const islandNames = [
      this.content.centerIsland.name,
      ...this.content.islands.map((i) => i.name)
    ];
    window.IslandGuestbook.mount({
      endpoint: this.content.guestbook.gasUrl,
      title: '🏮 Wishing Lantern Guestbook (到此一遊)',
      islands: islandNames,
      button: true,
      onEntries: (list) => {
        if (this.world) this.world.rebuildGuestbookLanterns(list);
      }
    });
  }

  renderStaticUI() {
    // Inject Wilson mascot SVG into header & modals
    document.querySelectorAll('.wilson-avatar-slot').forEach((el) => {
      el.innerHTML = createMascotSVG(46);
    });

    // Populate 24 Visitor Palettes Grid
    const palGrid = document.getElementById('palette-grid');
    if (palGrid) {
      palGrid.textContent = '';
      VISITOR_PALETTES.forEach((pal) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'palette-card';
        btn.dataset.paletteId = pal.id;
        const swatch = document.createElement('span');
        swatch.className = 'palette-swatch';
        swatch.style.background = `linear-gradient(135deg, ${pal.bg} 0%, ${pal.primary} 55%, ${pal.accent} 100%)`;
        const lbl = document.createElement('span');
        lbl.className = 'palette-name';
        lbl.textContent = `${pal.name} (${pal.mode === 'dark' ? 'Dark' : 'Light'})`;
        btn.append(swatch, lbl);
        btn.addEventListener('click', () => {
          this.activePaletteId = pal.id;
          localStorage.setItem(STORAGE_KEYS.PALETTE_ID, pal.id);
          this.applyThemeAndTime(false);
        });
        palGrid.appendChild(btn);
      });
    }

    // Bind Top & Bottom Toolbar Controls
    document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.themeBtn;
        this.themeChoice = t;
        this.activePaletteId = '';
        localStorage.setItem(STORAGE_KEYS.THEME_CHOICE, t);
        localStorage.removeItem(STORAGE_KEYS.PALETTE_ID);
        if (t === 'deep') {
          this.timeSetting = 'night';
          localStorage.setItem(STORAGE_KEYS.TIME_MODE, 'night');
        } else if (t === 'tundra') {
          this.timeSetting = 'dusk';
          localStorage.setItem(STORAGE_KEYS.TIME_MODE, 'dusk');
        } else if (t === 'forest') {
          this.timeSetting = 'day';
          localStorage.setItem(STORAGE_KEYS.TIME_MODE, 'day');
        }
        this.applyThemeAndTime(false);
      });
    });

    document.querySelectorAll('[data-time-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.timeSetting = btn.dataset.timeBtn;
        localStorage.setItem(STORAGE_KEYS.TIME_MODE, this.timeSetting);
        this.applyThemeAndTime(false);
      });
    });

    document.getElementById('btn-reset-palette')?.addEventListener('click', () => {
      this.activePaletteId = '';
      this.themeChoice = 'auto';
      localStorage.removeItem(STORAGE_KEYS.PALETTE_ID);
      localStorage.setItem(STORAGE_KEYS.THEME_CHOICE, 'auto');
      this.applyThemeAndTime(false);
      this.showToast('Restored Island Host Default Theme (已回到島主預設配色)');
    });

    document.getElementById('btn-panorama')?.addEventListener('click', () => {
      this.closeSidePanel();
      this.closeSpeechBubble();
      if (this.tourState.active) this.stopGuidedTour();
      if (this.world.walkMode) this.toggleWalkMode(false);
      this.world.resetToPanorama(false);
    });

    document.getElementById('btn-replay-intro')?.addEventListener('click', () => {
      this.closeSidePanel();
      this.world.playEpicCinemaIntro();
    });

    document.getElementById('btn-open-list')?.addEventListener('click', () => {
      this.renderLocationList();
      this.openModal('list-modal');
    });

    document.getElementById('btn-open-passport')?.addEventListener('click', () => {
      this.renderPassportModal();
      this.openModal('passport-modal');
    });

    document.getElementById('btn-open-backpack')?.addEventListener('click', () => {
      this.renderBackpackModal();
      this.openModal('backpack-modal');
    });

    document.getElementById('btn-open-palettes')?.addEventListener('click', () => {
      this.openModal('palette-modal');
    });

    document.getElementById('btn-open-savecode')?.addEventListener('click', () => {
      this.renderSaveCodeModal();
      this.openModal('savecode-modal');
    });

    document.getElementById('btn-open-adventurer')?.addEventListener('click', () => {
      this.openAdventurerModal();
    });

    document.getElementById('btn-open-help')?.addEventListener('click', () => {
      this.openModal('help-modal');
    });

    document.getElementById('btn-daily-chest')?.addEventListener('click', () => {
      this.openDailyChest();
    });

    document.getElementById('btn-wish-meteor')?.addEventListener('click', () => {
      if (this.effectivePhase !== 'night') {
        this.timeSetting = 'night';
        localStorage.setItem(STORAGE_KEYS.TIME_MODE, 'night');
        this.applyThemeAndTime(false);
      }
      this.world.triggerMeteorShower(12);
      this.showToast('🌠 A meteor shower has arrived! Make a wish! (流星雨來了！許個願吧)');
    });

    document.getElementById('btn-guided-tour')?.addEventListener('click', () => {
      if (this.tourState.active) {
        this.stopGuidedTour();
      } else {
        this.startGuidedTour();
      }
    });

    document.getElementById('btn-walk-mode')?.addEventListener('click', () => {
      this.toggleWalkMode(!this.world.walkMode);
    });

    document.getElementById('btn-exit-walk')?.addEventListener('click', () => {
      this.toggleWalkMode(false);
    });

    document.getElementById('btn-music')?.addEventListener('click', (e) => {
      const on = soundManager.toggleMusic();
      e.currentTarget.classList.toggle('is-active', on);
      e.currentTarget.textContent = on ? '🔊 Music: ON' : '🎵 Music';
    });

    const rmBtn = document.getElementById('btn-reduced-motion');
    if (rmBtn) {
      rmBtn.classList.toggle('is-active', this.reducedMotion);
      rmBtn.addEventListener('click', () => {
        this.reducedMotion = !this.reducedMotion;
        localStorage.setItem(STORAGE_KEYS.REDUCED_MOTION, this.reducedMotion ? '1' : '0');
        rmBtn.classList.toggle('is-active', this.reducedMotion);
        rmBtn.textContent = this.reducedMotion ? '⏸ Motion: Reduced' : '✨ Motion: Full';
        this.world.setReducedMotion(this.reducedMotion);
      });
    }

    const lqBtn = document.getElementById('btn-quality');
    if (lqBtn) {
      lqBtn.classList.toggle('is-active', this.lowQuality);
      lqBtn.textContent = this.lowQuality ? '⚡ Quality: Low' : '💎 Quality: Ultra';
      lqBtn.addEventListener('click', () => {
        this.lowQuality = !this.lowQuality;
        localStorage.setItem(STORAGE_KEYS.LOW_QUALITY, this.lowQuality ? '1' : '0');
        lqBtn.classList.toggle('is-active', this.lowQuality);
        lqBtn.textContent = this.lowQuality ? '⚡ Quality: Low' : '💎 Quality: Ultra';
        this.world.setLowQuality(this.lowQuality);
      });
    }

    // Search input in Top Bar & Location List
    const globalSearch = document.getElementById('global-search-input');
    if (globalSearch) {
      globalSearch.addEventListener('input', () => {
        this.renderLocationList(globalSearch.value);
        if (globalSearch.value.trim().length > 0) {
          this.openModal('list-modal');
        }
      });
    }
    const modalSearch = document.getElementById('modal-search-input');
    if (modalSearch) {
      modalSearch.addEventListener('input', () => {
        this.renderLocationList(modalSearch.value);
      });
    }

    // Close Side Panel & Modals
    document.getElementById('btn-close-panel')?.addEventListener('click', () => {
      this.closeSidePanel();
      this.world.resetToPanorama(false);
    });

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.closeModal(btn.dataset.closeModal);
      });
    });

    // Global Escape Key Handler
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.tourState.active) {
          this.stopGuidedTour();
          return;
        }
        if (this.world && this.world.walkMode) {
          this.toggleWalkMode(false);
          return;
        }
        if (this.activeEntity) {
          this.closeSpeechBubble();
          return;
        }
        const openModals = document.querySelectorAll('.modal-backdrop:not([hidden])');
        if (openModals.length > 0) {
          openModals.forEach((m) => { m.hidden = true; });
          return;
        }
        const panel = document.getElementById('island-panel');
        if (panel && !panel.hidden) {
          this.closeSidePanel();
          this.world.resetToPanorama(false);
        }
      }
    });

    // Adventurer Form Submit & Browse Only
    document.getElementById('adventurer-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('adventurer-code-input');
      const errEl = document.getElementById('adventurer-form-error');
      const code = String(input.value || '').trim();
      if (code.length < 2 || code.length > 12) {
        errEl.textContent = 'Please enter a codename between 2 and 12 characters. (請輸入 2～12 字的冒險者代號)';
        return;
      }
      errEl.textContent = '';
      const styleRadio = document.querySelector('input[name="adv-style"]:checked');
      const style = styleRadio ? Number(styleRadio.value) : 0;
      const prof = this.getOrCreateProfile(code, style);
      this.activeCode = prof.code;
      this.browseOnly = false;
      this.saveProfiles();
      this.world.setAdventurer(prof);
      this.updateHUD();
      this.closeModal('adventurer-modal');
      this.showToast(`Welcome aboard, Adventurer ${prof.code}! Click any island to walk across the bridges!`);
    });

    document.getElementById('btn-browse-only')?.addEventListener('click', () => {
      this.browseOnly = true;
      this.saveProfiles();
      this.closeModal('adventurer-modal');
      this.showToast('Entered Free Browse Mode—you can read all 157 muscles & take quizzes anytime!');
    });

    // Tour Controls
    document.getElementById('tour-prev')?.addEventListener('click', () => this.stepGuidedTour(-1));
    document.getElementById('tour-next')?.addEventListener('click', () => this.stepGuidedTour(1));
    document.getElementById('tour-pause')?.addEventListener('click', () => {
      this.tourState.paused = !this.tourState.paused;
      this.updateTourUI();
    });
    document.getElementById('tour-exit')?.addEventListener('click', () => this.stopGuidedTour());

    // Mobile On-Screen Walk D-Pad
    const bindWalkPad = (id, dirKey) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const start = (e) => { e.preventDefault(); this.world.walkState.moveDir[dirKey] = 1; };
      const end = (e) => { e.preventDefault(); this.world.walkState.moveDir[dirKey] = 0; };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointerleave', end);
      btn.addEventListener('pointercancel', end);
    };
    bindWalkPad('walk-btn-up', 'f');
    bindWalkPad('walk-btn-down', 'b');
    bindWalkPad('walk-btn-left', 'l');
    bindWalkPad('walk-btn-right', 'r');

    // Save Code Copy / Restore / Export / Import / Reset
    document.getElementById('btn-copy-savecode')?.addEventListener('click', () => {
      const out = document.getElementById('savecode-output');
      if (!out || !out.value) return;
      navigator.clipboard?.writeText(out.value);
      this.showToast('Save Code copied to clipboard! (接關碼已複製)');
    });

    document.getElementById('btn-restore-savecode')?.addEventListener('click', () => {
      const inp = document.getElementById('savecode-input');
      const status = document.getElementById('savecode-status');
      this.restoreFromSaveCode(inp ? inp.value : '', status);
    });

    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      const prof = this.getActiveProfile() || this.getOrCreateProfile('Explorer', 0);
      const blob = new Blob([JSON.stringify(prof, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `anatomy-island-save-${prof.code}.json`;
      a.click();
    });

    document.getElementById('input-import-json')?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const status = document.getElementById('savecode-status');
        try {
          const parsed = JSON.parse(String(reader.result));
          if (!parsed || typeof parsed.code !== 'string' || !Array.isArray(parsed.stamps)) {
            throw new Error('Invalid JSON structure');
          }
          this.profiles[parsed.code] = parsed;
          this.activeCode = parsed.code;
          this.saveProfiles();
          this.world.setAdventurer(parsed);
          this.updateHUD();
          this.renderSaveCodeModal();
          if (status) {
            status.textContent = `Successfully imported profile "${parsed.code}"!`;
            status.className = 'status-msg ok';
          }
        } catch (err) {
          if (status) {
            status.textContent = 'Invalid JSON save file format. (JSON 存檔格式錯誤)';
            status.className = 'status-msg bad';
          }
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('btn-reset-progress')?.addEventListener('click', () => {
      if (this.activeCode && this.profiles[this.activeCode]) {
        const st = this.profiles[this.activeCode].style || 0;
        delete this.profiles[this.activeCode];
        const fresh = this.getOrCreateProfile(this.activeCode, st);
        this.saveProfiles();
        this.world.setAdventurer(fresh);
      }
      this.backpack = { shell: 3, berry: 0, herb: 0, scroll: 0, osteon: 0, crystal: 0, postcard: 0 };
      this.saveBackpack();
      this.updateHUD();
      this.showToast('Progress reset to fresh start! (進度已重置)');
    });

    document.getElementById('btn-empty-backpack')?.addEventListener('click', () => {
      this.backpack = { shell: 0, berry: 0, herb: 0, scroll: 0, osteon: 0, crystal: 0, postcard: 0 };
      this.saveBackpack();
      this.renderBackpackModal();
      this.updateHUD();
      this.showToast('Backpack emptied! Pick up shells on island shores to start again.');
    });
  }

  // Theme & Day/Dusk/Night Synchronization
  applyThemeAndTime(initial = false) {
    // 1. Determine effective Day / Dusk / Night phase
    if (this.timeSetting === 'day' || this.timeSetting === 'dusk' || this.timeSetting === 'night') {
      this.effectivePhase = this.timeSetting;
      if (this.timeSetting === 'day') this.virtualMinutes = 10 * 60 + 30;
      if (this.timeSetting === 'dusk') this.virtualMinutes = 17 * 60 + 45;
      if (this.timeSetting === 'night') this.virtualMinutes = 21 * 60 + 15;
    } else if (this.timeSetting === 'realtime') {
      const now = new Date();
      const hr = now.getHours();
      this.virtualMinutes = hr * 60 + now.getMinutes();
      if (hr >= 6 && hr < 16) this.effectivePhase = 'day';
      else if ((hr >= 16 && hr < 19) || (hr >= 5 && hr < 6)) this.effectivePhase = 'dusk';
      else this.effectivePhase = 'night';
    } else {
      // 'auto' flowing cycle
      const hr = Math.floor(this.virtualMinutes / 60) % 24;
      if (hr >= 6 && hr < 16) this.effectivePhase = 'day';
      else if ((hr >= 16 && hr < 19) || (hr >= 5 && hr < 6)) this.effectivePhase = 'dusk';
      else this.effectivePhase = 'night';
    }

    // 2. Determine active Theme (`forest`, `tundra`, `deep`)
    let targetThemeKey = 'forest';
    if (this.themeChoice === 'auto') {
      if (this.effectivePhase === 'day') targetThemeKey = 'forest';
      else if (this.effectivePhase === 'dusk') targetThemeKey = 'tundra';
      else targetThemeKey = 'deep';
    } else {
      targetThemeKey = this.themeChoice;
    }

    const htmlEl = document.documentElement;
    htmlEl.setAttribute('data-theme', targetThemeKey);

    let paletteObj = HOST_THEMES[targetThemeKey] || HOST_THEMES.forest;
    if (this.activePaletteId) {
      const customPal = VISITOR_PALETTES.find((p) => p.id === this.activePaletteId);
      if (customPal) paletteObj = customPal;
    }

    // Apply CSS Custom Properties
    const rootStyle = htmlEl.style;
    rootStyle.setProperty('--bg', paletteObj.bg);
    rootStyle.setProperty('--surface', paletteObj.surface);
    rootStyle.setProperty('--ink', paletteObj.ink);
    rootStyle.setProperty('--muted', paletteObj.muted);
    rootStyle.setProperty('--line', paletteObj.line);
    rootStyle.setProperty('--primary', paletteObj.primary);
    rootStyle.setProperty('--accent', paletteObj.accent);

    if (this.world) {
      this.world.setTimeOfDay(this.effectivePhase, this.activePaletteId ? paletteObj : null);
    }

    // Highlight active buttons
    document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
      btn.classList.toggle('is-active', !this.activePaletteId && btn.dataset.themeBtn === this.themeChoice);
    });
    document.querySelectorAll('[data-time-btn]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.timeBtn === this.timeSetting);
    });
    document.querySelectorAll('.palette-card').forEach((card) => {
      card.classList.toggle('is-active', card.dataset.paletteId === this.activePaletteId);
    });

    this.updateClockDisplay();
  }

  tickTimer(dtSec) {
    if (this.timeSetting === 'auto' && !this.reducedMotion) {
      // 2.5 minutes for a full 24h cycle -> ~9.6 minutes per real second
      this.virtualMinutes = (this.virtualMinutes + dtSec * 9.6) % 1440;
      const prevPhase = this.effectivePhase;
      const hr = Math.floor(this.virtualMinutes / 60) % 24;
      const nextPhase = (hr >= 6 && hr < 16) ? 'day' : ((hr >= 16 && hr < 19) || (hr >= 5 && hr < 6)) ? 'dusk' : 'night';
      if (nextPhase !== prevPhase) {
        this.applyThemeAndTime(false);
      } else {
        this.updateClockDisplay();
      }
    } else if (this.timeSetting === 'realtime') {
      const now = new Date();
      this.virtualMinutes = now.getHours() * 60 + now.getMinutes();
      this.updateClockDisplay();
    }

    // Guided Tour Timer
    if (this.tourState.active && !this.tourState.paused) {
      this.tourState.timer += dtSec;
      const pct = Math.min(100, (this.tourState.timer / this.tourState.duration) * 100);
      const bar = document.getElementById('tour-progress-fill');
      if (bar) bar.style.width = `${pct}%`;
      if (this.tourState.timer >= this.tourState.duration) {
        if (this.tourState.index >= this.getTourStops().length - 1) {
          this.stopGuidedTour();
        } else {
          this.stepGuidedTour(1);
        }
      }
    }

    // Keep speech bubble anchored to 3D entity
    if (this.activeEntity && this.activeEntity.mesh && this.world) {
      const pos = this.world.projectWorldToScreen(this.activeEntity.mesh);
      const bubble = document.getElementById('speech-bubble');
      if (bubble && !bubble.hidden) {
        bubble.style.left = `${Math.round(pos.x)}px`;
        bubble.style.top = `${Math.round(pos.y)}px`;
      }
    }
  }

  updateClockDisplay() {
    const clockEl = document.getElementById('live-clock-display');
    if (!clockEl) return;
    const hr = Math.floor(this.virtualMinutes / 60) % 24;
    const min = Math.floor(this.virtualMinutes % 60);
    const timeStr = `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    const phaseLabel = this.effectivePhase === 'day'
      ? '☀️ Day (白天)'
      : this.effectivePhase === 'dusk'
        ? '🌇 Dusk (黃昏)'
        : '🌙 Night (夜晚)';
    clockEl.textContent = `${phaseLabel} ${timeStr}`;
  }

  // Island Selection -> Walk Adventurer + Fly Camera + Record First Visit (+5 EXP) + Open Side Panel
  handleSelectIsland(islandId, source = '3d') {
    this.closeSpeechBubble();
    this.currentIslandId = islandId;

    // Record First Visit (+5 EXP for regional islands)
    const prof = this.getActiveProfile();
    if (prof && islandId !== 'center') {
      if (!prof.visitedIslands.includes(islandId)) {
        const beforeLvl = this.computeExpAndLevel(prof).level;
        prof.visitedIslands.push(islandId);
        prof.currentIsland = islandId;
        this.saveProfiles();
        const afterLvl = this.computeExpAndLevel(prof).level;
        this.showToast(`First visit to ${this.getIslandById(islandId)?.name}! +${this.content.rpgRules.firstVisit} EXP`);
        if (afterLvl > beforeLvl) this.triggerLevelUpBanner(afterLvl);
      } else {
        prof.currentIsland = islandId;
        this.saveProfiles();
      }
    }
    this.updateHUD();

    const openPanelNow = () => {
      this.renderIslandPanel(islandId);
      const panel = document.getElementById('island-panel');
      if (panel) panel.hidden = false;
    };

    if (this.world && this.world.webglSupported && !this.world.walkMode) {
      this.world.walkAdventurerToIsland(islandId);
      this.world.flyToIsland(islandId, openPanelNow);
    } else {
      openPanelNow();
    }
  }

  getIslandById(islandId) {
    if (islandId === 'center') return this.content.centerIsland;
    return this.content.islands.find((i) => i.id === islandId);
  }

  // Render Side Panel (Desktop Side Panel / Mobile Bottom Drawer)
  renderIslandPanel(islandId) {
    const body = document.getElementById('island-panel-body');
    const titleEl = document.getElementById('island-panel-title');
    const badgeEl = document.getElementById('island-panel-group');
    if (!body) return;
    body.textContent = '';

    const prof = this.getActiveProfile();

    if (islandId === 'center') {
      const ci = this.content.centerIsland;
      titleEl.textContent = ci.name;
      badgeEl.textContent = `${ci.role} · ${ci.subtitle}`;

      const stampsCount = prof ? prof.stamps.length : 0;
      const unlockReq = this.content.rpgRules.centerUnlockStamps || 4;
      const unlocked = stampsCount >= unlockReq;

      const card = document.createElement('div');
      card.className = 'panel-section';
      card.innerHTML = `
        <div class="mentor-banner">
          <div class="wilson-mini">${createMascotSVG(52)}</div>
          <div>
            <strong>${ci.npc.name}</strong> <span class="badge-tag">${ci.npc.title}</span>
            <p class="muted-p">${ci.description}</p>
          </div>
        </div>
        <div class="npc-actions-bar">
          <button type="button" class="btn-secondary" id="panel-btn-story">📖 Listen to Story (聽故事)</button>
          <button type="button" class="btn-secondary" id="panel-btn-hint">💡 Study Hint (給提示)</button>
          <button type="button" class="btn-primary" id="panel-btn-challenge" ${unlocked ? '' : 'disabled'}>
            ⚔️ Final Citadel Challenge (${stampsCount}/${unlockReq} Stamps Required)
          </button>
        </div>
        <div id="panel-npc-dialogue-box" class="npc-dialogue-box">${ci.npc.story.join(' ')}</div>
      `;
      body.appendChild(card);

      card.querySelector('#panel-btn-story')?.addEventListener('click', () => {
        card.querySelector('#panel-npc-dialogue-box').textContent = ci.npc.story.join(' ');
      });
      card.querySelector('#panel-btn-hint')?.addEventListener('click', () => {
        card.querySelector('#panel-npc-dialogue-box').textContent = '💡 Hint: ' + ci.npc.hint;
      });
      card.querySelector('#panel-btn-challenge')?.addEventListener('click', () => {
        this.startQuizBattle('center');
      });

      if (prof && prof.finalCleared) {
        const certTrigger = document.createElement('button');
        certTrigger.type = 'button';
        certTrigger.className = 'btn-accent full-width';
        certTrigger.textContent = '🎓 Open & Download Anatomy Mastery Certificate (領取冒險證書)';
        certTrigger.addEventListener('click', () => this.openCertificateModal());
        body.appendChild(certTrigger);
      }

      // Summary of all 8 regional islands
      const overview = document.createElement('div');
      overview.className = 'panel-section';
      const h3 = document.createElement('h3');
      h3.textContent = 'Archipelago Regions Overview (8 Islands · 157 Muscles)';
      overview.appendChild(h3);

      this.content.islands.forEach((isl) => {
        const cleared = prof && prof.stamps.includes(isl.id);
        const row = document.createElement('div');
        row.className = 'mini-island-row';
        const info = document.createElement('div');
        info.innerHTML = `<strong>#${isl.order} ${isl.name}</strong> <span class="badge-tag">${isl.muscleCount} Muscles</span> ${cleared ? '<span class="stamp-pill">🏅 Stamp Earned</span>' : ''}<br><small>${isl.intro}</small>`;
        const goBtn = document.createElement('button');
        goBtn.type = 'button';
        goBtn.className = 'btn-secondary btn-sm';
        goBtn.textContent = 'Fly Here';
        goBtn.addEventListener('click', () => this.handleSelectIsland(isl.id, 'panel'));
        row.append(info, goBtn);
        overview.appendChild(row);
      });
      body.appendChild(overview);
      return;
    }

    // Regional Island Panel (#1 to #8)
    const isl = this.getIslandById(islandId);
    if (!isl) return;

    titleEl.textContent = `#${isl.order} ${isl.name}`;
    badgeEl.textContent = `${isl.group} · ${isl.muscleCount} Muscles`;

    const isCleared = prof && prof.stamps.includes(isl.id);

    // 1. Intro, Landmark & Gatekeeper NPC Controls
    const topSec = document.createElement('div');
    topSec.className = 'panel-section';
    topSec.innerHTML = `
      <p class="island-intro-lead">${isl.intro} ${isCleared ? '<span class="stamp-pill">🏅 Stamp Collected</span>' : ''}</p>
      <div class="landmark-box">
        <strong>🏛️ Landmark: ${isl.landmark.name}</strong> <span class="badge-illustrative">示意 Illustrative</span>
        <p class="muted-p">${isl.landmark.description}</p>
      </div>
      <div class="npc-card">
        <div class="npc-header">
          <div>
            <strong>🛡️ ${isl.npc.name}</strong> <span class="badge-illustrative">示意</span>
            <div class="muted-sm">Boss: <b>${isl.npc.monsterName}</b> — ${isl.extra}</div>
          </div>
        </div>
        <div class="npc-actions-bar">
          <button type="button" class="btn-secondary" id="panel-btn-story">📖 Listen to Story (聽故事)</button>
          <button type="button" class="btn-secondary" id="panel-btn-hint">💡 Give Hint (給提示)</button>
          <button type="button" class="btn-primary" id="panel-btn-challenge">⚔️ Accept Challenge (接受挑戰)</button>
        </div>
        <div id="panel-npc-dialogue-box" class="npc-dialogue-box">${isl.npc.story.join(' ')}</div>
      </div>
    `;
    body.appendChild(topSec);

    topSec.querySelector('#panel-btn-story')?.addEventListener('click', () => {
      topSec.querySelector('#panel-npc-dialogue-box').textContent = isl.npc.story.join(' ');
    });
    topSec.querySelector('#panel-btn-hint')?.addEventListener('click', () => {
      topSec.querySelector('#panel-npc-dialogue-box').textContent = '💡 Hint: ' + isl.npc.hint;
    });
    topSec.querySelector('#panel-btn-challenge')?.addEventListener('click', () => {
      this.startQuizBattle(isl.id);
    });

    // 2. Key Anatomical Groupings & External Reference Link
    const pointsSec = document.createElement('div');
    pointsSec.className = 'panel-section';
    const ptTitle = document.createElement('h3');
    ptTitle.textContent = 'Key Anatomical Groupings & Objectives';
    pointsSec.appendChild(ptTitle);
    const ul = document.createElement('ul');
    ul.className = 'points-list';
    isl.points.forEach((pt) => {
      const li = document.createElement('li');
      li.textContent = pt;
      ul.appendChild(li);
    });
    pointsSec.appendChild(ul);

    if (isl.link) {
      const linkBtn = document.createElement('a');
      linkBtn.href = isl.link;
      linkBtn.target = '_blank';
      linkBtn.rel = 'noopener noreferrer';
      linkBtn.className = 'btn-secondary external-link-btn';
      linkBtn.textContent = `📂 Open ${isl.name} Reference Database (Google Drive ↗)`;
      pointsSec.appendChild(linkBtn);
    }
    body.appendChild(pointsSec);

    // 3. Complete 3D Muscle Atlas Compendium Cards for this Island
    const compSec = document.createElement('div');
    compSec.className = 'panel-section';
    const groups = ['ALL', ...new Set(isl.muscles.map((m) => m.grouping))];
    this.currentGroupFilter = 'ALL';

    const compHeader = document.createElement('div');
    compHeader.className = 'comp-header';
    compHeader.innerHTML = `<h3>3D Muscle Compendium (${isl.muscles.length} Muscles)</h3>`;
    const filterBar = document.createElement('div');
    filterBar.className = 'group-filter-bar';
    const cardsBox = document.createElement('div');
    cardsBox.className = 'muscle-cards-grid';

    const renderCards = (grpFilter) => {
      cardsBox.textContent = '';
      const list = grpFilter === 'ALL' ? isl.muscles : isl.muscles.filter((m) => m.grouping === grpFilter);
      list.forEach((m) => {
        const mCard = document.createElement('article');
        mCard.className = 'muscle-card';
        const imgSrc = m.image || createAnatomyDiagramSVG(m.name, m.grouping, isl.name);
        const badgeHtml = m.hasOriginalImage
          ? '<span class="img-source-badge">3D Atlas Image</span>'
          : '<span class="img-source-badge is-illustrative">示意圖 Illustrative SVG</span>';

        mCard.innerHTML = `
          <div class="muscle-img-wrap">
            <img src="${imgSrc}" alt="${m.name} 3D Muscle Anatomy" loading="lazy" />
            ${badgeHtml}
          </div>
          <div class="muscle-card-body">
            <div class="muscle-grouping-tag">${m.grouping}</div>
            <h4>${m.name}</h4>
            <dl class="muscle-dl">
              <dt>Origin:</dt><dd>${m.origin}</dd>
              <dt>Insertion:</dt><dd>${m.insertion}</dd>
              <dt>Action:</dt><dd>${m.action}</dd>
              <dt>Innervation:</dt><dd>${m.innervation}</dd>
            </dl>
          </div>
        `;
        cardsBox.appendChild(mCard);
      });
    };

    groups.forEach((g) => {
      const fBtn = document.createElement('button');
      fBtn.type = 'button';
      fBtn.className = 'chip-btn' + (g === 'ALL' ? ' is-active' : '');
      fBtn.textContent = g === 'ALL' ? `All (${isl.muscles.length})` : g;
      fBtn.addEventListener('click', () => {
        filterBar.querySelectorAll('.chip-btn').forEach((b) => b.classList.remove('is-active'));
        fBtn.classList.add('is-active');
        renderCards(g);
      });
      filterBar.appendChild(fBtn);
    });

    compSec.append(compHeader, filterBar, cardsBox);
    renderCards('ALL');
    body.appendChild(compSec);
  }

  closeSidePanel() {
    const panel = document.getElementById('island-panel');
    if (panel) panel.hidden = true;
  }

  // Handle Clicking Resident, Gatekeeper, Animal, Sea-Turtle or Daily Chest in 3D
  handleSelectEntity(entity) {
    if (!entity) {
      this.closeSpeechBubble();
      return;
    }
    if (entity.type === 'chest') {
      this.openDailyChest();
      return;
    }

    this.activeEntity = entity;
    this.entityLineIdx = 0;

    const bubble = document.getElementById('speech-bubble');
    const labelsLayer = document.getElementById('island-labels');
    if (!bubble) return;

    // Fade out other island labels while speech bubble is open (Requirement: 對話泡泡開啟時其他標籤淡出)
    if (labelsLayer) labelsLayer.classList.add('labels-dimmed');

    this.renderSpeechBubbleContent();
    bubble.hidden = false;

    if (entity.mesh && this.world) {
      const pos = this.world.projectWorldToScreen(entity.mesh);
      bubble.style.left = `${Math.round(pos.x)}px`;
      bubble.style.top = `${Math.round(pos.y)}px`;
    }
  }

  renderSpeechBubbleContent() {
    const bubble = document.getElementById('speech-bubble');
    if (!bubble || !this.activeEntity) return;
    bubble.textContent = '';

    const ent = this.activeEntity;
    const head = document.createElement('div');
    head.className = 'sb-head';

    const titleBox = document.createElement('div');
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sb-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close dialogue bubble');
    closeBtn.addEventListener('click', () => this.closeSpeechBubble());

    const textP = document.createElement('p');
    textP.className = 'sb-text';

    const actions = document.createElement('div');
    actions.className = 'sb-actions';

    if (ent.type === 'turtle') {
      titleBox.innerHTML = `<strong>🐢 Sea-Turtle Shuttle Guide</strong><span class="sb-sub">Archipelago Ferry · 海龜接駁嚮導</span>`;
      textP.textContent = `Gliding along the outer cloud-sea ring! Next Stop (下一站): ${ent.nextIslandName} Island.`;
      const goBtn = document.createElement('button');
      goBtn.type = 'button';
      goBtn.className = 'btn-primary btn-sm';
      goBtn.textContent = `Fly to ${ent.nextIslandName}`;
      goBtn.addEventListener('click', () => {
        const target = this.content.islands.find((i) => i.name === ent.nextIslandName);
        if (target) this.handleSelectIsland(target.id, 'turtle');
      });
      actions.appendChild(goBtn);
    } else if (ent.type === 'animal' && ent.animal) {
      const a = ent.animal;
      titleBox.innerHTML = `<strong>${a.icon} ${a.name}</strong><span class="sb-sub">Island Fauna</span>`;
      const lines = a.lines || ['Hello adventurer!'];
      textP.textContent = lines[this.entityLineIdx % lines.length];

      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'btn-secondary btn-sm';
      moreBtn.textContent = '💬 Pet / Talk (再聊聊)';
      moreBtn.addEventListener('click', () => {
        this.entityLineIdx++;
        textP.textContent = lines[this.entityLineIdx % lines.length];
      });
      actions.appendChild(moreBtn);
    } else if (ent.type === 'gatekeeper' && ent.npc) {
      const npc = ent.npc;
      titleBox.innerHTML = `<strong>🛡️ ${npc.name}</strong><span class="sb-sub">${npc.title}</span>`;
      const lines = [...npc.story, '💡 Hint: ' + npc.hint];
      textP.textContent = lines[this.entityLineIdx % lines.length];

      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'btn-secondary btn-sm';
      moreBtn.textContent = '💬 Talk More (再聊聊)';
      moreBtn.addEventListener('click', () => {
        this.entityLineIdx++;
        textP.textContent = lines[this.entityLineIdx % lines.length];
      });

      const chalBtn = document.createElement('button');
      chalBtn.type = 'button';
      chalBtn.className = 'btn-primary btn-sm';
      chalBtn.textContent = '⚔️ Challenge (接受挑戰)';
      chalBtn.addEventListener('click', () => {
        this.closeSpeechBubble();
        this.startQuizBattle(ent.islandId);
      });
      actions.append(moreBtn, chalBtn);
    } else if (ent.resident) {
      const r = ent.resident;
      titleBox.innerHTML = `<strong>${r.name}</strong><span class="sb-sub">${r.role} · ${r.islandName}</span>`;
      const lines = r.lines || [];
      textP.textContent = lines[this.entityLineIdx % lines.length];

      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'btn-secondary btn-sm';
      moreBtn.textContent = '💬 Talk More (再聊聊)';
      moreBtn.addEventListener('click', () => {
        this.entityLineIdx++;
        textP.textContent = lines[this.entityLineIdx % lines.length];
      });
      actions.appendChild(moreBtn);

      if (r.trade) {
        const giveItem = this.content.items.find((i) => i.id === r.trade.give);
        const getItem = this.content.items.find((i) => i.id === r.trade.get);
        const haveCount = this.backpack[r.trade.give] || 0;
        const canTrade = haveCount >= r.trade.giveCount;

        const tradeBtn = document.createElement('button');
        tradeBtn.type = 'button';
        tradeBtn.className = 'btn-accent btn-sm';
        tradeBtn.disabled = !canTrade;
        tradeBtn.textContent = `🔁 Trade ${r.trade.giveCount} ${giveItem.icon} → ${r.trade.getCount} ${getItem.icon}`;
        tradeBtn.addEventListener('click', () => {
          this.executeResidentTrade(r, textP);
        });
        actions.appendChild(tradeBtn);

        if (!canTrade) {
          const hintSmall = document.createElement('small');
          hintSmall.className = 'sb-trade-hint';
          hintSmall.textContent = `Need ${r.trade.giveCount} ${giveItem.icon} ${giveItem.name} (You have ${haveCount}). Pick up 🐚 shells on island shores or trade with earlier island scholars!`;
          head.append(titleBox, closeBtn);
          bubble.append(head, textP, actions, hintSmall);
          return;
        }
      }
    }

    head.append(titleBox, closeBtn);
    bubble.append(head, textP, actions);
  }

  executeResidentTrade(resident, textEl) {
    const tr = resident.trade;
    if (!tr) return;
    const have = this.backpack[tr.give] || 0;
    if (have < tr.giveCount) return;

    this.backpack[tr.give] = have - tr.giveCount;
    this.backpack[tr.get] = (this.backpack[tr.get] || 0) + tr.getCount;
    this.saveBackpack();

    const giveItem = this.content.items.find((i) => i.id === tr.give);
    const getItem = this.content.items.find((i) => i.id === tr.get);

    // Award +2 EXP on first trade with this resident
    let expNote = '';
    const prof = this.getActiveProfile();
    if (prof) {
      if (!prof.completedTrades) prof.completedTrades = [];
      if (!prof.completedTrades.includes(tr.id)) {
        const beforeLvl = this.computeExpAndLevel(prof).level;
        prof.completedTrades.push(tr.id);
        this.saveProfiles();
        const afterLvl = this.computeExpAndLevel(prof).level;
        expNote = ' (+2 EXP!)';
        if (afterLvl > beforeLvl) this.triggerLevelUpBanner(afterLvl);
      }
    }

    soundManager.playChime('ok');
    const bpBtn = document.getElementById('btn-open-backpack');
    if (bpBtn) {
      bpBtn.classList.remove('bounce-anim');
      void bpBtn.offsetWidth;
      bpBtn.classList.add('bounce-anim');
    }

    this.updateHUD();
    this.renderSpeechBubbleContent();
    if (textEl) {
      textEl.textContent = `Thank you! Traded ${tr.giveCount} ${giveItem.icon} for ${tr.getCount} ${getItem.icon} ${getItem.name}!${expNote} (謝謝你的交換！)`;
    }
    this.showToast(`🔁 Trade complete: +${tr.getCount} ${getItem.icon} ${getItem.name}${expNote}`);
  }

  closeSpeechBubble() {
    this.activeEntity = null;
    const bubble = document.getElementById('speech-bubble');
    if (bubble) bubble.hidden = true;
    const labelsLayer = document.getElementById('island-labels');
    if (labelsLayer) labelsLayer.classList.remove('labels-dimmed');
  }

  handlePickupShell(islandId) {
    this.backpack.shell = (this.backpack.shell || 0) + 1;
    this.saveBackpack();
    soundManager.playChime('ok');
    const bpBtn = document.getElementById('btn-open-backpack');
    if (bpBtn) {
      bpBtn.classList.remove('bounce-anim');
      void bpBtn.offsetWidth;
      bpBtn.classList.add('bounce-anim');
    }
    this.updateHUD();
    this.showToast('🐚 Picked up +1 Calcium Shell! (撿到 1 顆鈣質貝殼，20 秒後重生)');
  }

  openDailyChest() {
    if (this.dailyKeyState.left <= 0) {
      this.showToast('🗝️ No Daily Keys left for today! Come back tomorrow. (今日寶箱鑰匙已用完)');
      return;
    }
    this.dailyKeyState.left -= 1;
    this.saveDailyKeys();
    this.backpack.shell = (this.backpack.shell || 0) + 2;
    this.backpack.berry = (this.backpack.berry || 0) + 1;
    this.saveBackpack();
    soundManager.playChime('levelup');
    this.updateHUD();
    this.showToast(`🎁 Opened Daily Chest! Received +2 🐚 Calcium Shells & +1 🍎 ATP Berry (${this.dailyKeyState.left}/3 keys left today)`);
  }

  // Concept Monster 3-Question Battle & Central Island 5-Question Final Boss Battle
  startQuizBattle(islandId) {
    // Ensure a profile exists even if player clicked "Just Browse" earlier so EXP/Stamps track accurately
    let prof = this.getActiveProfile();
    if (!prof) {
      prof = this.getOrCreateProfile('GuestHero', 0);
      this.activeCode = prof.code;
      this.saveProfiles();
      this.world.setAdventurer(prof);
    }

    // Record First Visit if triggered directly from Location List without clicking 3D island first
    if (islandId !== 'center' && !prof.visitedIslands.includes(islandId)) {
      prof.visitedIslands.push(islandId);
      this.saveProfiles();
      this.updateHUD();
    }

    let pool = [];
    let passReq = this.content.rpgRules.passPerIsland || 2;
    let totalCount = this.content.rpgRules.questionsPerBattle || 3;
    let bossTitle = '';

    if (islandId === 'center') {
      const stampsCount = prof.stamps.length;
      const unlockReq = this.content.rpgRules.centerUnlockStamps || 4;
      if (stampsCount < unlockReq) {
        this.showToast(`Collect at least ${unlockReq} Regional Stamps first! (目前 ${stampsCount}/${unlockReq} 枚島章)`);
        return;
      }
      // Draw 5 questions from cleared islands
      const clearedIslands = this.content.islands.filter((i) => prof.stamps.includes(i.id));
      const sourceIslands = clearedIslands.length >= 2 ? clearedIslands : this.content.islands;
      sourceIslands.forEach((isl) => {
        pool.push(...isl.quizzes);
      });
      passReq = this.content.rpgRules.centerPassScore || 4;
      totalCount = this.content.rpgRules.centerQuestions || 5;
      bossTitle = `👑 Final Citadel Challenge — ${this.content.centerIsland.npc.monsterName}`;
    } else {
      const isl = this.getIslandById(islandId);
      if (!isl) return;
      pool = [...isl.quizzes];
      bossTitle = `⚔️ #${isl.order} ${isl.name} — ${isl.npc.monsterName}`;
    }

    // Pick questions & shuffle options (判分用選項 ID，不可用按鈕位置)
    const selected = pool.slice(0, totalCount).map((q) => {
      const shuffledOptions = [...q.options];
      for (let i = shuffledOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
      }
      return { ...q, shuffledOptions };
    });

    this.quizSession = {
      islandId,
      bossTitle,
      questions: selected,
      currentIndex: 0,
      correctCount: 0,
      passReq,
      answeredCurrent: false,
      expGainedThisRun: 0
    };

    this.renderQuizStep();
    this.openModal('quiz-modal');
  }

  renderQuizStep() {
    const s = this.quizSession;
    const box = document.getElementById('quiz-modal-body');
    const titleEl = document.getElementById('quiz-modal-title');
    if (!s || !box) return;

    titleEl.textContent = s.bossTitle;
    box.textContent = '';

    if (s.currentIndex >= s.questions.length) {
      this.renderQuizSummary(box);
      return;
    }

    const q = s.questions[s.currentIndex];
    const hpPct = Math.max(0, Math.round(((s.questions.length - s.correctCount) / s.questions.length) * 100));

    const headerBar = document.createElement('div');
    headerBar.className = 'quiz-status-bar';
    headerBar.innerHTML = `
      <span>Question <b>${s.currentIndex + 1} / ${s.questions.length}</b> (Pass: ${s.passReq}/${s.questions.length})</span>
      <span>Monster Integrity: <b>${hpPct}%</b></span>
    `;
    box.appendChild(headerBar);

    const qCard = document.createElement('div');
    qCard.className = 'quiz-question-card';
    if (q.image) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'quiz-img-wrap';
      const img = document.createElement('img');
      img.src = q.image;
      img.alt = q.muscle;
      imgWrap.appendChild(img);
      const tag = document.createElement('span');
      tag.className = 'quiz-muscle-tag';
      tag.textContent = `Target Muscle: ${q.muscle}`;
      imgWrap.appendChild(tag);
      qCard.appendChild(imgWrap);
    }

    const qText = document.createElement('h4');
    qText.className = 'quiz-question-text';
    qText.textContent = q.question;
    qCard.appendChild(qText);

    const optsBox = document.createElement('div');
    optsBox.className = 'quiz-options-list';

    const feedbackBox = document.createElement('div');
    feedbackBox.className = 'quiz-feedback-box';
    feedbackBox.hidden = true;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn-primary full-width';
    nextBtn.textContent = s.currentIndex < s.questions.length - 1 ? 'Next Question (下一題) →' : 'View Challenge Result (查看結果) →';
    nextBtn.hidden = true;
    nextBtn.addEventListener('click', () => {
      s.currentIndex++;
      s.answeredCurrent = false;
      this.renderQuizStep();
    });

    q.shuffledOptions.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-option-btn';
      btn.dataset.optionId = opt.id;
      btn.textContent = opt.text;

      btn.addEventListener('click', () => {
        if (s.answeredCurrent) return;
        s.answeredCurrent = true;

        const isCorrect = opt.id === q.correctId;
        const prof = this.getActiveProfile();
        const beforeLvl = this.computeExpAndLevel(prof).level;
        let gainedExp = 0;

        // Lock all options & highlight by option ID
        optsBox.querySelectorAll('.quiz-option-btn').forEach((b) => {
          b.disabled = true;
          if (b.dataset.optionId === q.correctId) {
            b.classList.add('is-correct');
          } else if (b === btn && !isCorrect) {
            b.classList.add('is-wrong');
          }
        });

        if (isCorrect) {
          s.correctCount++;
          soundManager.playChime('ok');
          if (prof) {
            if (!prof.correctQuestions.includes(q.id)) {
              prof.correctQuestions.push(q.id);
              gainedExp = this.content.rpgRules.firstCorrect; // +10 EXP first time correct
            } else {
              prof.repeatCorrectCount = (Number(prof.repeatCorrectCount) || 0) + 1;
              gainedExp = this.content.rpgRules.repeatCorrect; // +2 EXP repeat correct
            }
            s.expGainedThisRun += gainedExp;
            this.saveProfiles();
          }
          feedbackBox.className = 'quiz-feedback-box is-ok';
          feedbackBox.innerHTML = `<strong>✅ Correct! (+${gainedExp} EXP) — Concept Monster Hit!</strong><p>${q.explanation}</p>`;
        } else {
          soundManager.playChime('wrong');
          feedbackBox.className = 'quiz-feedback-box is-bad';
          feedbackBox.innerHTML = `<strong>❌ Not quite!</strong><p><b>Hint:</b> ${q.hint}</p><p><b>Explanation:</b> ${q.explanation}</p>`;
        }

        const afterLvl = this.computeExpAndLevel(prof).level;
        this.updateHUD();
        if (afterLvl > beforeLvl) this.triggerLevelUpBanner(afterLvl);

        feedbackBox.hidden = false;
        nextBtn.hidden = false;
      });

      optsBox.appendChild(btn);
    });

    qCard.append(optsBox, feedbackBox, nextBtn);
    box.appendChild(qCard);
  }

  renderQuizSummary(box) {
    const s = this.quizSession;
    const passed = s.correctCount >= s.passReq;
    const prof = this.getActiveProfile();
    let clearBonus = 0;
    let newStampEarned = false;

    if (prof) {
      const prevBest = prof.bestScores[s.islandId] || 0;
      if (s.correctCount > prevBest) prof.bestScores[s.islandId] = s.correctCount;

      if (passed) {
        const beforeLvl = this.computeExpAndLevel(prof).level;
        if (s.islandId === 'center') {
          prof.finalCleared = true;
        } else if (!prof.stamps.includes(s.islandId)) {
          // First time clearing this island -> +10 EXP & +1 Stamp (replaying does NOT duplicate stamp!)
          prof.stamps.push(s.islandId);
          clearBonus = this.content.rpgRules.firstClear;
          s.expGainedThisRun += clearBonus;
          newStampEarned = true;
        }
        this.saveProfiles();
        const afterLvl = this.computeExpAndLevel(prof).level;
        if (afterLvl > beforeLvl) this.triggerLevelUpBanner(afterLvl);
      }
    }

    this.updateHUD();
    if (this.currentIslandId) this.renderIslandPanel(this.currentIslandId);

    const summary = document.createElement('div');
    summary.className = 'quiz-summary-card';
    summary.innerHTML = `
      <div class="summary-icon">${passed ? '🏆' : '🛡️'}</div>
      <h3>${passed ? 'Concept Monster Repaired & Cleared!' : 'Challenge Incomplete — Try Again!'}</h3>
      <p>Score: <b>${s.correctCount} / ${s.questions.length}</b> (Required: ${s.passReq})</p>
      <p>EXP Earned in this Battle: <b>+${s.expGainedThisRun} EXP</b> ${clearBonus ? `(includes +${clearBonus} First Clear Bonus!)` : ''}</p>
      ${newStampEarned ? '<p class="stamp-earned-banner">🏅 Regional Island Stamp Added to Your Passport!</p>' : ''}
    `;

    const btnRow = document.createElement('div');
    btnRow.className = 'npc-actions-bar';

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn-secondary';
    retryBtn.textContent = '🔄 Replay Challenge (再挑戰一次)';
    retryBtn.addEventListener('click', () => this.startQuizBattle(s.islandId));

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-primary';
    closeBtn.textContent = 'Done (完成)';
    closeBtn.addEventListener('click', () => this.closeModal('quiz-modal'));

    btnRow.append(retryBtn, closeBtn);

    if (passed && s.islandId === 'center') {
      const certBtn = document.createElement('button');
      certBtn.type = 'button';
      certBtn.className = 'btn-accent';
      certBtn.textContent = '🎓 Claim Mastery Certificate (領取證書)';
      certBtn.addEventListener('click', () => {
        this.closeModal('quiz-modal');
        this.openCertificateModal();
      });
      btnRow.appendChild(certBtn);
    }

    summary.appendChild(btnRow);
    box.appendChild(summary);
  }

  triggerLevelUpBanner(newLevel) {
    soundManager.playChime('levelup');
    this.showToast(`🎉 LEVEL UP! You reached Level ${newLevel}! Keep conquering musculoskeletal anatomy!`);
  }

  // Stamp Passport Modal (`集章護照`)
  renderPassportModal() {
    const grid = document.getElementById('passport-stamps-grid');
    const summaryEl = document.getElementById('passport-summary-text');
    if (!grid) return;
    grid.textContent = '';

    const prof = this.getActiveProfile();
    const stamps = prof ? prof.stamps : [];
    const unlockReq = this.content.rpgRules.centerUnlockStamps || 4;

    if (summaryEl) {
      summaryEl.textContent = `Collected ${stamps.length} / 8 Regional Stamps. (${stamps.length >= unlockReq ? '✅ Central Island Final Challenge Unlocked!' : `Collect ${unlockReq} stamps to unlock the Central Island Final Challenge.`})`;
    }

    this.content.islands.forEach((isl) => {
      const earned = stamps.includes(isl.id);
      const card = document.createElement('div');
      card.className = 'stamp-slot' + (earned ? ' is-earned' : ' is-locked');
      card.innerHTML = `
        <div class="stamp-emblem">${earned ? '🏅' : '🔒'}</div>
        <strong>#${isl.order} ${isl.name}</strong>
        <small>${earned ? 'Cleared · Stamp Earned' : 'Silhouette · Not Cleared'}</small>
      `;
      card.addEventListener('click', () => {
        this.closeModal('passport-modal');
        this.handleSelectIsland(isl.id, 'passport');
      });
      grid.appendChild(card);
    });

    const finalBtn = document.getElementById('btn-passport-final');
    if (finalBtn) {
      finalBtn.disabled = stamps.length < unlockReq;
      finalBtn.textContent = stamps.length >= unlockReq
        ? '👑 Enter Central Island Final Challenge'
        : `🔒 Need ${unlockReq - stamps.length} More Stamp(s) for Final Challenge`;
      finalBtn.onclick = () => {
        this.closeModal('passport-modal');
        this.startQuizBattle('center');
      };
    }
  }

  // Canvas Certificate Generator (`冒險證書`, Download PNG & Print)
  openCertificateModal() {
    const prof = this.getActiveProfile() || this.getOrCreateProfile('Explorer', 0);
    const nameInput = document.getElementById('cert-name-input');
    if (nameInput && !nameInput.value) {
      nameInput.value = prof.code;
    }
    this.drawCertificateCanvas(nameInput ? nameInput.value : prof.code);
    this.openModal('certificate-modal');

    if (nameInput) {
      nameInput.oninput = () => this.drawCertificateCanvas(nameInput.value || prof.code);
    }
    document.getElementById('btn-download-cert').onclick = () => {
      const canvas = document.getElementById('certificate-canvas');
      if (!canvas) return;
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `ricky-anatomy-island-certificate-${(nameInput?.value || prof.code).trim()}.png`;
      a.click();
    };
    document.getElementById('btn-print-cert').onclick = () => {
      window.print();
    };
  }

  drawCertificateCanvas(holderName) {
    const canvas = document.getElementById('certificate-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    const prof = this.getActiveProfile();
    const { exp, level } = this.computeExpAndLevel(prof);
    const stampsCount = prof ? prof.stamps.length : 0;

    // Parchment Background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#fdfaf2');
    grad.addColorStop(1, '#eef3e6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Ornate Double Border
    ctx.strokeStyle = '#3f7d3a';
    ctx.lineWidth = 10;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.strokeStyle = '#e3a33b';
    ctx.lineWidth = 4;
    ctx.strokeRect(38, 38, w - 76, h - 76);

    // Header
    ctx.fillStyle = '#3f7d3a';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("RICKY'S ANATOMY LEARNING ISLAND", w / 2, 102);

    ctx.fillStyle = '#c47f1b';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('CERTIFICATE OF MUSCULOSKELETAL ANATOMY ADVENTURE', w / 2, 138);

    ctx.fillStyle = '#415945';
    ctx.font = '16px sans-serif';
    ctx.fillText('This certifies that the Anatomy Adventurer', w / 2, 185);

    // Recipient Name
    ctx.fillStyle = '#162819';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText(String(holderName || 'Adventurer').slice(0, 28), w / 2, 242);

    ctx.strokeStyle = '#3f7d3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.25, 258);
    ctx.lineTo(w * 0.75, 258);
    ctx.stroke();

    // Stats & Mastery Details
    ctx.fillStyle = '#263829';
    ctx.font = '18px sans-serif';
    ctx.fillText(
      `Has conquered the Grand Musculoskeletal Citadel Challenge across 157 muscles`,
      w / 2,
      305
    );
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#3f7d3a';
    ctx.fillText(
      `Adventurer Level: Lv.${level} (${exp} EXP)   ·   Regional Stamps: ${stampsCount} / 8`,
      w / 2,
      348
    );

    if (stampsCount >= 8) {
      ctx.fillStyle = '#d9821b';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText('★ Honors: Full Archipelago Mastery (8/8 Regional Stamps) ★', w / 2, 382);
    }

    // Date & Author
    const dateStr = new Date().toISOString().slice(0, 10);
    ctx.fillStyle = '#415945';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Issued Date: ${dateStr}`, 68, h - 72);
    ctx.fillText(`Author & Mentor: ${this.content.site.author} & Mentor Wilson`, 68, h - 48);

    // Mandatory Non-Official Disclaimer at bottom-right (證書右下角固定加註「本證書為學習紀錄，非官方認證」)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#586e5b';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('本證書為學習紀錄，非官方認證 (Learning Record Only · Non-Official Certification)', w - 64, h - 52);
  }

  // Save Code Encode / Decode (`ANATOMYA1.<checksum>.<base64>`)
   computeSaveCode(profile) {
    if (!profile) return '';
    const payload = {
      v: 1,
      code: profile.code,
      style: profile.style || 0,
      currentIsland: profile.currentIsland || 'center',
      visitedIslands: profile.visitedIslands || [],
      correctQuestions: profile.correctQuestions || [],
      repeatCorrectCount: profile.repeatCorrectCount || 0,
      bestScores: profile.bestScores || {},
      stamps: profile.stamps || [],
      completedTrades: profile.completedTrades || [],
      finalCleared: !!profile.finalCleared
    };
    const jsonStr = JSON.stringify(payload);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    let sum = 0;
    for (let i = 0; i < b64.length; i++) {
      sum = (sum * 31 + b64.charCodeAt(i)) % 65535;
    }
    const chk = sum.toString(16).padStart(4, '0');
    return `${this.content.rpgRules.savePrefix}${chk}.${b64}`;
  }

  renderSaveCodeModal() {
    const prof = this.getActiveProfile() || this.getOrCreateProfile('Explorer', 0);
    const out = document.getElementById('savecode-output');
    if (out) out.value = this.computeSaveCode(prof);
    const status = document.getElementById('savecode-status');
    if (status) status.textContent = '';
  }

  restoreFromSaveCode(rawCode, statusEl) {
    const str = String(rawCode || '').trim();
    const prefix = this.content.rpgRules.savePrefix || 'ANATOMYA1.';
    if (!str.startsWith(prefix)) {
      if (statusEl) {
        statusEl.textContent = 'Invalid Save Code prefix! Expected code starting with ANATOMYA1. (接關碼格式不符)';
        statusEl.className = 'status-msg bad';
      }
      return false;
    }
    try {
      const rest = str.slice(prefix.length);
      const dotIdx = rest.indexOf('.');
      if (dotIdx !== 4) throw new Error('Missing checksum');
      const expectedChk = rest.slice(0, 4);
      const b64 = rest.slice(5);
      let sum = 0;
      for (let i = 0; i < b64.length; i++) {
        sum = (sum * 31 + b64.charCodeAt(i)) % 65535;
      }
      const actualChk = sum.toString(16).padStart(4, '0');
      if (expectedChk !== actualChk) throw new Error('Checksum mismatch');

      const jsonStr = decodeURIComponent(escape(atob(b64)));
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed.code !== 'string' || !Array.isArray(parsed.stamps)) {
        throw new Error('Invalid payload');
      }

      this.profiles[parsed.code] = parsed;
      this.activeCode = parsed.code;
      this.browseOnly = false;
      this.saveProfiles();
      if (this.world) this.world.setAdventurer(parsed);
      this.updateHUD();
      this.renderSaveCodeModal();

      if (statusEl) {
        statusEl.textContent = `Save restored! Welcome back, Adventurer ${parsed.code}! (成功還原進度！)`;
        statusEl.className = 'status-msg ok';
      }
      return true;
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = 'Save Code is corrupted or tampered with. Could not restore. (接關碼內容損毀或格式錯誤，無法還原)';
        statusEl.className = 'status-msg bad';
      }
      return false;
    }
  }

  // Backpack & Trade Chain Modal
  renderBackpackModal() {
    const itemsGrid = document.getElementById('backpack-items-grid');
    const tradesList = document.getElementById('backpack-trades-list');
    if (!itemsGrid || !tradesList) return;
    itemsGrid.textContent = '';
    tradesList.textContent = '';

    this.content.items.forEach((it) => {
      const count = this.backpack[it.id] || 0;
      const cell = document.createElement('div');
      cell.className = 'bp-item-card';
      cell.innerHTML = `
        <span class="bp-icon">${it.icon}</span>
        <div>
          <strong>${it.name}</strong> <span class="bp-count">×${count}</span>
          <small>${it.desc}</small>
        </div>
      `;
      itemsGrid.appendChild(cell);
    });

    this.content.residents.forEach((res) => {
      if (!res.trade) return;
      const tr = res.trade;
      const giveItem = this.content.items.find((i) => i.id === tr.give);
      const getItem = this.content.items.find((i) => i.id === tr.get);
      const haveCount = this.backpack[tr.give] || 0;
      const canTrade = haveCount >= tr.giveCount;

      const row = document.createElement('div');
      row.className = 'bp-trade-row';
      const info = document.createElement('div');
      info.innerHTML = `<strong>${res.name}</strong> <small>(${res.islandName})</small><br>Give ${tr.giveCount} ${giveItem.icon} ${giveItem.name} → Get ${tr.getCount} ${getItem.icon} ${getItem.name}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-accent btn-sm';
      btn.disabled = !canTrade;
      btn.textContent = canTrade ? '🔁 Trade Now' : `Need ${tr.giveCount} ${giveItem.icon}`;
      btn.addEventListener('click', () => {
        this.executeResidentTrade(res, null);
        this.renderBackpackModal();
      });
      row.append(info, btn);
      tradesList.appendChild(row);
    });
  }

  // Full Accessible Location List & Muscle Search (不用 3D 也能讀完所有內容、完成對話與挑戰)
  renderLocationList(searchQuery = '') {
    const box = document.getElementById('location-list-container');
    const filterContainer = document.getElementById('location-category-filters');
    if (!box) return;
    box.textContent = '';

    const q = String(searchQuery || '').trim().toLowerCase();
    const prof = this.getActiveProfile();

    if (filterContainer && !filterContainer.hasChildNodes()) {
      const cats = ['ALL', 'Axial & Cranio-C', 'Upper Extremity', 'Axial & Core', 'Lower Extremity'];
      cats.forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip-btn' + (c === 'ALL' ? ' is-active' : '');
        b.textContent = c === 'ALL' ? 'All Regions (8+1)' : c;
        b.addEventListener('click', () => {
          filterContainer.querySelectorAll('.chip-btn').forEach((x) => x.classList.remove('is-active'));
          b.classList.add('is-active');
          this.activeListCategory = c;
          this.renderLocationList(document.getElementById('modal-search-input')?.value || '');
        });
        filterContainer.appendChild(b);
      });
    }

    const catFilter = this.activeListCategory || 'ALL';

    // 1. Center Island Card
    if (catFilter === 'ALL' && (!q || this.content.centerIsland.name.toLowerCase().includes(q) || 'citadel wilson final certificate'.includes(q))) {
      const ci = this.content.centerIsland;
      const stampsCount = prof ? prof.stamps.length : 0;
      const unlockReq = this.content.rpgRules.centerUnlockStamps || 4;
      const card = document.createElement('article');
      card.className = 'loc-card is-center-loc';
      card.innerHTML = `
        <div class="loc-card-head">
          <div>
            <span class="badge-tag">${ci.role}</span>
            <h3>👑 ${ci.name} (${ci.subtitle})</h3>
          </div>
        </div>
        <p>${ci.description}</p>
        <p class="muted-sm"><b>NPC Mentor:</b> ${ci.npc.name} — "${ci.npc.story[0]}"</p>
      `;
      const btnBar = document.createElement('div');
      btnBar.className = 'npc-actions-bar';
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn-secondary btn-sm';
      openBtn.textContent = '🏛️ Open Central Island Panel';
      openBtn.addEventListener('click', () => {
        this.closeModal('list-modal');
        this.handleSelectIsland('center', 'list');
      });
      const chalBtn = document.createElement('button');
      chalBtn.type = 'button';
      chalBtn.className = 'btn-primary btn-sm';
      chalBtn.disabled = stampsCount < unlockReq;
      chalBtn.textContent = `⚔️ Final Challenge (${stampsCount}/${unlockReq} Stamps)`;
      chalBtn.addEventListener('click', () => {
        this.closeModal('list-modal');
        this.startQuizBattle('center');
      });
      btnBar.append(openBtn, chalBtn);
      card.appendChild(btnBar);
      box.appendChild(card);
    }

    // 2. 8 Regional Islands + Matching Muscles + Residents
    this.content.islands.forEach((isl) => {
      if (catFilter !== 'ALL' && isl.group !== catFilter) return;

      const matchingMuscles = q
        ? isl.muscles.filter((m) =>
            m.name.toLowerCase().includes(q) ||
            m.grouping.toLowerCase().includes(q) ||
            m.origin.toLowerCase().includes(q) ||
            m.insertion.toLowerCase().includes(q) ||
            m.action.toLowerCase().includes(q) ||
            m.innervation.toLowerCase().includes(q)
          )
        : isl.muscles;

      const islandMatches = !q ||
        isl.name.toLowerCase().includes(q) ||
        isl.group.toLowerCase().includes(q) ||
        isl.intro.toLowerCase().includes(q) ||
        matchingMuscles.length > 0;

      if (!islandMatches) return;

      const isCleared = prof && prof.stamps.includes(isl.id);
      const isVisited = prof && prof.visitedIslands.includes(isl.id);
      const islResidents = this.content.residents.filter((r) => r.islandId === isl.id);

      const card = document.createElement('article');
      card.className = 'loc-card';
      card.innerHTML = `
        <div class="loc-card-head">
          <div>
            <span class="badge-tag">${isl.group} · ${isl.muscleCount} Muscles</span>
            ${isCleared ? '<span class="stamp-pill">🏅 Stamp Earned</span>' : isVisited ? '<span class="badge-tag">Visited</span>' : ''}
            <h3>#${isl.order} ${isl.name}</h3>
          </div>
        </div>
        <p>${isl.intro}</p>
        <div class="muted-sm"><b>🛡️ Gatekeeper NPC:</b> ${isl.npc.name} vs. <b>${isl.npc.monsterName}</b> — ${isl.extra}</div>
        <div class="muted-sm"><b>💬 NPC Story:</b> ${isl.npc.story[0]}</div>
        <div class="muted-sm"><b>👥 Island Residents:</b> ${islResidents.map((r) => `${r.name} ("${r.lines[0]}")`).join(' · ')}</div>
      `;

      if (q && matchingMuscles.length > 0) {
        const mPreview = document.createElement('div');
        mPreview.className = 'search-muscle-matches';
        mPreview.innerHTML = `<strong>Matching Muscles (${matchingMuscles.length}):</strong> ` +
          matchingMuscles.slice(0, 6).map((m) => `${m.name} (${m.innervation})`).join(', ');
        card.appendChild(mPreview);
      }

      const btnBar = document.createElement('div');
      btnBar.className = 'npc-actions-bar';

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn-secondary btn-sm';
      viewBtn.textContent = `📖 Read All ${isl.muscleCount} Muscles & Details`;
      viewBtn.addEventListener('click', () => {
        this.closeModal('list-modal');
        this.handleSelectIsland(isl.id, 'list');
      });

      const quizBtn = document.createElement('button');
      quizBtn.type = 'button';
      quizBtn.className = 'btn-primary btn-sm';
      quizBtn.textContent = `⚔️ Challenge ${isl.npc.monsterName}`;
      quizBtn.addEventListener('click', () => {
        this.closeModal('list-modal');
        this.startQuizBattle(isl.id);
      });

      btnBar.append(viewBtn, quizBtn);
      card.appendChild(btnBar);
      box.appendChild(card);
    });
  }

  // Guided Tour (`▶ 導覽`)
  getTourStops() {
    return [
      ...this.content.islands.map((isl) => ({
        id: isl.id,
        name: `#${isl.order} ${isl.name}`,
        desc: `${isl.intro} — ${isl.points[0]}`
      })),
      {
        id: 'center',
        name: `👑 ${this.content.centerIsland.name}`,
        desc: this.content.centerIsland.description
      }
    ];
  }

  startGuidedTour() {
    if (this.world.walkMode) this.toggleWalkMode(false);
    this.closeSidePanel();
    this.closeSpeechBubble();
    this.tourState.active = true;
    this.tourState.paused = false;
    this.tourState.index = 0;
    this.tourState.timer = 0;
    this.tourState.duration = this.reducedMotion ? 7.5 : 5.0;
    document.getElementById('tour-card').hidden = false;
    this.flyToTourStop();
  }

  stepGuidedTour(delta) {
    const stops = this.getTourStops();
    this.tourState.index = (this.tourState.index + delta + stops.length) % stops.length;
    this.tourState.timer = 0;
    this.flyToTourStop();
  }

  flyToTourStop() {
    const stops = this.getTourStops();
    const cur = stops[this.tourState.index];
    if (!cur) return;
    this.updateTourUI();
    this.world.flyToIsland(cur.id);
  }

  updateTourUI() {
    const stops = this.getTourStops();
    const cur = stops[this.tourState.index];
    if (!cur) return;
    document.getElementById('tour-step-badge').textContent = `Stop ${this.tourState.index + 1} / ${stops.length}`;
    document.getElementById('tour-island-title').textContent = cur.name;
    document.getElementById('tour-island-desc').textContent = cur.desc;
    const pauseBtn = document.getElementById('tour-pause');
    if (pauseBtn) pauseBtn.textContent = this.tourState.paused ? '▶ Resume (繼續)' : '⏸ Pause (暫停)';
  }

  stopGuidedTour() {
    this.tourState.active = false;
    this.tourState.paused = false;
    document.getElementById('tour-card').hidden = true;
    this.world.resetToPanorama(false);
  }

  // First-Person Walk Mode (`🚶 漫遊`)
  toggleWalkMode(enable) {
    if (enable && this.tourState.active) this.stopGuidedTour();
    if (enable) {
      this.closeSidePanel();
      this.closeSpeechBubble();
    }
    this.world.setWalkMode(enable);
    const hud = document.getElementById('walk-mode-hud');
    if (hud) hud.hidden = !enable;
    const btn = document.getElementById('btn-walk-mode');
    if (btn) btn.classList.toggle('is-active', enable);
  }

  openAdventurerModal() {
    const inp = document.getElementById('adventurer-code-input');
    if (inp && this.activeCode) inp.value = this.activeCode;
    this.openModal('adventurer-modal');
    if (inp) inp.focus();
  }

  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  updateHUD() {
    const prof = this.getActiveProfile();
    const { exp, level } = this.computeExpAndLevel(prof);
    const stampsCount = prof ? prof.stamps.length : 0;
    const visitedCount = prof ? prof.visitedIslands.length : 0;

    const advBtn = document.getElementById('btn-open-adventurer');
    if (advBtn) {
      advBtn.textContent = prof
        ? `🧑‍🎓 ${prof.code} · Lv.${level} (${exp} EXP)`
        : '🧑‍🎓 Create Adventurer';
    }

    const passBtn = document.getElementById('btn-open-passport');
    if (passBtn) {
      passBtn.textContent = `🏅 Stamps: ${stampsCount}/8`;
    }

    const progEl = document.getElementById('hud-explore-progress');
    if (progEl) {
      progEl.textContent = `Explored: ${visitedCount}/8`;
    }

    const bpBtn = document.getElementById('btn-open-backpack');
    if (bpBtn) {
      bpBtn.textContent = `🎒 🐚${this.backpack.shell || 0}`;
    }

    const chestBtn = document.getElementById('btn-daily-chest');
    if (chestBtn) {
      chestBtn.textContent = `🗝️ Keys: ${this.dailyKeyState.left}/3`;
    }

    // Update 3D Island Label Badges
    if (this.world && this.content) {
      this.content.islands.forEach((isl) => {
        const cleared = prof && prof.stamps.includes(isl.id);
        this.world.updateIslandLabelBadge(
          isl.id,
          cleared ? `🏅 Cleared · ${isl.muscleCount}M` : `${isl.muscleCount} Muscles`,
          cleared
        );
      });
      const unlockReq = this.content.rpgRules.centerUnlockStamps || 4;
      const centerUnlocked = stampsCount >= unlockReq;
      this.world.updateIslandLabelBadge(
        'center',
        prof && prof.finalCleared
          ? '🎓 Mastered!'
          : centerUnlocked
            ? '⚔️ Final Unlocked!'
            : `🔒 ${stampsCount}/${unlockReq} Stamps`,
        !!(prof && prof.finalCleared)
      );
    }
  }

  showToast(message) {
    const box = document.getElementById('toast-container');
    if (!box) return;
    box.textContent = '';
    const item = document.createElement('div');
    item.className = 'toast-pill';
    item.textContent = message;
    box.appendChild(item);
    setTimeout(() => {
      item.classList.add('fade-out');
      setTimeout(() => item.remove(), 350);
    }, 2800);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new AnatomyIslandApp();
  window.anatomyApp = app;
  window.app = app;
  app.start();
});
