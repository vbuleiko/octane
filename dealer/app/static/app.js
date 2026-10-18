(function () {
  "use strict";
  document.documentElement.classList.add("js");
  const csrf = document.querySelector('meta[name="csrf"]')?.content || "";
  const isDemo = document.body.dataset.demo === "1";

  function post(url, body) {
    body = body || new FormData();
    body.append("csrf", csrf);
    return fetch(url, {
      method: "POST",
      body,
      credentials: "same-origin",
      headers: { "X-Requested-With": "fetch" },
    });
  }

  function notSaved() { alert("That wasn't saved. Check your internet connection and try again."); }
  function refresh() { location.replace(location.href); }
  function markThen(url, delay) {
    post(url).then((r) => (r.ok ? setTimeout(refresh, delay) : notSaved())).catch(notSaved);
  }

  // --- demo: show the WhatsApp text instead of opening WhatsApp -------------------
  const preview = document.getElementById("preview-dialog");
  let previewMark = null;
  function showPreview(el) {
    document.getElementById("preview-text").textContent = el.dataset.msg || "";
    previewMark = el.dataset.mark || null;
    preview.showModal();
  }
  document.getElementById("preview-ok")?.addEventListener("click", () => {
    if (previewMark) markThen(previewMark, 0);
    else preview.close();
  });

  // --- clicks ---------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const close = e.target.closest("[data-close]");
    if (close) {
      close.closest("dialog").close();
      return;
    }
    const ask = e.target.closest("[data-confirm-form]");
    if (ask && !confirm(ask.dataset.confirmForm)) {
      e.preventDefault();
      return;
    }
    const pv = e.target.closest("[data-preview]");
    if (pv && isDemo) {
      e.preventDefault();
      showPreview(pv);
      return;
    }
    // a WhatsApp answer that also moves the lead to "Contacted"
    const mark = e.target.closest("[data-mark]");
    if (mark && mark.dataset.mark) markThen(mark.dataset.mark, 1500);

    const copy = e.target.closest("[data-copy], [data-copy-text]");
    if (copy) {
      const src = copy.dataset.copyText || copy.closest(".copy-row, section, .card")?.querySelector("[data-copy-src]")?.value || "";
      navigator.clipboard?.writeText(src).then(() => {
        const was = copy.innerHTML;
        copy.classList.add("is-done");
        copy.textContent = "Copied";
        setTimeout(() => { copy.innerHTML = was; copy.classList.remove("is-done"); }, 1600);
      }, () => alert(src));
    }
  });

  document.addEventListener("submit", (e) => {
    const f = e.target;
    const msg = f.dataset.confirm;
    if (msg && !confirm(msg)) e.preventDefault();
    if (e.defaultPrevented) return;
    // a second tap while a slow network still sends the first one would save the car twice
    if (Date.now() - (f.sentAt || 0) < 10000) e.preventDefault();
    else f.sentAt = Date.now();
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) document.querySelectorAll("form").forEach((f) => { f.sentAt = 0; });
  });

  // --- look switch: no reload, so the page stays where it is ---------------------
  function loadLook(href) {
    if (!href) return Promise.resolve(null);  // Classic is style.css alone, with system fonts
    return new Promise((ok, fail) => {
      const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href, media: "print" });
      link.onload = () => ok(link);
      link.onerror = () => { link.remove(); fail(); };
      (document.getElementById("look-css") || document.querySelector('link[rel="stylesheet"]')).after(link);
    }).then((link) => {
      const css = [...link.sheet.cssRules].map((r) => r.cssText).join("");
      const fonts = [...document.fonts].filter((f) => css.includes(f.family.replace(/"/g, "")));
      return Promise.all(fonts.map((f) => f.load().catch(() => null))).then(() => link);
    });
  }
  function showLook(form, btn, link) {
    const top = btn.getBoundingClientRect().top;
    document.getElementById("look-css")?.remove();
    if (link) {
      link.sheet.media.mediaText = "all";
      link.id = "look-css";
    }
    document.querySelector('meta[name="theme-color"]').content = btn.dataset.bg;
    const check = form.querySelector('[aria-pressed="true"] > .icon');
    if (check) btn.append(check);
    form.querySelectorAll("[aria-pressed]").forEach((b) => b.setAttribute("aria-pressed", b === btn));
    const label = form.querySelector(".look-label b");
    if (label) label.textContent = btn.title || btn.querySelector(".theme-name")?.textContent || "";
    scrollBy(0, btn.getBoundingClientRect().top - top);
  }
  let lookTap = 0;
  document.querySelectorAll("form[data-look]").forEach((form) => {
    let tapped = null;  // e.submitter came in iOS 15.4
    form.addEventListener("click", (e) => { tapped = e.target.closest("button"); });
    form.addEventListener("submit", (e) => {
      const btn = e.submitter || tapped;
      if (!btn?.value) return;
      e.preventDefault();
      const tap = ++lookTap;
      const body = new FormData(form);
      body.set("theme", btn.value);
      const saved = fetch(form.action, {
        method: "POST", body, credentials: "same-origin", headers: { "X-Requested-With": "fetch" },
      }).then((r) => { if (!r.ok) throw new Error(r.status); });
      const look = loadLook(btn.dataset.css);
      Promise.all([look, saved])
        .then(([link]) => (tap === lookTap ? showLook(form, btn, link) : link?.remove()))
        .catch(() => { look.then((link) => link?.remove(), () => null); notSaved(); });
    });
  });

  // --- save a car's photos to the phone (share sheet), or download them as a zip ---------
  document.querySelectorAll("[data-share-photos]").forEach((a) => {
    a.addEventListener("click", async (e) => {
      if (!navigator.canShare) return;
      e.preventDefault();
      try {
        const urls = JSON.parse(a.dataset.sharePhotos);
        const files = await Promise.all(urls.map(async (u, i) => {
          const blob = await (await fetch(u)).blob();
          return new File([blob], `photo-${i + 1}.jpg`, { type: "image/jpeg" });
        }));
        if (navigator.canShare({ files })) await navigator.share({ files, title: a.dataset.title });
        else location.href = a.href;
      } catch (err) {
        if (err.name !== "AbortError") location.href = a.href;
      }
    });
  });

  const form = document.getElementById("car-form");
  if (form) carForm(form);

  // --- the car form ----------------------------------------------------------------------
  function carForm(form) {
    const $ = (sel) => form.querySelector(sel);
    const make = $("#make"), model = $("#model"), variant = $("#variant");
    let variants = [];

    function fillList(list, items, label) {
      list.replaceChildren(...items.map((it) => {
        const o = document.createElement("option");
        o.value = typeof it === "string" ? it : it.variant;
        if (label && typeof it !== "string") o.label = label(it);
        return o;
      }));
    }
    function specsText(v) {
      return [v.engine, v.transmission, v.fuel, v.body, v.drive].filter(Boolean).join(" · ");
    }
    async function loadModels() {
      if (!make.value.trim()) return;
      const r = await fetch(form.dataset.catalog + "?make=" + encodeURIComponent(make.value.trim()), { credentials: "same-origin" });
      if (r.ok) fillList($("#models"), (await r.json()).models || []);
    }
    async function loadVariants() {
      if (!make.value.trim() || !model.value.trim()) return;
      const q = "?make=" + encodeURIComponent(make.value.trim()) + "&model=" + encodeURIComponent(model.value.trim());
      const r = await fetch(form.dataset.catalog + q, { credentials: "same-origin" });
      if (!r.ok) return;
      variants = (await r.json()).variants || [];
      fillList($("#variants"), variants, specsText);
    }
    function setRadio(name, value) {
      if (!value || form.querySelector(`input[name="${name}"]:checked`)) return;
      const el = form.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
      if (el) el.checked = true;
    }
    function setIfEmpty(name, value) {
      const el = form.elements[name];
      if (el && value && !el.value) el.value = value;
    }
    function useVariant() {
      const v = variants.find((x) => x.variant.toLowerCase() === variant.value.trim().toLowerCase());
      const hint = $("#variant-hint");
      if (!v) { hint.hidden = true; return; }
      ["body", "fuel", "transmission"].forEach((k) => setRadio(k, v[k]));
      ["engine", "drive"].forEach((k) => setIfEmpty(k, v[k]));
      ["doors", "seats"].forEach((k) => setIfEmpty(k, v[k] || ""));
      hint.textContent = "Specs filled in from this variant: " + specsText(v) + ". Check them.";
      hint.hidden = false;
    }
    make.addEventListener("change", loadModels);
    model.addEventListener("change", loadVariants);
    variant.addEventListener("change", useVariant);
    variant.addEventListener("input", () => { if (variants.some((x) => x.variant === variant.value)) useVariant(); });
    if (make.value) loadModels().then(loadVariants);

    // profit at this price, only for the dealer
    const money = (el) => Number((el?.value || "").replace(/[^\d]/g, "")) || 0;
    function profit() {
      const out = $("#profit");
      const cost = money($("#cost"));
      out.hidden = !cost;
      if (cost) out.querySelector("b").textContent = rand(money($("#price")) - cost - money($("#recon")));
    }
    ["#price", "#cost", "#recon"].forEach((s) => $(s)?.addEventListener("input", profit));

    // "Write it for me"
    $("#write-it")?.addEventListener("click", async () => {
      const text = $("#description");
      if (text.value.trim() && !confirm("Replace the description you wrote?")) return;
      const r = await post(form.dataset.describe, new FormData(form));
      if (r.ok) text.value = (await r.json()).text;
    });

    photoManager(form);
    discScanner(form);
  }

  function rand(n) {
    return (n < 0 ? "-R" : "R") + Math.abs(n).toLocaleString("en-ZA").replace(/\s/g, ",");
  }

  // --- photos: shrink on the phone, upload one by one, reorder, delete -----------------------
  function photoManager(form) {
    const grid = document.getElementById("photo-grid");
    const input = document.getElementById("photo-input");
    const add = document.getElementById("photo-add");
    const max = Number(form.dataset.max) || 40;
    if (!grid || !input || !window.fetch || !HTMLCanvasElement.prototype.toBlob) return;
    let queue = Promise.resolve();
    let busy = 0;

    function count() {
      const n = grid.querySelectorAll(".photo-tile").length;
      document.getElementById("photo-count").textContent = `${n} / ${max}`;
      add.hidden = n >= max;
    }
    function shrink(file) {
      return new Promise((ok) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
          if (scale === 1 && file.size < 1.5e6 && file.type === "image/jpeg") { URL.revokeObjectURL(url); ok(file); return; }
          const c = document.createElement("canvas");
          c.width = Math.round(img.naturalWidth * scale);
          c.height = Math.round(img.naturalHeight * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          c.toBlob((b) => ok(b || file), "image/jpeg", 0.86);
        };
        img.onerror = () => { URL.revokeObjectURL(url); ok(file); };  // let the server try (or refuse) it
        img.src = url;
      });
    }
    function tile(src) {
      const f = document.createElement("figure");
      f.className = "photo-tile is-uploading";
      f.innerHTML = '<img alt=""><span>Uploading…</span>';
      f.querySelector("img").src = src;
      grid.insertBefore(f, add);
      return f;
    }
    const buttons = grid.querySelector("figcaption")?.outerHTML;
    function finish(f, data) {
      f.className = "photo-tile";
      f.dataset.id = data.id;
      f.dataset.delete = "/app/photo/" + data.id + "/delete";
      f.style.backgroundColor = data.color;
      f.innerHTML = `<img alt="" src="${data.src}"><input type="hidden" name="photo" value="${data.id}">` + (buttons || caption());
    }
    function caption() {
      const b = (attr, label, path) => `<button type="button" class="tile-btn" ${attr} aria-label="${label}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg></button>`;
      return "<figcaption>" + b('data-move="-1"', "Move left", "M15 18l-6-6 6-6") + b("data-cover", "Make it the main photo", "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z")
        + b('data-move="1"', "Move right", "m9 18 6-6-6-6") + b("data-remove", "Delete photo", "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6").replace('class="tile-btn" data-remove', 'class="tile-btn danger" data-remove') + "</figcaption>";
    }
    async function upload(file, f) {
      const body = new FormData();
      body.append("photo", await shrink(file), "photo.jpg");
      if (form.dataset.car) body.append("car", form.dataset.car);
      try {
        const r = await post(form.dataset.upload, body);
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.ok) throw new Error(data.error || "Upload failed");
        finish(f, data);
      } catch (err) {
        f.className = "photo-tile is-failed";
        f.querySelector("span").textContent = "Failed";
        f.title = err.message;
        setTimeout(() => f.remove(), 4000);
        alert(err.message.includes("photo") ? err.message : "A photo didn't upload. Check your internet connection and try again.");
      } finally {
        busy--;
        count();
      }
    }
    input.addEventListener("change", () => {
      const room = max - grid.querySelectorAll(".photo-tile").length;
      const files = [...input.files].filter((f) => f.type.startsWith("image/") || !f.type).slice(0, Math.max(0, room));
      input.value = "";  // these go up one by one, not with the form
      files.forEach((file) => {
        busy++;
        const f = tile(URL.createObjectURL(file));
        queue = queue.then(() => upload(file, f));
      });
      count();
    });
    form.addEventListener("submit", (e) => {
      if (busy > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        alert("Wait a moment: photos are still uploading.");
      }
    }, true);
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest(".tile-btn");
      if (!btn) return;
      const f = btn.closest(".photo-tile");
      if (btn.hasAttribute("data-remove")) {
        if (!confirm("Delete this photo?")) return;
        post(f.dataset.delete).then((r) => { if (r.ok) { f.remove(); count(); } else notSaved(); }).catch(notSaved);
      } else if (btn.hasAttribute("data-cover")) {
        grid.prepend(f);
      } else {
        const step = Number(btn.dataset.move);
        const other = step < 0 ? f.previousElementSibling : f.nextElementSibling;
        if (other?.classList.contains("photo-tile")) (step < 0 ? other.before(f) : other.after(f));
      }
    });
    count();
  }

  // --- licence disc scanner ------------------------------------------------------
  function discScanner(form) {
    const scanBtn = document.getElementById("scan-disc");
    const scanner = document.getElementById("scan-dialog");
    if (!scanBtn || !navigator.mediaDevices?.getUserMedia) return;  // the camera needs https
    scanBtn.hidden = false;
    const hint = document.getElementById("scan-hint");
    const video = scanner.querySelector("video");
    let stream = null;
    let decoder = null;

    async function pdf417Reader() {
      if ("BarcodeDetector" in window) {  // Android Chrome reads PDF417 by itself
        try {
          if ((await BarcodeDetector.getSupportedFormats()).includes("pdf417")) return new BarcodeDetector({ formats: ["pdf417"] });
        } catch (_) { /* fall through to our own decoder */ }
      }
      const mod = await import(scanBtn.dataset.decoder);
      return new mod.BarcodeDetector({ formats: ["pdf417"] });
    }
    function stopCamera() {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video.srcObject = null;
    }
    scanner.addEventListener("close", stopCamera);

    function fill(d) {
      const set = (name, value) => { if (value && form.elements[name]) form.elements[name].value = value; };
      set("make", d.make);
      set("model", d.model);
      if (d.variant && !form.elements.variant.value) set("variant", d.variant);
      set("colour", d.colour);
      set("reg_no", d.reg_no);
      set("vin", d.vin);
      set("engine_no", d.engine_no);
      const body = d.body && form.querySelector(`input[name="body"][value="${CSS.escape(d.body)}"]`);
      if (body) body.checked = true;
      form.querySelector(".private").open = true;
      form.elements.make.dispatchEvent(new Event("change"));
      setTimeout(() => form.elements.model.dispatchEvent(new Event("change")), 300);
      form.elements.year.focus();
    }
    async function readDisc(raw) {
      const r = await fetch(form.dataset.disc + "?code=" + encodeURIComponent(raw), { credentials: "same-origin" });
      return r.ok ? r.json() : { found: false };
    }
    scanBtn.addEventListener("click", async () => {
      hint.textContent = "Point the camera at the barcode on the licence disc.";
      scanner.showModal();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!scanner.open) return stopCamera();
        video.srcObject = stream;
        await video.play();
        decoder = decoder || (await pdf417Reader());
      } catch (e) {
        stopCamera();
        hint.textContent = e.name === "NotAllowedError"
          ? "The camera is blocked. Allow it for this site, or type the details."
          : "The scanner couldn't start on this phone. Type the details instead.";
        return;
      }
      let tried = "";
      while (stream) {
        const codes = await decoder.detect(video).catch(() => []);
        const raw = codes.map((c) => c.rawValue).find((v) => v && v.includes("%"));
        if (raw && raw !== tried) {
          tried = raw;
          const d = await readDisc(raw).catch(() => ({ found: false }));
          if (d.found && stream) {
            navigator.vibrate?.(60);
            scanner.close();
            fill(d);
            return;
          }
        }
        if (codes.length) hint.textContent = raw ? "Couldn't read this disc. Type the details instead." : "That barcode isn't a licence disc.";
        await new Promise((r) => setTimeout(r, 120));
      }
    });
  }
})();
