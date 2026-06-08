/**
 * Teacher ideas & memos — tagged notes with search and images (KV-backed).
 */
(function (global) {
  const DEFAULT_TAGS = ["lesson", "media", "website", "game", "hw"];
  const MAX_IMAGES = 12;
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

  let ideasCache = [];
  let knownTags = [...DEFAULT_TAGS];
  let customTags = [];
  let editingId = null;
  let selectedTags = new Set();
  let pendingImages = [];
  let filterTag = "";
  let lengthSort = "";
  let loading = false;
  let loadedOnce = false;
  let bound = false;
  let options = null;

  function slugifyTag(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]+/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function imageApiUrl(session, id) {
    return (
      "/api/teacher-ideas/image?id=" +
      encodeURIComponent(id) +
      "&teacherUsername=" +
      encodeURIComponent(session.username)
    );
  }

  function ideaSearchText(idea) {
    const imageNames = (idea.images || []).map((image) => image.name || "").join(" ");
    return [idea.text, ...(idea.tags || []), imageNames].join(" ").toLowerCase();
  }

  function ideaTextLength(idea) {
    return String(idea.text || "").trim().length;
  }

  function compareByDate(a, b) {
    return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
  }

  function updateLengthSortUi() {
    document.querySelectorAll("[data-idea-length-sort]").forEach((btn) => {
      const on = btn.getAttribute("data-idea-length-sort") === lengthSort;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function getSelectedTags() {
    return [...selectedTags];
  }

  function getPendingImagePayload() {
    return pendingImages.map((image) => ({
      id: image.id,
      mimeType: image.mimeType,
      name: image.name,
    }));
  }

  function isCustomTag(tag) {
    return customTags.includes(tag);
  }

  function mergeKnownTags(tags) {
    const merged = new Set(DEFAULT_TAGS);
    customTags.forEach((tag) => {
      const slug = slugifyTag(tag);
      if (slug) merged.add(slug);
    });
    (tags || []).forEach((tag) => {
      const slug = slugifyTag(tag);
      if (slug) merged.add(slug);
    });
    ideasCache.forEach((idea) => {
      (idea.tags || []).forEach((tag) => {
        const slug = slugifyTag(tag);
        if (slug) merged.add(slug);
      });
    });
    knownTags = [...merged].sort();
  }

  function tagPillClass(tag) {
    return DEFAULT_TAGS.includes(tag)
      ? "hw-library-tag hw-library-tag--" + tag
      : "hw-library-tag hw-library-tag--custom";
  }

  function renderTagPicks() {
    const container = document.getElementById("hw-ideas-tag-picks");
    if (!container) return;
    container.replaceChildren();
    knownTags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "hw-ideas-tag-chip";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-ideas-tag-pick" + (selectedTags.has(tag) ? " is-active" : "");
      btn.setAttribute("data-idea-tag", tag);
      btn.setAttribute("aria-pressed", selectedTags.has(tag) ? "true" : "false");
      btn.textContent = tag;
      chip.appendChild(btn);

      if (isCustomTag(tag)) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "hw-ideas-tag-remove";
        remove.setAttribute("data-idea-tag", tag);
        remove.setAttribute("aria-label", "Delete tag " + tag);
        remove.textContent = "×";
        chip.appendChild(remove);
      }

      container.appendChild(chip);
    });
  }

  function renderFilterTags() {
    const container = document.getElementById("hw-ideas-filter-tags");
    if (!container) return;
    container.replaceChildren();

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "hw-ideas-filter-tag" + (!filterTag ? " is-active" : "");
    allBtn.setAttribute("data-idea-filter", "");
    allBtn.setAttribute("aria-pressed", !filterTag ? "true" : "false");
    allBtn.textContent = "All";
    container.appendChild(allBtn);

    knownTags.forEach((tag) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-ideas-filter-tag" + (filterTag === tag ? " is-active" : "");
      btn.setAttribute("data-idea-filter", tag);
      btn.setAttribute("aria-pressed", filterTag === tag ? "true" : "false");
      btn.textContent = tag;
      container.appendChild(btn);
    });
  }

  function refreshTagUi() {
    renderTagPicks();
    renderFilterTags();
  }

  function setComposeStatus(msg) {
    const el = document.getElementById("hw-ideas-compose-status");
    if (el) el.textContent = msg;
  }

  function clearPendingImages() {
    pendingImages.forEach((image) => {
      if (image.localUrl) URL.revokeObjectURL(image.localUrl);
    });
    pendingImages = [];
    renderComposeImages();
  }

  function renderComposeImages() {
    const grid = document.getElementById("hw-ideas-image-grid");
    if (!grid) return;
    grid.replaceChildren();
    grid.hidden = !pendingImages.length;

    pendingImages.forEach((image) => {
      const li = document.createElement("li");
      li.className = "hw-ideas-image-item";

      const img = document.createElement("img");
      img.className = "hw-ideas-image-thumb";
      img.src = image.url || image.localUrl || "";
      img.alt = image.name || "Attached image";
      img.loading = "lazy";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "hw-ideas-image-remove";
      remove.setAttribute("aria-label", "Remove image");
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        void removePendingImage(image.id);
      });

      li.append(img, remove);
      grid.appendChild(li);
    });
  }

  function resetCompose() {
    editingId = null;
    selectedTags = new Set();
    clearPendingImages();
    const text = document.getElementById("hw-ideas-text");
    const cancel = document.getElementById("hw-ideas-cancel-edit");
    const save = document.getElementById("hw-ideas-save-btn");
    const newTag = document.getElementById("hw-ideas-new-tag");
    const drop = document.getElementById("hw-ideas-compose-drop");
    if (text) text.value = "";
    if (newTag) newTag.value = "";
    if (cancel) cancel.hidden = true;
    if (save) save.textContent = "Save idea";
    if (drop) drop.classList.remove("is-dragover");
    refreshTagUi();
    setComposeStatus("Jot something down, paste images, or drop files here.");
  }

  function startEdit(idea) {
    editingId = idea.id;
    selectedTags = new Set(idea.tags || []);
    clearPendingImages();
    const session = options?.getTeacherSession?.();
    (idea.images || []).forEach((image) => {
      pendingImages.push({
        id: image.id,
        mimeType: image.mimeType,
        name: image.name,
        url: session ? imageApiUrl(session, image.id) : "",
      });
    });
    renderComposeImages();

    const text = document.getElementById("hw-ideas-text");
    const cancel = document.getElementById("hw-ideas-cancel-edit");
    const save = document.getElementById("hw-ideas-save-btn");
    if (text) {
      text.value = idea.text || "";
      text.focus();
    }
    if (cancel) cancel.hidden = false;
    if (save) save.textContent = "Update idea";
    refreshTagUi();
    setComposeStatus("Editing idea from " + formatDate(idea.createdAt) + ".");
    document.getElementById("hw-ideas-compose-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function prepareImageFile(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      throw new Error("Use a JPEG, PNG, GIF, or WebP image.");
    }
    if (file.size <= 1.5 * 1024 * 1024 && ["image/jpeg", "image/webp"].includes(file.type)) {
      return file;
    }

    const bitmap = await createImageBitmap(file);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.85);
    });
    if (!blob) return file;
    const baseName = String(file.name || "image").replace(/\.[^.]+$/, "") || "image";
    return new File([blob], baseName + ".jpg", { type: "image/jpeg" });
  }

  async function uploadImageFile(session, file) {
    const prepared = await prepareImageFile(file);
    if (prepared.size > MAX_IMAGE_BYTES) {
      throw new Error("Image must be under 4 MB.");
    }

    const body = new FormData();
    body.append("teacherUsername", session.username);
    body.append("image", prepared, prepared.name || "image.jpg");

    const res = await fetch("/api/teacher-ideas/upload-image", {
      method: "POST",
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not upload image.");
    return data;
  }

  async function deleteImageAsset(session, id) {
    const res = await fetch("/api/teacher-ideas/images/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherUsername: session.username,
        id,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not delete image.");
    return data;
  }

  async function removePendingImage(id) {
    const session = options?.getTeacherSession?.();
    const image = pendingImages.find((entry) => entry.id === id);
    if (!image) return;

    pendingImages = pendingImages.filter((entry) => entry.id !== id);
    if (image.localUrl) URL.revokeObjectURL(image.localUrl);
    renderComposeImages();

    if (session && session.role === "teacher" && !editingId && !String(id).startsWith("uploading-")) {
      try {
        await deleteImageAsset(session, id);
      } catch {
        /* already removed or not persisted */
      }
    }
  }

  async function addImageFiles(fileList) {
    const session = options?.getTeacherSession?.();
    if (!session || session.role !== "teacher") {
      options?.showToast?.("Teacher login required.");
      return;
    }

    const files = [...fileList].filter((file) => String(file.type || "").startsWith("image/"));
    if (!files.length) {
      setComposeStatus("Only image files can be attached.");
      return;
    }
    if (pendingImages.length >= MAX_IMAGES) {
      setComposeStatus("Max " + MAX_IMAGES + " images per idea.");
      options?.showToast?.("Max " + MAX_IMAGES + " images per idea.");
      return;
    }

    const drop = document.getElementById("hw-ideas-compose-drop");
    if (drop) drop.classList.remove("is-dragover");

    for (const file of files) {
      if (pendingImages.length >= MAX_IMAGES) break;
      const localUrl = URL.createObjectURL(file);
      const placeholderId = "uploading-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      pendingImages.push({
        id: placeholderId,
        mimeType: file.type,
        name: file.name,
        localUrl,
        uploading: true,
      });
      renderComposeImages();
      setComposeStatus("Uploading image…");

      try {
        const uploaded = await uploadImageFile(session, file);
        const idx = pendingImages.findIndex((entry) => entry.id === placeholderId);
        if (idx === -1) continue;
        URL.revokeObjectURL(pendingImages[idx].localUrl);
        pendingImages[idx] = {
          id: uploaded.id,
          mimeType: uploaded.mimeType,
          name: uploaded.name || file.name,
          url: uploaded.url || imageApiUrl(session, uploaded.id),
        };
        renderComposeImages();
        setComposeStatus("Image attached.");
      } catch (err) {
        pendingImages = pendingImages.filter((entry) => entry.id !== placeholderId);
        URL.revokeObjectURL(localUrl);
        renderComposeImages();
        setComposeStatus(err.message || "Could not upload image.");
        options?.showToast?.(err.message || "Could not upload image.");
      }
    }
  }

  function renderIdeaImages(idea, session, container) {
    if (!idea.images || !idea.images.length || !session) return;
    const gallery = document.createElement("div");
    gallery.className = "hw-ideas-item__images";

    idea.images.forEach((image) => {
      const link = document.createElement("a");
      link.className = "hw-ideas-item__image-link";
      link.href = imageApiUrl(session, image.id);
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const img = document.createElement("img");
      img.className = "hw-ideas-item__image";
      img.src = imageApiUrl(session, image.id);
      img.alt = image.name || "Memo image";
      img.loading = "lazy";

      link.appendChild(img);
      gallery.appendChild(link);
    });

    container.appendChild(gallery);
  }

  async function fetchIdeas(session) {
    const res = await fetch(
      "/api/teacher-ideas?teacherUsername=" + encodeURIComponent(session.username)
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not load ideas.");
    }
    const data = await res.json();
    return {
      ideas: Array.isArray(data.ideas) ? data.ideas : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      customTags: Array.isArray(data.customTags) ? data.customTags : [],
    };
  }

  async function saveIdea(session, payload) {
    const res = await fetch("/api/teacher-ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherUsername: session.username,
        ...payload,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not save idea.");
    return data;
  }

  async function removeCustomTag(session, tag) {
    const res = await fetch("/api/teacher-ideas/tags/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherUsername: session.username,
        tag,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not delete tag.");
    return data.tag || tag;
  }

  async function addCustomTag(session, rawTag) {
    const tag = slugifyTag(rawTag);
    if (!tag) throw new Error("Use letters, numbers, or hyphens (max 24 chars).");

    const res = await fetch("/api/teacher-ideas/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherUsername: session.username,
        tag,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not add tag.");
    return data.tag || tag;
  }

  async function deleteIdea(session, id) {
    const res = await fetch("/api/teacher-ideas/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherUsername: session.username,
        id,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not delete idea.");
    return data;
  }

  function renderList() {
    const list = document.getElementById("hw-ideas-list");
    const meta = document.getElementById("hw-ideas-meta");
    const session = options?.getTeacherSession?.();
    if (!list) return;

    if (loading) {
      if (meta) meta.textContent = "Loading ideas…";
      global.HwLoading?.showListWait(list, {
        message: "Loading ideas & memos…",
        extraClass: "hw-ideas-item",
      });
      return;
    }

    const searchInput = document.getElementById("hw-ideas-search");
    const q = String(searchInput?.value || "")
      .trim()
      .toLowerCase();

    let filtered = ideasCache.slice();
    if (filterTag) {
      filtered = filtered.filter((idea) => (idea.tags || []).includes(filterTag));
    }
    if (q) {
      filtered = filtered.filter((idea) => ideaSearchText(idea).includes(q));
    }
    if (lengthSort === "longest") {
      filtered.sort(
        (a, b) => ideaTextLength(b) - ideaTextLength(a) || compareByDate(a, b)
      );
    } else if (lengthSort === "shortest") {
      filtered.sort(
        (a, b) => ideaTextLength(a) - ideaTextLength(b) || compareByDate(a, b)
      );
    } else {
      filtered.sort(compareByDate);
    }

    list.replaceChildren();
    if (meta) {
      meta.textContent =
        filtered.length +
        " idea" +
        (filtered.length === 1 ? "" : "s") +
        (q ? ' matching “' + searchInput.value.trim() + "”" : "") +
        (filterTag ? " · tag: " + filterTag : "") +
        (lengthSort === "longest"
          ? " · longest first"
          : lengthSort === "shortest"
            ? " · shortest first"
            : "") +
        (ideasCache.length !== filtered.length ? " of " + ideasCache.length : "");
    }

    if (!filtered.length) {
      const li = document.createElement("li");
      li.className = "hw-ideas-item hw-ideas-item--empty";
      const p = document.createElement("p");
      p.textContent = ideasCache.length
        ? "No ideas match. Try another keyword or tag."
        : "Nothing saved yet — add your first idea above.";
      li.appendChild(p);
      list.appendChild(li);
      return;
    }

    filtered.forEach((idea) => {
      const li = document.createElement("li");
      li.className = "hw-ideas-item" + (idea.id === editingId ? " hw-ideas-item--editing" : "");

      const main = document.createElement("div");
      main.className = "hw-ideas-item__main";

      const date = document.createElement("p");
      date.className = "hw-ideas-item__date";
      date.textContent = formatDate(idea.updatedAt || idea.createdAt);

      main.appendChild(date);

      if (idea.text) {
        const body = document.createElement("p");
        body.className = "hw-ideas-item__text";
        body.textContent = idea.text;
        main.appendChild(body);
      }

      renderIdeaImages(idea, session, main);

      if (idea.tags && idea.tags.length) {
        const tags = document.createElement("div");
        tags.className = "hw-library-tags";
        idea.tags.forEach((tag) => {
          const pill = document.createElement("span");
          pill.className = tagPillClass(tag);
          pill.textContent = tag;
          tags.appendChild(pill);
        });
        main.appendChild(tags);
      }

      const actions = document.createElement("div");
      actions.className = "hw-ideas-item__actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--ghost btn--sm";
      editBtn.textContent = idea.id === editingId ? "Editing…" : "Edit";
      if (idea.id === editingId) editBtn.disabled = true;
      editBtn.addEventListener("click", () => startEdit(idea));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--ghost btn--sm";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        if (!window.confirm("Delete this idea?")) return;
        const activeSession = options?.getTeacherSession?.();
        if (!activeSession || activeSession.role !== "teacher") return;
        try {
          await deleteIdea(activeSession, idea.id);
          ideasCache = ideasCache.filter((entry) => entry.id !== idea.id);
          mergeKnownTags(knownTags);
          if (editingId === idea.id) resetCompose();
          else refreshTagUi();
          renderList();
          options?.showToast?.("Idea deleted.");
        } catch (err) {
          options?.showToast?.(err.message || "Could not delete.");
        }
      });

      actions.append(editBtn, delBtn);
      li.append(main, actions);
      list.appendChild(li);
    });
  }

  async function reloadIdeas() {
    const session = options?.getTeacherSession?.();
    if (!session || session.role !== "teacher") return;
    if (loading) return;

    loading = true;
    renderList();
    try {
      const data = await fetchIdeas(session);
      ideasCache = data.ideas;
      customTags = data.customTags.map(slugifyTag).filter(Boolean);
      mergeKnownTags(data.tags);
      if (filterTag && !knownTags.includes(filterTag)) filterTag = "";
      refreshTagUi();
      loadedOnce = true;
    } catch (err) {
      const meta = document.getElementById("hw-ideas-meta");
      if (meta) meta.textContent = err.message || "Could not load ideas.";
    } finally {
      loading = false;
      renderList();
    }
  }

  function reloadIfNeeded() {
    if (!loadedOnce && !loading) void reloadIdeas();
  }

  async function handleAddTag() {
    const session = options?.getTeacherSession?.();
    if (!session || session.role !== "teacher") {
      options?.showToast?.("Teacher login required.");
      return;
    }
    const input = document.getElementById("hw-ideas-new-tag");
    const raw = String(input?.value || "").trim();
    if (!raw) {
      setComposeStatus("Type a tag name first.");
      return;
    }
    try {
      const tag = await addCustomTag(session, raw);
      if (!customTags.includes(tag)) customTags.push(tag);
      customTags.sort();
      mergeKnownTags(knownTags);
      selectedTags.add(tag);
      if (input) input.value = "";
      refreshTagUi();
      setComposeStatus("Tag “" + tag + "” added — selected for this idea.");
      options?.showToast?.("Tag added.");
    } catch (err) {
      setComposeStatus(err.message || "Could not add tag.");
      options?.showToast?.(err.message || "Could not add tag.");
    }
  }

  async function handleDeleteTag(tag) {
    const session = options?.getTeacherSession?.();
    if (!session || session.role !== "teacher") {
      options?.showToast?.("Teacher login required.");
      return;
    }
    if (!tag || !isCustomTag(tag)) {
      options?.showToast?.("Built-in tags cannot be deleted.");
      return;
    }
    if (
      !window.confirm(
        'Delete tag “' +
          tag +
          '”? It will be removed from your tag list and stripped from any ideas that use it.'
      )
    ) {
      return;
    }
    try {
      await removeCustomTag(session, tag);
      customTags = customTags.filter((entry) => entry !== tag);
      selectedTags.delete(tag);
      if (filterTag === tag) filterTag = "";
      await reloadIdeas();
      options?.showToast?.("Tag deleted.");
    } catch (err) {
      setComposeStatus(err.message || "Could not delete tag.");
      options?.showToast?.(err.message || "Could not delete tag.");
    }
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    const form = document.getElementById("hw-ideas-compose-form");
    const search = document.getElementById("hw-ideas-search");
    const cancel = document.getElementById("hw-ideas-cancel-edit");
    const addTagBtn = document.getElementById("hw-ideas-add-tag");
    const newTagInput = document.getElementById("hw-ideas-new-tag");
    const tagPicks = document.getElementById("hw-ideas-tag-picks");
    const filterTags = document.getElementById("hw-ideas-filter-tags");
    const dropZone = document.getElementById("hw-ideas-compose-drop");
    const textArea = document.getElementById("hw-ideas-text");
    const fileInput = document.getElementById("hw-ideas-file-input");
    const attachBtn = document.getElementById("hw-ideas-attach-btn");

    tagPicks?.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".hw-ideas-tag-remove");
      if (removeBtn) {
        e.preventDefault();
        void handleDeleteTag(removeBtn.getAttribute("data-idea-tag"));
        return;
      }
      const btn = e.target.closest(".hw-ideas-tag-pick");
      if (!btn) return;
      const tag = btn.getAttribute("data-idea-tag");
      if (!tag) return;
      if (selectedTags.has(tag)) selectedTags.delete(tag);
      else selectedTags.add(tag);
      refreshTagUi();
    });

    filterTags?.addEventListener("click", (e) => {
      const btn = e.target.closest(".hw-ideas-filter-tag");
      if (!btn) return;
      const next = btn.getAttribute("data-idea-filter") || "";
      filterTag = next && next === filterTag ? "" : next;
      renderFilterTags();
      renderList();
    });

    document.querySelectorAll("[data-idea-length-sort]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.getAttribute("data-idea-length-sort") || "";
        lengthSort = next && next === lengthSort ? "" : next;
        updateLengthSortUi();
        renderList();
      });
    });
    updateLengthSortUi();

    attachBtn?.addEventListener("click", () => fileInput?.click());

    fileInput?.addEventListener("change", () => {
      if (!fileInput.files?.length) return;
      void addImageFiles(fileInput.files);
      fileInput.value = "";
    });

    const markDrag = (on) => {
      if (dropZone) dropZone.classList.toggle("is-dragover", on);
    };

    dropZone?.addEventListener("dragenter", (e) => {
      e.preventDefault();
      markDrag(true);
    });
    dropZone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      markDrag(true);
    });
    dropZone?.addEventListener("dragleave", (e) => {
      if (e.currentTarget === dropZone && !dropZone.contains(e.relatedTarget)) {
        markDrag(false);
      }
    });
    dropZone?.addEventListener("drop", (e) => {
      e.preventDefault();
      markDrag(false);
      if (e.dataTransfer?.files?.length) {
        void addImageFiles(e.dataTransfer.files);
      }
    });

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (!imageFiles.length) return;
      e.preventDefault();
      void addImageFiles(imageFiles);
    };

    textArea?.addEventListener("paste", handlePaste);
    dropZone?.addEventListener("paste", handlePaste);

    if (search) {
      search.addEventListener("input", renderList);
    }

    if (cancel) {
      cancel.addEventListener("click", resetCompose);
    }

    addTagBtn?.addEventListener("click", () => {
      void handleAddTag();
    });

    newTagInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleAddTag();
      }
    });

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const session = options?.getTeacherSession?.();
        if (!session || session.role !== "teacher") {
          options?.showToast?.("Teacher login required.");
          return;
        }
        const textEl = document.getElementById("hw-ideas-text");
        const text = String(textEl?.value || "").trim();
        const images = getPendingImagePayload().filter((image) => !String(image.id).startsWith("uploading-"));
        if (!text && !images.length) {
          setComposeStatus("Add some text or at least one image before saving.");
          return;
        }
        if (pendingImages.some((image) => image.uploading)) {
          setComposeStatus("Wait for images to finish uploading.");
          return;
        }
        const saveBtn = document.getElementById("hw-ideas-save-btn");
        if (saveBtn) saveBtn.disabled = true;
        try {
          const payload = { text, tags: getSelectedTags(), images };
          if (editingId) payload.id = editingId;
          const result = await saveIdea(session, payload);
          await reloadIdeas();
          resetCompose();
          options?.showToast?.(result.message || "Saved.");
        } catch (err) {
          setComposeStatus(err.message || "Could not save.");
          options?.showToast?.(err.message || "Could not save.");
        } finally {
          if (saveBtn) saveBtn.disabled = false;
        }
      });
    }
  }

  function init(opts) {
    options = opts || {};
    bindOnce();
    setComposeStatus("Jot something down, paste images, or drop files here.");
    void reloadIdeas();
  }

  global.HwTeacherIdeas = { init, reload: reloadIdeas, reloadIfNeeded, renderList };
})(window);
