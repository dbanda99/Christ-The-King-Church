/* Christ The King Church — Bootstrap + vanilla JS */

// YouTube integration for Sermons page
// 1) Create a YouTube Data API v3 key in Google Cloud.
// 2) Set your CHANNEL_ID below (from your YouTube channel).
// NOTE: Leaving apiKey empty will show a setup message on sermons.html.
window.CTK_YT = window.CTK_YT || {
  apiKey: "",
  channelId: "",
  maxResults: 12
};


(function () {
  // Init AOS animations
  if (window.AOS) {
    AOS.init({
      duration: 700,
      easing: "ease-out-cubic",
      once: true,
      offset: 60
    });
  }

  // Set current year in any element with data-year
  document.querySelectorAll("[data-year]").forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  // Smooth scroll for same-page anchors
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Contact form demo (no backend): show toast
  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const toastEl = document.getElementById("toastSent");
      if (toastEl) {
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
      }
      contactForm.reset();
    });
  }

  // Giving form demo: create Stripe payment link button
  // For a real setup, replace with your Stripe Payment Link URL or Checkout session endpoint.
  // Giving page: either open a Stripe Payment Link (simple) or use Netlify Functions (Checkout).
  const giveBtn = document.getElementById("giveNowBtn");
  if (giveBtn) {
    const mode = giveBtn.getAttribute("data-give-mode") || "link"; // "link" or "checkout"
    if (mode === "link") {
      giveBtn.addEventListener("click", () => {
        const url = giveBtn.getAttribute("data-payment-link");
        if (url && url.startsWith("http")) {
          window.open(url, "_blank", "noopener");
        } else {
          alert("Set your Stripe Payment Link URL in giving.html (data-payment-link).");
        }
      });
    }
  }

  // Sermons page: auto-detect live status via YouTube Data API, fallback to latest upload, then show archive
  function initSermonsPage(){
    const page = document.getElementById("sermonsPage");
    if (!page) return;

    const cfg = window.CTK_YT || {};
    const apiKey = (cfg.apiKey || "").trim();
    const channelId = (cfg.channelId || "").trim();
    const maxResults = Math.min(Math.max(parseInt(cfg.maxResults || 12, 10), 6), 24);

    const els = {
      liveHeading: document.getElementById("liveHeading"),
      liveSub: document.getElementById("liveSub"),
      featuredPlaceholder: document.getElementById("featuredPlaceholder"),
      featuredMeta: document.getElementById("featuredMeta"),
      featuredOpen: document.getElementById("featuredOpen"),
      ytConfigAlert: document.getElementById("ytConfigAlert"),
      sermonGrid: document.getElementById("sermonGrid"),
      loadMoreBtn: document.getElementById("loadMoreBtn"),
      sermonStatus: document.getElementById("sermonStatus"),
      sermonSearch: document.getElementById("sermonSearch"),
      sermonSort: document.getElementById("sermonSort"),
      channelLabel: document.getElementById("channelLabel")
    };

    const state = {
      videos: [],
      nextPageToken: null,
      loading: false
    };

    function setStatus(msg, show){
      if (!els.sermonStatus) return;
      els.sermonStatus.textContent = msg || "";
      els.sermonStatus.classList.toggle("d-none", !show);
    }

    function ytUrl(params){
      const u = new URL("https://www.googleapis.com/youtube/v3/search");
      Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
      return u.toString();
    }

    async function ytFetch(params){
      if (!apiKey || !channelId) throw new Error("YT_NOT_CONFIGURED");
      const url = ytUrl({ key: apiKey, channelId, ...params });
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        const msg = (data && data.error && data.error.message) ? data.error.message : "YouTube API error.";
        throw new Error(msg);
      }
      return data;
    }

    function renderFeatured(video, mode){
      // mode: "live" | "latest"
      if (!video) return;
      const videoId = video.id && (video.id.videoId || video.id);
      const title = video.snippet?.title || "Sermon";
      const publishedAt = video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : null;

      const iframe = document.createElement("iframe");
      iframe.src = "https://www.youtube.com/embed/" + encodeURIComponent(videoId) + "?rel=0&modestbranding=1";
      iframe.title = title;
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;

      els.featuredPlaceholder.replaceWith(iframe);

      if (els.liveHeading) els.liveHeading.textContent = (mode === "live") ? "En Vivo" : "Most Recent Sermon";
      if (els.liveSub) els.liveSub.textContent = (mode === "live")
        ? "We’re currently live — join the stream below."
        : "Not live right now — here’s the latest sermon.";

      const dateStr = publishedAt ? publishedAt.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" }) : "";
      if (els.featuredMeta) els.featuredMeta.textContent = title + (dateStr ? (" • " + dateStr) : "");

      if (els.featuredOpen) {
        els.featuredOpen.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(videoId);
        els.featuredOpen.classList.remove("d-none");
      }
    }

    function videoCard(video){
      const videoId = video.id?.videoId || video.id;
      const title = video.snippet?.title || "Sermon";
      const thumb = video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.medium?.url || "";
      const publishedAt = video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : null;
      const dateStr = publishedAt ? publishedAt.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" }) : "";

      const col = document.createElement("div");
      col.className = "col-12 col-sm-6 col-lg-4";

      col.innerHTML = `
        <a class="card video-card h-100 text-decoration-none border-0 shadow-sm ctk-card" href="https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}" target="_blank" rel="noopener">
          ${thumb ? `<img class="card-img-top" src="${thumb}" alt="">` : ``}
          <div class="card-body">
            <h3 class="h6 card-title mb-2">${title}</h3>
            <div class="small text-muted d-flex align-items-center gap-2">
              <i class="bi bi-calendar3"></i>
              <span>${dateStr || " "}</span>
            </div>
          </div>
        </a>
      `;
      return col;
    }

    function applyFilters(){
      const q = (els.sermonSearch?.value || "").trim().toLowerCase();
      const sort = els.sermonSort?.value || "date_desc";

      let list = state.videos.slice();

      if (q) {
        list = list.filter(v => (v.snippet?.title || "").toLowerCase().includes(q));
      }

      const getDate = (v) => v.snippet?.publishedAt ? new Date(v.snippet.publishedAt).getTime() : 0;
      if (sort === "date_desc") list.sort((a,b)=>getDate(b)-getDate(a));
      if (sort === "date_asc") list.sort((a,b)=>getDate(a)-getDate(b));
      if (sort === "title_asc") list.sort((a,b)=>(a.snippet?.title||"").localeCompare(b.snippet?.title||""));

      if (els.sermonGrid) {
        els.sermonGrid.innerHTML = "";
        list.forEach(v => els.sermonGrid.appendChild(videoCard(v)));
      }
    }

    async function loadArchive(next){
      if (state.loading) return;
      state.loading = true;

      try{
        setStatus("Loading sermons…", true);
        const data = await ytFetch({
          part: "snippet",
          type: "video",
          order: "date",
          maxResults,
          ...(next && state.nextPageToken ? { pageToken: state.nextPageToken } : {})
        });

        state.nextPageToken = data.nextPageToken || null;

        const items = (data.items || []).filter(it => it.id && it.id.videoId);
        // Avoid duplicates (live might also appear in uploads)
        const seen = new Set(state.videos.map(v => v.id.videoId));
        items.forEach(it => { if (!seen.has(it.id.videoId)) state.videos.push(it); });

        applyFilters();

        if (els.loadMoreBtn) {
          els.loadMoreBtn.classList.toggle("d-none", !state.nextPageToken);
        }

        setStatus(state.videos.length ? "" : "No videos found yet.", !state.videos.length);
      } finally {
        state.loading = false;
      }
    }

    async function detectLive(){
      if (!apiKey || !channelId) {
        if (els.ytConfigAlert) els.ytConfigAlert.classList.remove("d-none");
        if (els.liveSub) els.liveSub.textContent = "Agrega tu clave de API de YouTube y el ID del canal para habilitar la detección en vivo.";
        setStatus("Sermon archive requires YouTube API configuration.", true);
        return;
      }

      if (els.channelLabel) els.channelLabel.textContent = "YouTube • Canal";

      try{
        // 1) Live search
        const live = await ytFetch({
          part: "snippet",
          type: "video",
          eventType: "live",
          maxResults: 1
        });

        const liveItem = (live.items || [])[0];
        if (liveItem) {
          renderFeatured(liveItem, "live");
        } else {
          // 2) Latest upload
          const latest = await ytFetch({
            part: "snippet",
            type: "video",
            order: "date",
            maxResults: 1
          });
          const latestItem = (latest.items || [])[0];
          if (latestItem) renderFeatured(latestItem, "latest");
        }

        // Load archive (first page)
        await loadArchive(false);
      } catch (err){
        if (els.liveSub) els.liveSub.textContent = "No se pudieron cargar los videos. Verifica tu clave de API de YouTube y el ID del canal.";
        setStatus(String(err?.message || err), true);
        if (els.ytConfigAlert) els.ytConfigAlert.classList.remove("d-none");
      }
    }

    // UI wiring
    els.loadMoreBtn?.addEventListener("click", () => loadArchive(true));
    els.sermonSearch?.addEventListener("input", () => applyFilters());
    els.sermonSort?.addEventListener("change", () => applyFilters());

    // Kick off
    detectLive();
  }

  
  function initMapSwitcher() {
    const iframe = document.getElementById("ctkMapEmbed");
    if (!iframe) return;

    const buttons = Array.from(document.querySelectorAll(".js-map-btn"));
    if (!buttons.length) return;

    const setActive = (btn) => {
      buttons.forEach(b => b.classList.remove("is-active"));
      if (btn) btn.classList.add("is-active");
    };

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const embed = btn.getAttribute("data-embed");
        if (!embed) return;
        iframe.src = embed;
        setActive(btn);
      });
    });

    // Default active state
    setActive(buttons[0]);
  }


  // Home hero navbar: transparent on hero, solid on scroll
  function initHomeHeroNavbar(){
    const body = document.body;
    if (!body.classList.contains("page-home")) return;

    const navbar = document.getElementById("siteNavbar");
    const hero = document.querySelector("header.hero");
    if (!navbar || !hero) return;

    const update = () => {
      const navH = navbar.offsetHeight || 80;
      const heroH = hero.offsetHeight || window.innerHeight;
      const onHero = window.scrollY < (heroH - navH - 8);

      navbar.classList.toggle("nav-scrolled", !onHero);
      navbar.classList.toggle("nav-hero", onHero);

      // Toggle bootstrap theme classes for proper toggler icon coloring
      navbar.classList.toggle("navbar-dark", onHero);
      navbar.classList.toggle("navbar-light", !onHero);
    };

    update();

    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    }, { passive: true });

    window.addEventListener("resize", update);
  }

  initHomeHeroNavbar();

  initMapSwitcher();

    initSermonsPage();

})();
