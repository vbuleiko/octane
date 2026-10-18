(function () {
  "use strict";
  document.documentElement.classList.add("js");
  const isDemo = document.body.dataset.demo === "1";

  // --- demo website: show the WhatsApp text instead of opening WhatsApp ---------------
  const preview = document.getElementById("preview-dialog");
  document.addEventListener("click", (e) => {
    const close = e.target.closest("[data-close]");
    if (close) { close.closest("dialog").close(); return; }
    const tap = e.target.closest("[data-tap]");
    if (tap && navigator.sendBeacon && document.body.dataset.tapUrl) {  // the dealer sees how many buyers got in touch
      const body = new FormData();
      body.append("kind", tap.dataset.tap);
      if (tap.dataset.car) body.append("car", tap.dataset.car);
      navigator.sendBeacon(document.body.dataset.tapUrl, body);
    }
    const pv = e.target.closest("[data-preview]");
    if (pv && isDemo && preview) {
      e.preventDefault();
      document.getElementById("preview-text").textContent = pv.dataset.msg || "";
      preview.showModal();
      return;
    }
    const share = e.target.closest("[data-share]");
    if (share && navigator.share) {  // the phone's own share sheet; otherwise the link opens WhatsApp
      e.preventDefault();
      navigator.share({ title: share.dataset.title, url: share.dataset.share }).catch(() => null);
      return;
    }
    const kind = e.target.closest("[data-kind]");
    if (kind) {  // "Book a test drive": the form below, with test drive picked
      const radio = document.getElementById("kind-test-drive");
      if (radio) radio.checked = true;
      setTimeout(() => document.querySelector('#enquire input[name="name"]')?.focus({ preventScroll: true }), 300);
    }
  });

  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (f.method === "get") return;
    if (Date.now() - (f.sentAt || 0) < 10000) e.preventDefault();  // a second tap on a slow network
    else f.sentAt = Date.now();
  });

  // --- filters and sorting apply as soon as they change ----------------------------------
  document.querySelectorAll("form[data-autosubmit]").forEach((form) => {
    form.addEventListener("change", (e) => {
      if (e.target.tagName !== "SELECT") return;
      if (e.target.name === "make") form.querySelector('select[name="model"]')?.remove();  // models of the old make
      form.querySelector('input[name="page"]')?.remove();
      form.requestSubmit ? form.requestSubmit() : form.submit();
    });
  });

  // --- the sell form takes up to 6 photos -----------------------------------------------------
  document.querySelectorAll("input[type=file][data-max-files]").forEach((input) => {
    input.addEventListener("change", () => {
      const max = Number(input.dataset.maxFiles);
      if (input.files.length <= max || !window.DataTransfer) return;
      const keep = new DataTransfer();
      [...input.files].slice(0, max).forEach((f) => keep.items.add(f));
      input.files = keep.files;
      alert(`Up to ${max} photos, please: we kept the first ${max}.`);
    });
  });

  // --- finance calculator --------------------------------------------------------------
  const calc = document.querySelector("form[data-calc]");
  if (calc) {
    const out = calc.querySelector("[data-monthly]");
    const num = (name) => Number((calc.elements[name]?.value || "").replace(/[^\d.]/g, "")) || 0;
    const update = () => {
      const price = num("price"), deposit = Math.min(num("deposit"), price), months = num("months");
      const rate = num("rate") / 1200, balloon = price * Math.min(num("balloon"), 50) / 100;
      const principal = price - deposit;
      let pmt = 0;
      if (principal > 0 && months > 0) {
        pmt = rate === 0 ? (principal - balloon) / months
          : (principal - balloon / Math.pow(1 + rate, months)) * rate / (1 - Math.pow(1 + rate, -months));
      }
      out.textContent = "R" + Math.max(0, Math.ceil(pmt)).toLocaleString("en-ZA").replace(/\s/g, ",");
    };
    calc.addEventListener("input", update);
    calc.addEventListener("change", update);
    calc.addEventListener("submit", (e) => { e.preventDefault(); update(); });
  }

  // --- gallery: swipe, arrows, thumbnails, full screen ----------------------------------
  const gallery = document.querySelector("[data-gallery]");
  const track = gallery?.querySelector(".gallery-track");
  if (track) {
    const slides = [...track.children];
    const current = gallery.querySelector("[data-current]");
    const thumbs = [...document.querySelectorAll(".gallery-thumbs button")];
    const lightbox = document.getElementById("lightbox");
    let index = 0;
    const go = (i, el = track) => {
      i = Math.max(0, Math.min(slides.length - 1, i));
      el.scrollTo({ left: i * el.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    const show = (i) => {
      index = i;
      current.textContent = i + 1;
      thumbs.forEach((t, n) => t.setAttribute("aria-current", n === i));
    };
    let ticking = false;
    track.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { show(Math.round(track.scrollLeft / track.clientWidth)); ticking = false; });
    }, { passive: true });
    gallery.querySelectorAll("[data-step]").forEach((b) => {
      b.hidden = false;
      b.addEventListener("click", () => go(index + Number(b.dataset.step)));
    });
    thumbs.forEach((t, n) => t.addEventListener("click", () => go(n)));
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
    });
    show(0);

    const full = gallery.querySelector("[data-full]");
    if (full && lightbox?.showModal) {
      full.hidden = false;
      const big = lightbox.querySelector(".lightbox-track");
      const bigCount = lightbox.querySelector("[data-current]");
      const open = () => {
        if (!big.children.length) {
          slides.forEach((s) => {
            const img = s.querySelector("img").cloneNode();
            img.sizes = "100vw";
            img.loading = "lazy";
            img.removeAttribute("fetchpriority");
            const fig = document.createElement("figure");
            fig.append(img);
            big.append(fig);
          });
          big.addEventListener("scroll", () => { bigCount.textContent = Math.round(big.scrollLeft / big.clientWidth) + 1; }, { passive: true });
          big.addEventListener("keydown", (e) => {
            const at = Math.round(big.scrollLeft / big.clientWidth);
            if (e.key === "ArrowRight") go(at + 1, big);
            if (e.key === "ArrowLeft") go(at - 1, big);
          });
          big.tabIndex = 0;
        }
        lightbox.showModal();
        big.scrollLeft = index * big.clientWidth;
        bigCount.textContent = index + 1;
        big.focus();
      };
      full.addEventListener("click", open);
      slides.forEach((s) => s.addEventListener("click", open));
      lightbox.addEventListener("close", () => go(Math.round(big.scrollLeft / big.clientWidth)));
    }
  }

  // --- the owner's look switch on their own website ------------------------------------------
  let lookTap = 0;
  document.querySelectorAll("form[data-look]").forEach((form) => {
    let tapped = null;
    form.addEventListener("click", (e) => { tapped = e.target.closest("button"); });
    form.addEventListener("submit", (e) => {
      const btn = e.submitter || tapped;
      if (!btn?.value) return;
      e.preventDefault();
      const tap = ++lookTap;
      const body = new FormData(form);
      body.set("theme", btn.value);
      const saved = fetch(form.action, { method: "POST", body, credentials: "same-origin", headers: { "X-Requested-With": "fetch" } })
        .then((r) => { if (!r.ok) throw new Error(r.status); });
      const look = new Promise((ok, fail) => {
        if (!btn.dataset.css) return ok(null);
        const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: btn.dataset.css, media: "print" });
        link.onload = () => ok(link);
        link.onerror = () => { link.remove(); fail(); };
        (document.getElementById("look-css") || document.querySelector('link[rel="stylesheet"]')).after(link);
      });
      Promise.all([look, saved]).then(([link]) => {
        if (tap !== lookTap) return link?.remove();
        document.getElementById("look-css")?.remove();
        if (link) { link.sheet.media.mediaText = "all"; link.id = "look-css"; }
        document.querySelector('meta[name="theme-color"]').content = btn.dataset.bg;
        form.querySelectorAll("[aria-pressed]").forEach((b) => b.setAttribute("aria-pressed", b === btn));
      }).catch(() => alert("That wasn't saved. Check your internet connection and try again."));
    });
  });
})();
