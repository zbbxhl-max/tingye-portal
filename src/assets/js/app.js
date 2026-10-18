import { LINK_GROUPS, SITE_CONFIG } from "./config.js";

const linkDefaults = new Map(
  SITE_CONFIG.links.map((link) => [link.id, link.defaultUrl || ""])
);

const state = {
  overrides: {},
  storageAvailable: true,
  lastFocus: null
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".localhost")
  ) {
    return true;
  }

  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return false;
  }

  const parts = host.split(".").map(Number);
  if (parts.some((part) => part < 0 || part > 255)) {
    return false;
  }

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
  );
}

function validateUrl(rawValue) {
  const value = String(rawValue || "").trim();

  if (!value) {
    return {
      ok: true,
      url: "",
      local: false,
      message: "留空后，此入口会显示为“尚未配置”。"
    };
  }

  if (value.length > 2048) {
    return { ok: false, message: "地址过长，请填写 2048 个字符以内的 URL。" };
  }

  if (
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^\\\\/.test(value) ||
    /^(?:file|javascript|data|vbscript):/i.test(value)
  ) {
    return {
      ok: false,
      message: "请使用 http 或 https 地址，不能填写本机路径或其他协议。"
    };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return {
      ok: false,
      message: "地址格式不完整，请包含 http:// 或 https://。"
    };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      ok: false,
      message: "仅支持 http:// 或 https:// 开头的地址。"
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      message: "地址中不能包含用户名或密码。"
    };
  }

  const local = isPrivateHost(parsed.hostname);
  const insecureRemote = parsed.protocol === "http:" && !local;

  let message = "公网 HTTPS 地址。";
  if (local) {
    message = "本机或局域网地址，仅在对应设备或同一网络内可访问。";
  } else if (insecureRemote) {
    message = "这是未加密的 HTTP 地址，请确认来源可信。";
  }

  return {
    ok: true,
    url: parsed.href,
    local,
    insecureRemote,
    message
  };
}

function recoverStorage() {
  try {
    localStorage.removeItem(SITE_CONFIG.storageKey);
  } catch {
    state.storageAvailable = false;
  }
}

function loadOverrides() {
  let storedValue;

  try {
    storedValue = localStorage.getItem(SITE_CONFIG.storageKey);
  } catch {
    state.storageAvailable = false;
    return {};
  }

  if (!storedValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(storedValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid storage shape");
    }

    const clean = {};
    let repaired = false;

    for (const [id, rawValue] of Object.entries(parsed)) {
      if (!linkDefaults.has(id) || typeof rawValue !== "string") {
        repaired = true;
        continue;
      }

      const result = validateUrl(rawValue);
      if (!result.ok) {
        repaired = true;
        continue;
      }

      clean[id] = result.url;
      if (result.url !== rawValue) repaired = true;
    }

    if (repaired) {
      try {
        localStorage.setItem(SITE_CONFIG.storageKey, JSON.stringify(clean));
      } catch {
        state.storageAvailable = false;
      }
    }

    return clean;
  } catch {
    recoverStorage();
    return {};
  }
}

function saveOverrides(nextOverrides) {
  state.overrides = nextOverrides;

  try {
    if (Object.keys(nextOverrides).length) {
      localStorage.setItem(
        SITE_CONFIG.storageKey,
        JSON.stringify(nextOverrides)
      );
    } else {
      localStorage.removeItem(SITE_CONFIG.storageKey);
    }
    state.storageAvailable = true;
  } catch {
    state.storageAvailable = false;
  }
}

function getUrlForLink(id) {
  if (Object.hasOwn(state.overrides, id)) {
    return state.overrides[id];
  }
  return linkDefaults.get(id) || "";
}

function getValidatedLinkState(id) {
  const result = validateUrl(getUrlForLink(id));
  return result.ok
    ? result
    : { ok: false, url: "", local: false, message: result.message };
}

function fillAction(container, link, result, { compact = false } = {}) {
  container.replaceChildren();

  if (!result.url) {
    const status = document.createElement("span");
    status.className = "status-pill status-pill--empty";
    status.textContent = "尚未配置";
    container.append(status);
    return;
  }

  const anchor = document.createElement("a");
  anchor.className = compact
    ? "text-link text-link--compact"
    : "button button--small button--quiet";
  anchor.href = result.url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = link.actionLabel;

  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";
  anchor.append(" ", arrow);
  container.append(anchor);
}

function renderCard(card) {
  const id = card.dataset.linkCard;
  const link = SITE_CONFIG.links.find((item) => item.id === id);
  if (!link) return;

  const result = getValidatedLinkState(id);
  const status = card.querySelector("[data-link-status]");
  const note = card.querySelector("[data-link-note]");
  const action = card.querySelector("[data-link-action]");

  card.dataset.linkState = result.url ? "ready" : "empty";

  if (status) {
    status.className = `status-pill ${
      result.url ? "status-pill--ready" : "status-pill--empty"
    }`;
    status.textContent = result.url ? "已配置" : "尚未配置";
  }

  if (note) {
    if (!result.url) {
      note.textContent = "可在“配置入口”中添加公开访问地址。";
    } else if (result.local) {
      note.textContent = "本机或局域网地址，仅对应设备或同一网络可访问。";
      note.classList.add("is-warning");
    } else if (result.insecureRemote) {
      note.textContent = "未加密的 HTTP 地址，请确认来源可信。";
      note.classList.add("is-warning");
    } else {
      note.textContent = "将在新标签页打开外部入口。";
      note.classList.remove("is-warning");
    }
  }

  if (action) {
    fillAction(action, link, result);
  }
}

function renderMiniCard(card) {
  const id = card.dataset.linkMini;
  const link = SITE_CONFIG.links.find((item) => item.id === id);
  if (!link) return;

  const result = getValidatedLinkState(id);
  const status = card.querySelector("[data-link-mini-status]");
  const action = card.querySelector("[data-link-mini-action]");

  if (status) {
    status.textContent = result.url
      ? result.local
        ? "本机入口已配置"
        : "公开入口已配置"
      : "尚未配置";
    status.className = `mini-status ${
      result.url ? "mini-status--ready" : "mini-status--empty"
    }`;
  }

  if (action) {
    fillAction(action, link, result, { compact: true });
  }
}

function renderAllLinks() {
  document.querySelectorAll("[data-link-card]").forEach(renderCard);
  document.querySelectorAll("[data-link-mini]").forEach(renderMiniCard);

  const configured = SITE_CONFIG.links.filter(
    (link) => getValidatedLinkState(link.id).url
  ).length;
  const local = SITE_CONFIG.links.filter(
    (link) => getValidatedLinkState(link.id).local
  ).length;

  document.querySelectorAll("[data-configured-count]").forEach((element) => {
    element.textContent = String(configured);
  });
  document.querySelectorAll("[data-total-link-count]").forEach((element) => {
    element.textContent = String(SITE_CONFIG.links.length);
  });
  document.querySelectorAll("[data-local-link-count]").forEach((element) => {
    element.textContent = String(local);
  });
  document.querySelectorAll("[data-updated-at]").forEach((element) => {
    element.textContent = SITE_CONFIG.updatedAt;
  });
  document.querySelectorAll("[data-site-version]").forEach((element) => {
    element.textContent = SITE_CONFIG.version;
  });
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
  document.querySelectorAll("[data-storage-status]").forEach((element) => {
    element.textContent = state.storageAvailable
      ? "设置会保存在当前浏览器中。"
      : "当前浏览器禁止本地存储，本次设置仅在当前页面有效。";
  });
}

function buildConfigDialog() {
  if (document.querySelector("#link-config-dialog")) return;

  const groupedLinks = LINK_GROUPS.map((group) => {
    const fields = SITE_CONFIG.links
      .filter((link) => link.group === group.id)
      .map(
        (link) => `
          <div class="field">
            <label for="link-${escapeHtml(link.id)}">${escapeHtml(link.title)}</label>
            <input
              id="link-${escapeHtml(link.id)}"
              name="${escapeHtml(link.id)}"
              type="text"
              inputmode="url"
              autocomplete="url"
              spellcheck="false"
              data-link-input
              aria-describedby="help-${escapeHtml(link.id)} error-${escapeHtml(link.id)}"
              placeholder="https://example.com/"
            >
            <p class="field__help" id="help-${escapeHtml(link.id)}" data-field-note>
              留空表示尚未配置；只接受 http:// 或 https:// 地址。
            </p>
            <p class="field__error" id="error-${escapeHtml(link.id)}" data-field-error></p>
          </div>
        `
      )
      .join("");

    return `
      <fieldset class="config-group">
        <legend>${escapeHtml(group.label)}</legend>
        <p class="config-group__intro">${escapeHtml(group.description)}</p>
        ${fields}
      </fieldset>
    `;
  }).join("");

  const dialog = document.createElement("dialog");
  dialog.id = "link-config-dialog";
  dialog.className = "config-dialog";
  dialog.setAttribute("aria-labelledby", "config-dialog-title");
  dialog.innerHTML = `
    <div class="config-dialog__panel">
      <header class="config-dialog__header">
        <div>
          <p class="eyebrow">LOCAL OVERRIDES / ${escapeHtml(SITE_CONFIG.version)}</p>
          <h2 id="config-dialog-title">配置链接</h2>
        </div>
        <button class="icon-button" type="button" data-close-config aria-label="关闭配置窗口">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18"></path>
          </svg>
        </button>
      </header>
      <div class="config-dialog__body">
        <p class="config-dialog__intro">
          所有地址只保存在当前浏览器，不会上传到服务器。请勿填写 API Key、密码或私人文件路径。
        </p>
        <form id="link-config-form" novalidate>
          ${groupedLinks}
          <p class="form-message" data-form-message role="alert" aria-live="polite"></p>
          <div class="config-dialog__actions">
            <button class="button button--ghost" type="button" data-reset-config>
              恢复默认
            </button>
            <button class="button button--primary" type="submit">
              保存到本机
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.append(dialog);
}

function syncForm(dialog) {
  for (const link of SITE_CONFIG.links) {
    const input = dialog.querySelector(`[name="${link.id}"]`);
    const note = dialog.querySelector(`#help-${link.id}`);
    if (!input) continue;
    input.value = getUrlForLink(link.id);
    if (note) {
      note.textContent = validateUrl(input.value).message;
    }
  }

  dialog.querySelector("[data-form-message]").textContent = "";
  document.querySelectorAll("[data-storage-status]").forEach((element) => {
    element.textContent = state.storageAvailable
      ? "设置会保存在当前浏览器中。"
      : "当前浏览器禁止本地存储，本次设置仅在当前页面有效。";
  });
  renderAllLinks();
}

function wireConfigDialog() {
  buildConfigDialog();

  const dialog = document.querySelector("#link-config-dialog");
  const form = dialog.querySelector("#link-config-form");
  const message = dialog.querySelector("[data-form-message]");

  const openDialog = () => {
    state.lastFocus = document.activeElement;
    syncForm(dialog);
    dialog.showModal();
    document.body.classList.add("dialog-open");
    const firstInput = dialog.querySelector("[data-link-input]");
    window.setTimeout(() => firstInput?.focus(), 0);
  };

  const cleanupDialog = () => {
    document.body.classList.remove("dialog-open");
    if (state.lastFocus instanceof HTMLElement) {
      state.lastFocus.focus();
      state.lastFocus = null;
    }
  };

  const closeDialog = () => {
    if (dialog.open) dialog.close();
    cleanupDialog();
  };

  document.querySelectorAll("[data-open-config]").forEach((button) => {
    button.addEventListener("click", openDialog);
  });

  dialog.querySelector("[data-close-config]").addEventListener("click", closeDialog);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
    }
  });

  dialog.addEventListener("close", cleanupDialog);

  dialog.querySelectorAll("[data-link-input]").forEach((input) => {
    input.addEventListener("input", () => {
      const result = validateUrl(input.value);
      const note = dialog.querySelector(`#help-${input.name}`);
      const error = dialog.querySelector(`#error-${input.name}`);
      if (note) note.textContent = result.message;
      if (error) error.textContent = "";
      input.removeAttribute("aria-invalid");
    });
  });

  dialog.querySelector("[data-reset-config]").addEventListener("click", () => {
    saveOverrides({});
    syncForm(dialog);
    message.textContent = "已恢复默认配置。";
    message.className = "form-message is-success";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextOverrides = {};
    let firstInvalidInput = null;
    let invalidCount = 0;

    for (const link of SITE_CONFIG.links) {
      const input = form.querySelector(`[name="${link.id}"]`);
      const error = form.querySelector(`#error-${link.id}`);
      const note = form.querySelector(`#help-${link.id}`);
      const result = validateUrl(input.value);

      if (!result.ok) {
        invalidCount += 1;
        firstInvalidInput ||= input;
        input.setAttribute("aria-invalid", "true");
        if (error) error.textContent = result.message;
        if (note) note.textContent = "地址尚未通过校验。";
        continue;
      }

      input.removeAttribute("aria-invalid");
      if (error) error.textContent = "";
      if (note) note.textContent = result.message;

      if (result.url !== (linkDefaults.get(link.id) || "")) {
        nextOverrides[link.id] = result.url;
      }
    }

    if (invalidCount) {
      message.textContent = `还有 ${invalidCount} 个地址需要修正。`;
      message.className = "form-message is-error";
      firstInvalidInput?.focus();
      return;
    }

    saveOverrides(nextOverrides);
    renderAllLinks();
    message.textContent = state.storageAvailable
      ? "链接已保存到当前浏览器。"
      : "设置已应用，但浏览器未能持久保存。";
    message.className = "form-message is-success";

    window.setTimeout(() => closeDialog(), 450);
  });
}

function wireMobileNavigation() {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("[data-nav]");
  if (!header || !toggle || !nav) return;

  const setOpen = (open) => {
    header.classList.toggle("is-menu-open", open);
    document.body.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "关闭导航菜单" : "打开导航菜单");
  };

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  nav.querySelectorAll("a, button").forEach((item) => {
    item.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && header.classList.contains("is-menu-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) setOpen(false);
  });
}

function wireWorksFilter() {
  const filterBar = document.querySelector("[data-filter-bar]");
  if (!filterBar) return;

  const buttons = [...filterBar.querySelectorAll("[data-filter]")];
  const cards = [...document.querySelectorAll("[data-category]")];
  const status = document.querySelector("[data-filter-status]");

  const applyFilter = (filter) => {
    let visibleCount = 0;

    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
    }

    for (const card of cards) {
      const visible = filter === "all" || card.dataset.category === filter;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    }

    if (status) {
      const activeLabel =
        buttons.find((button) => button.dataset.filter === filter)?.textContent?.trim() ||
        "全部";
      status.textContent = `当前显示 ${visibleCount} 个示例作品（${activeLabel}）。`;
    }
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => applyFilter(button.dataset.filter));
  });

  applyFilter("all");
}

function wireExternalStorageSync() {
  window.addEventListener("storage", (event) => {
    if (event.key !== SITE_CONFIG.storageKey) return;
    state.overrides = loadOverrides();
    renderAllLinks();
  });
}

function init() {
  state.overrides = loadOverrides();
  wireConfigDialog();
  wireMobileNavigation();
  wireWorksFilter();
  wireExternalStorageSync();
  renderAllLinks();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
