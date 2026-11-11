/* 织思 WeaveMind — 演示页交互与自动导览（零依赖） */

(() => {
  const params = new URLSearchParams(location.search);
  const capture = params.get('capture') === '1';
  const skipIntro = params.get('intro') === '0';
  const paused = params.get('paused') === '1';
  const sceneParam = Number(params.get('scene') || 0);
  if (capture) {
    document.body.classList.add('capture');
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
  }

  const scenes = [
    {
      title: '导图 · 拖动整枝，自动排斥',
      sub: '像整理桌面一样整理想法，节点永不重叠。',
      duration: 5200
    },
    {
      title: '大纲 · 与导图实时同源',
      sub: '同一份文档的另一种视角，改一处两边同步。',
      duration: 4800
    },
    {
      title: '演说 · 16:9 思维导图逐页展开',
      sub: '封面不展示全览图，分支页保持同一方向与动效。',
      duration: 5200
    },
    {
      title: '甘特 · 任务与排期一目了然',
      sub: '进度、优先级、截止日期，在同一张图上汇总。',
      duration: 4800
    },
    {
      title: '本地优先 · 一键导出所有格式',
      sub: 'IndexedDB 主存储与本地备份，零上传、零账号。',
      duration: 5200
    }
  ];

  const sceneEls = Array.from(document.querySelectorAll('.scene'));
  const initialScene = Math.max(0, Math.min(scenes.length - 1, sceneParam));
  const railItems = Array.from(document.querySelectorAll('[data-rail]'));
  const captionIndex = document.getElementById('captionIndex');
  const captionTitle = document.getElementById('captionTitle');
  const captionSub = document.getElementById('captionSub');
  const dotsHost = document.getElementById('tourDots');
  const progress = document.getElementById('tourProgress');
  const playBtn = document.getElementById('tourPlay');
  const tour = document.getElementById('tour');
  const intro = document.getElementById('cineIntro');
  if (skipIntro && intro) intro.style.display = 'none';

  let index = 0;
  let playing = !paused;
  let elapsed = 0;
  let last = performance.now();
  let started = false;
  let raf = 0;
  let looped = false;

  const dots = scenes.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('aria-label', `第 ${i + 1} 段`);
    dot.addEventListener('click', () => {
      setScene(i);
      elapsed = 0;
      playing = true;
      syncPlayButton();
    });
    dotsHost.appendChild(dot);
    return dot;
  });

  function syncPlayButton() {
    if (!playBtn) return;
    playBtn.textContent = playing ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', playing ? '暂停演示' : '播放演示');
  }

  function setScene(next, restart = true) {
    const safe = ((next % scenes.length) + scenes.length) % scenes.length;
    if (safe === index && restart && started) {
      // 同一个场景再次点击时重新播放动画
      sceneEls[safe]?.classList.remove('active');
      void sceneEls[safe]?.offsetWidth;
    }
    index = safe;
    sceneEls.forEach((el, i) => el.classList.toggle('active', i === index));
    railItems.forEach((el, i) => el.classList.toggle('on', i === Math.min(index, 3)));
    dots.forEach((dot, i) => dot.classList.toggle('on', i === index));
    if (captionIndex) captionIndex.textContent = `${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
    if (captionTitle) captionTitle.textContent = scenes[index].title;
    if (captionSub) captionSub.textContent = scenes[index].sub;
    elapsed = 0;
    if (progress) progress.style.width = '0%';
  }

  function next() {
    setScene(index + 1);
  }

  function tick(now) {
    const dt = Math.min(80, now - last);
    last = now;
    if (playing && started) {
      elapsed += dt;
      const duration = scenes[index].duration;
      if (progress) progress.style.width = `${Math.min(100, (elapsed / duration) * 100)}%`;
      if (elapsed >= duration) {
        if (index === scenes.length - 1) {
          looped = true;
          if (capture) {
            document.body.dataset.demoDone = '1';
            playing = false;
            syncPlayButton();
            return;
          }
        }
        next();
      }
    }
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (started) return;
    started = true;
    last = performance.now();
    setScene(initialScene, false);
    if (capture) {
      window.setTimeout(() => {
        if (intro) intro.style.display = 'none';
      }, 3900);
    }
    raf = requestAnimationFrame(tick);
  }

  function syncPlayFromViewport() {
    if (capture) return;
    const rect = tour?.getBoundingClientRect();
    if (!rect || !started) return;
    const visible = rect.top < innerHeight * .8 && rect.bottom > innerHeight * .2;
    if (!visible && playing) {
      playing = false;
      syncPlayButton();
    }
  }

  playBtn?.addEventListener('click', () => {
    playing = !playing;
    last = performance.now();
    syncPlayButton();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { setScene(index + 1); playing = true; syncPlayButton(); }
    if (event.key === 'ArrowLeft') { setScene(index - 1); playing = true; syncPlayButton(); }
    if (event.key === ' ') {
      if (event.target?.tagName === 'BUTTON') return;
      event.preventDefault();
      playing = !playing;
      last = performance.now();
      syncPlayButton();
    }
  });

  // 首次进入视口后开始，避免页面加载时动画已经播完
  if (capture) {
    window.setTimeout(start, skipIntro ? 350 : 3600);
  } else {
    const tourObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          start();
          if (!playing && !looped) {
            playing = true;
            last = performance.now();
            syncPlayButton();
          }
        }
      }
    }, { threshold: .28 });
    if (tour) tourObserver.observe(tour);
    syncPlayButton();
  }

  // 滚动到演示区域时再启动一次兜底
  window.addEventListener('scroll', syncPlayFromViewport, { passive: true });

  /* ---------------- reveal ---------------- */
  const revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      }
    }
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  /* ---------------- count-up ---------------- */
  const countObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      const target = Number(el.getAttribute('data-count') || 0);
      const startedAt = performance.now();
      const duration = 900;
      const tickCount = (now) => {
        const t = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - (1 - t) ** 3;
        el.textContent = String(Math.round(target * eased));
        if (t < 1) requestAnimationFrame(tickCount);
      };
      requestAnimationFrame(tickCount);
      countObserver.unobserve(el);
    }
  }, { threshold: .5 });
  document.querySelectorAll('[data-count]').forEach((el) => {
    if (!capture) countObserver.observe(el);
    else el.textContent = el.getAttribute('data-count') || '0';
  });

  /* ---------------- cursor glow & parallax ---------------- */
  document.addEventListener('pointermove', (event) => {
    document.documentElement.style.setProperty('--px', `${event.clientX}px`);
    document.documentElement.style.setProperty('--py', `${event.clientY}px`);
    const card = event.target?.closest?.('.feature-card') || null;
    if (card) {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    }
  }, { passive: true });

  let parallaxTicking = false;
  window.addEventListener('scroll', () => {
    if (parallaxTicking) return;
    parallaxTicking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const orbit = document.querySelector('.hero-visual');
      if (orbit && y < innerHeight) orbit.style.transform = `translateY(${y * .08}px)`;
      parallaxTicking = false;
    });
  }, { passive: true });

  // 提供给自动化录制或调试使用
  window.__demo = {
    play: () => { playing = true; last = performance.now(); syncPlayButton(); },
    pause: () => { playing = false; syncPlayButton(); },
    next,
    prev: () => setScene(index - 1),
    setScene,
    get index() { return index; },
    get playing() { return playing; },
    get duration() { return scenes.reduce((sum, scene) => sum + scene.duration, 0); }
  };
})();
