/*
 * Full Custom Media Bar - custom front-end
 *
 * Renders a hand-curated media bar on the Jellyfin home screen. Each slide is
 * 100% author defined (title, subtitle, image, logo, badge) and can play a
 * video file, an HLS live broadcast, a YouTube/YouTube Live link or open an
 * external URL - none of it needs to exist in the Jellyfin library.
 *
 * The curated items are provided by the plugin's /MediaBar/CustomConfig
 * endpoint (pre-loaded into window.__FullCustomMediaBarConfig by the injected
 * bootstrap, with a self-fetch fallback).
 */
(function () {
  "use strict";

  if (window.__FullCustomMediaBar) {
    return;
  }

  var CONFIG = {
    rotationInterval: 12000, // ms between automatic slide changes
    fadeDuration: 500, // ms cross-fade duration (kept in sync with CSS)
    minSwipeDistance: 50, // px before a touch swipe counts
    retryInterval: 400, // ms between readiness checks
    // Player libraries are self-hosted by the plugin (no external CDN).
    hlsScript: "MediaBar/hls.min.js",
    mpegtsScript: "MediaBar/mpegts.js",
  };

  var STATE = {
    items: [],
    currentIndex: 0,
    timer: null,
    isPaused: false,
    playerOpen: false,
    hlsInstance: null,
    hlsLoading: null,
    mpegtsInstance: null,
    mpegtsLoading: null,
    bootstrapInterval: null,
  };

  // ---------------------------------------------------------------------------
  // Small DOM / string helpers
  // ---------------------------------------------------------------------------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null) {
          return;
        }
        if (key === "className") {
          node.className = value;
        } else if (key === "html") {
          node.innerHTML = value;
        } else if (key === "text") {
          node.textContent = value;
        } else if (key.indexOf("on") === 0 && typeof value === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
          node.setAttribute(key, value);
        }
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (child) {
        if (child == null) {
          return;
        }
        node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
      });
    }
    return node;
  }

  function isHomePage() {
    var hash = (window.location.hash || "").toLowerCase();
    return (
      hash === "#/home.html" ||
      hash === "#/home" ||
      hash.indexOf("#/home?") === 0 ||
      hash.indexOf("#/home.html?") === 0
    );
  }

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  function loadItems() {
    var preloaded = window.__FullCustomMediaBarConfig;
    if (preloaded && Array.isArray(preloaded.Items)) {
      return Promise.resolve(preloaded.Items);
    }
    try {
      return window.ApiClient
        .getJSON(window.ApiClient.getUrl("MediaBar/CustomConfig"))
        .then(function (config) {
          return config && Array.isArray(config.Items) ? config.Items : [];
        })
        .catch(function () {
          return [];
        });
    } catch (e) {
      return Promise.resolve([]);
    }
  }

  function sanitizeItems(items) {
    return (items || []).filter(function (item) {
      return item && (item.Title || item.LogoImageUrl || item.BackgroundImageUrl);
    });
  }

  // ---------------------------------------------------------------------------
  // Media playback overlay
  // ---------------------------------------------------------------------------

  function isYoutubeUrl(url) {
    return /(?:youtube\.com|youtu\.be)/i.test(url || "");
  }

  // Extracts a YouTube video id from the many possible URL shapes, or null.
  function youtubeId(url) {
    try {
      var parsed = new URL(url);
      var path = parsed.pathname || "";
      if (parsed.hostname.indexOf("youtu.be") !== -1) {
        return path.replace(/^\//, "").split("/")[0] || null;
      }
      if (parsed.searchParams.get("v")) {
        return parsed.searchParams.get("v");
      }
      var m = path.match(/\/(embed|live|shorts|v)\/([^/?#]+)/);
      if (m) {
        return m[2];
      }
    } catch (e) {
      /* fall through */
    }
    return null;
  }

  function youtubeEmbedUrl(url) {
    var id = youtubeId(url);
    if (!id) {
      return null;
    }
    var origin = "";
    try {
      origin = "&origin=" + encodeURIComponent(window.location.origin);
    } catch (e) {
      /* ignore */
    }
    // youtube-nocookie + playsinline + enablejsapi gives the most reliable embed.
    return (
      "https://www.youtube-nocookie.com/embed/" +
      id +
      "?autoplay=1&playsinline=1&rel=0&enablejsapi=1" +
      origin
    );
  }

  // Decides how a given item should actually be played, based on the chosen
  // MediaType but also sniffing the URL so a misclassified link still works.
  function resolveMediaKind(item) {
    var type = (item.MediaType || "none").toLowerCase();
    var url = item.MediaUrl || "";

    if (type === "none" || !url) {
      return "none";
    }
    if (type === "external") {
      return "external";
    }
    if (type === "youtube" || isYoutubeUrl(url)) {
      return "youtube";
    }
    if (/\.m3u8(\?|#|$)/i.test(url)) {
      return "hls";
    }
    if (/\.(ts|flv|m2ts|mts)(\?|#|$)/i.test(url) || /\/ts\//i.test(url)) {
      return "mpegts";
    }
    if (type === "live") {
      // Unknown live container: mpegts.js handles raw MPEG-TS/FLV streams.
      return "mpegts";
    }
    return "video"; // mp4/webm/ogg and other natively playable files
  }

  // Resolves a plugin-served asset (e.g. "MediaBar/mpegts.js") to a full URL,
  // honouring any Jellyfin base path. Keeps the libraries on the user's server.
  function pluginAssetUrl(resource) {
    try {
      if (window.ApiClient && typeof window.ApiClient.getUrl === "function") {
        return window.ApiClient.getUrl(resource);
      }
    } catch (e) {
      /* ignore */
    }
    return "/" + resource;
  }

  function loadScriptOnce(resource, globalName, stateKey) {
    if (window[globalName]) {
      return Promise.resolve(window[globalName]);
    }
    if (STATE[stateKey]) {
      return STATE[stateKey];
    }
    STATE[stateKey] = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = pluginAssetUrl(resource);
      script.onload = function () {
        resolve(window[globalName]);
      };
      script.onerror = function () {
        reject(new Error("Failed to load " + resource));
      };
      document.head.appendChild(script);
    });
    return STATE[stateKey];
  }

  function loadMpegts() {
    return loadScriptOnce(CONFIG.mpegtsScript, "mpegts", "mpegtsLoading");
  }

  function loadHls() {
    return loadScriptOnce(CONFIG.hlsScript, "Hls", "hlsLoading");
  }

  // Attaches an HLS (.m3u8) source: native where supported (Safari), else hls.js.
  function attachHls(video, url, isLive, onError) {
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(function () {});
      return;
    }
    loadHls()
      .then(function (Hls) {
        if (Hls && Hls.isSupported()) {
          destroyPlayers();
          STATE.hlsInstance = new Hls({ lowLatencyMode: !!isLive });
          STATE.hlsInstance.loadSource(url);
          STATE.hlsInstance.attachMedia(video);
          STATE.hlsInstance.on(Hls.Events.MANIFEST_PARSED, function () {
            video.play().catch(function () {});
          });
          STATE.hlsInstance.on(Hls.Events.ERROR, function (_e, data) {
            if (data && data.fatal && onError) {
              onError();
            }
          });
        } else {
          video.src = url;
        }
      })
      .catch(function () {
        if (onError) {
          onError();
        }
      });
  }

  // Attaches a raw MPEG-TS / FLV (often live) source via mpegts.js.
  function attachMpegts(video, url, isLive, onError) {
    loadMpegts()
      .then(function (mpegts) {
        if (mpegts && mpegts.isSupported()) {
          destroyPlayers();
          STATE.mpegtsInstance = mpegts.createPlayer(
            { type: "mpegts", isLive: !!isLive, url: url },
            { enableWorker: true, liveBufferLatencyChasing: !!isLive }
          );
          STATE.mpegtsInstance.attachMediaElement(video);
          STATE.mpegtsInstance.on(mpegts.Events.ERROR, function () {
            if (onError) {
              onError();
            }
          });
          STATE.mpegtsInstance.load();
          video.play().catch(function () {});
        } else if (onError) {
          onError();
        }
      })
      .catch(function () {
        if (onError) {
          onError();
        }
      });
  }

  function destroyPlayers() {
    if (STATE.hlsInstance) {
      try {
        STATE.hlsInstance.destroy();
      } catch (e) {
        /* ignore */
      }
      STATE.hlsInstance = null;
    }
    if (STATE.mpegtsInstance) {
      try {
        STATE.mpegtsInstance.destroy();
      } catch (e) {
        /* ignore */
      }
      STATE.mpegtsInstance = null;
    }
  }

  function closePlayer() {
    var overlay = document.getElementById("fcmb-player");
    if (overlay) {
      overlay.remove();
    }
    destroyPlayers();
    STATE.playerOpen = false;
    document.removeEventListener("keydown", onPlayerKeydown, true);
    if (!STATE.isPaused) {
      startTimer();
    }
  }

  function onPlayerKeydown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closePlayer();
    }
  }

  function openPlayer(item) {
    var url = item.MediaUrl || "";
    var kind = resolveMediaKind(item);

    if (kind === "none") {
      return;
    }
    if (kind === "external") {
      window.open(url, "_blank", "noopener");
      return;
    }

    stopTimer();
    closePlayer();
    STATE.playerOpen = true;

    var inner = el("div", { className: "fcmb-player-inner" });
    var isLive = (item.MediaType || "").toLowerCase() === "live" || kind === "mpegts";

    // Shown when playback fails (codec unsupported, CORS, embedding disabled...).
    function showError(messageHtml) {
      inner.innerHTML = "";
      inner.appendChild(
        el("div", { className: "fcmb-player-error" }, [
          el("p", { html: messageHtml || "Não foi possível reproduzir esta mídia aqui." }),
          el("a", {
            className: "fcmb-player-openext",
            href: url,
            target: "_blank",
            rel: "noopener",
            text: "Abrir em nova aba",
          }),
        ])
      );
    }

    if (kind === "youtube") {
      var embed = youtubeEmbedUrl(url);
      if (!embed) {
        showError("Link do YouTube inválido.");
      } else {
        inner.appendChild(
          el("iframe", {
            className: "fcmb-player-frame",
            src: embed,
            allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
            allowfullscreen: "true",
            frameborder: "0",
          })
        );
      }
    } else {
      var video = el("video", {
        className: "fcmb-player-video",
        controls: "true",
        autoplay: "true",
        playsinline: "true",
      });
      video.addEventListener("error", function () {
        showError("Não foi possível reproduzir o stream (formato não suportado, CORS ou link offline).");
      });
      inner.appendChild(video);

      if (kind === "hls") {
        attachHls(video, url, isLive, function () {
          showError("Falha ao carregar a transmissão HLS (verifique a URL e o CORS).");
        });
      } else if (kind === "mpegts") {
        attachMpegts(video, url, isLive, function () {
          showError("Falha ao carregar a transmissão ao vivo (MPEG-TS). Verifique a URL e o CORS do servidor.");
        });
      } else {
        video.src = url;
        video.play().catch(function () {});
      }
    }

    var closeBtn = el("button", {
      className: "fcmb-player-close",
      "aria-label": "Fechar",
      title: "Fechar (Esc)",
      html: "&times;",
      onclick: closePlayer,
    });

    var overlay = el(
      "div",
      {
        id: "fcmb-player",
        className: "fcmb-player",
        onclick: function (event) {
          if (event.target === overlay) {
            closePlayer();
          }
        },
      },
      [closeBtn, inner]
    );

    document.body.appendChild(overlay);
    document.addEventListener("keydown", onPlayerKeydown, true);
  }

  // ---------------------------------------------------------------------------
  // Slide / container construction
  // ---------------------------------------------------------------------------

  function buildSlide(item, index) {
    var children = [];

    // Background image + darkening overlay.
    if (item.BackgroundImageUrl) {
      children.push(
        el("img", {
          className: "fcmb-backdrop",
          src: item.BackgroundImageUrl,
          alt: item.Title || "",
          loading: index === 0 ? "eager" : "lazy",
        })
      );
    }
    children.push(el("div", { className: "fcmb-overlay" }));

    var content = [];

    if (item.Badge) {
      content.push(el("div", { className: "fcmb-badge", text: item.Badge }));
    }

    if (item.LogoImageUrl) {
      content.push(
        el("img", { className: "fcmb-logo", src: item.LogoImageUrl, alt: item.Title || "" })
      );
    } else if (item.Title) {
      content.push(el("h2", { className: "fcmb-title", text: item.Title }));
    }

    if (item.Subtitle) {
      content.push(el("div", { className: "fcmb-subtitle", text: item.Subtitle }));
    }

    if (item.Overview) {
      content.push(el("p", { className: "fcmb-plot", text: item.Overview }));
    }

    var type = (item.MediaType || "none").toLowerCase();
    if (type !== "none" && item.MediaUrl) {
      var isLive = type === "live";
      var label = item.ButtonText || (isLive ? "Assistir ao vivo" : "Assistir");
      var button = el(
        "button",
        {
          className: "fcmb-play-button" + (isLive ? " fcmb-play-live" : ""),
          type: "button",
          onclick: function (event) {
            event.preventDefault();
            event.stopPropagation();
            openPlayer(item);
          },
        },
        [
          el("span", { className: "fcmb-play-icon", html: isLive ? "&#9679;" : "&#9658;" }),
          el("span", { className: "fcmb-play-text", text: label }),
        ]
      );
      content.push(el("div", { className: "fcmb-buttons" }, [button]));
    }

    children.push(el("div", { className: "fcmb-content" }, content));

    return el(
      "div",
      {
        className: "fcmb-slide" + (index === 0 ? " active" : ""),
        "data-index": String(index),
      },
      children
    );
  }

  function buildContainer() {
    var slides = STATE.items.map(buildSlide);

    var arrows = [];
    if (STATE.items.length > 1) {
      arrows.push(
        el("button", {
          className: "fcmb-arrow fcmb-arrow-left",
          type: "button",
          "aria-label": "Anterior",
          html: "&#10094;",
          onclick: function () {
            prevSlide(true);
          },
        })
      );
      arrows.push(
        el("button", {
          className: "fcmb-arrow fcmb-arrow-right",
          type: "button",
          "aria-label": "Próximo",
          html: "&#10095;",
          onclick: function () {
            nextSlide(true);
          },
        })
      );
    }

    var dots = [];
    if (STATE.items.length > 1) {
      for (var i = 0; i < STATE.items.length; i++) {
        (function (idx) {
          dots.push(
            el("button", {
              className: "fcmb-dot" + (idx === 0 ? " active" : ""),
              type: "button",
              "aria-label": "Slide " + (idx + 1),
              onclick: function () {
                goToSlide(idx, true);
              },
            })
          );
        })(i);
      }
    }

    var slidesWrap = el("div", { className: "fcmb-slides" }, slides);
    var dotsWrap = el("div", { className: "fcmb-dots" }, dots);

    var container = el(
      "div",
      { id: "fcmb-container", className: "fcmb-container" },
      [slidesWrap].concat(arrows).concat([dotsWrap])
    );

    container.addEventListener("mouseenter", function () {
      stopTimer();
    });
    container.addEventListener("mouseleave", function () {
      if (!STATE.isPaused && !STATE.playerOpen) {
        startTimer();
      }
    });

    attachTouch(container);

    return container;
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  function goToSlide(index, userInitiated) {
    var container = document.getElementById("fcmb-container");
    if (!container || STATE.items.length === 0) {
      return;
    }
    var total = STATE.items.length;
    var next = ((index % total) + total) % total;

    var slides = container.querySelectorAll(".fcmb-slide");
    var dots = container.querySelectorAll(".fcmb-dot");

    slides.forEach(function (slide, i) {
      slide.classList.toggle("active", i === next);
    });
    dots.forEach(function (dot, i) {
      dot.classList.toggle("active", i === next);
    });

    STATE.currentIndex = next;

    if (userInitiated && !STATE.isPaused && !STATE.playerOpen) {
      restartTimer();
    }
  }

  function nextSlide(userInitiated) {
    goToSlide(STATE.currentIndex + 1, userInitiated);
  }

  function prevSlide(userInitiated) {
    goToSlide(STATE.currentIndex - 1, userInitiated);
  }

  function startTimer() {
    if (STATE.timer || STATE.items.length < 2) {
      return;
    }
    STATE.timer = setInterval(function () {
      if (!STATE.playerOpen) {
        nextSlide(false);
      }
    }, CONFIG.rotationInterval);
  }

  function stopTimer() {
    if (STATE.timer) {
      clearInterval(STATE.timer);
      STATE.timer = null;
    }
  }

  function restartTimer() {
    stopTimer();
    startTimer();
  }

  function attachTouch(container) {
    var startX = 0;
    var tracking = false;
    container.addEventListener(
      "touchstart",
      function (event) {
        tracking = true;
        startX = event.touches[0].clientX;
      },
      { passive: true }
    );
    container.addEventListener(
      "touchend",
      function (event) {
        if (!tracking) {
          return;
        }
        tracking = false;
        var delta = event.changedTouches[0].clientX - startX;
        if (Math.abs(delta) >= CONFIG.minSwipeDistance) {
          if (delta < 0) {
            nextSlide(true);
          } else {
            prevSlide(true);
          }
        }
      },
      { passive: true }
    );
  }

  function onKeydown(event) {
    if (STATE.playerOpen || !document.getElementById("fcmb-container") || !isHomePage()) {
      return;
    }
    if (event.key === "ArrowRight") {
      nextSlide(true);
    } else if (event.key === "ArrowLeft") {
      prevSlide(true);
    }
  }

  // ---------------------------------------------------------------------------
  // Placement / visibility on the home page
  // ---------------------------------------------------------------------------

  function ensureMounted() {
    if (!isHomePage()) {
      // Leaving home: tear down the active player so nothing keeps playing.
      if (STATE.playerOpen) {
        closePlayer();
      }
      stopTimer();
      return;
    }

    if (document.getElementById("fcmb-container")) {
      return; // already mounted
    }

    var homeSections = document.querySelector(
      ".pageTabContent.is-active .homeSectionsContainer, .homeSectionsContainer"
    );
    if (!homeSections || !homeSections.parentNode) {
      return; // home not ready yet
    }

    var container = buildContainer();
    homeSections.parentNode.insertBefore(container, homeSections);

    STATE.currentIndex = 0;
    goToSlide(0, false);
    startTimer();
  }

  function initObservers() {
    var observer = new MutationObserver(function () {
      ensureMounted();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("hashchange", ensureMounted);
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopTimer();
      } else if (!STATE.isPaused && !STATE.playerOpen && document.getElementById("fcmb-container")) {
        startTimer();
      }
    });

    ensureMounted();
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  function ready() {
    return (
      window.ApiClient &&
      typeof window.ApiClient.getUrl === "function" &&
      window.ApiClient._currentUser &&
      window.ApiClient._currentUser.Id
    );
  }

  function init() {
    loadItems().then(function (items) {
      STATE.items = sanitizeItems(items);
      if (STATE.items.length === 0) {
        console.warn("Full Custom Media Bar: no custom items configured.");
        return;
      }
      initObservers();
      console.log("Full Custom Media Bar: initialized with " + STATE.items.length + " item(s).");
    });
  }

  STATE.bootstrapInterval = setInterval(function () {
    if (ready()) {
      clearInterval(STATE.bootstrapInterval);
      STATE.bootstrapInterval = null;
      init();
    }
  }, CONFIG.retryInterval);

  window.__FullCustomMediaBar = {
    CONFIG: CONFIG,
    STATE: STATE,
    next: function () {
      nextSlide(true);
    },
    prev: function () {
      prevSlide(true);
    },
    goTo: function (i) {
      goToSlide(i, true);
    },
  };
})();
