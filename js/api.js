/*
  Session handling:
  - The backend sets an httpOnly cookie on login, which the browser will
    send automatically on future requests (credentials: "include").
  - We ALSO get the token back in the JSON response and stash it in
    localStorage, purely so the frontend JS can know "am I logged in"
    and show the right UI without an extra request. The actual auth
    check on the server always uses the cookie (or the Authorization
    header as a fallback for cross-site setups where third-party
    cookies get blocked).
*/

const Session = {
  save(user, token) {
    localStorage.setItem("pei_cards_user", JSON.stringify(user));
    if (token) localStorage.setItem("pei_cards_token", token);
  },
  user() {
    try {
      return JSON.parse(localStorage.getItem("pei_cards_user"));
    } catch {
      return null;
    }
  },
  token() {
    return localStorage.getItem("pei_cards_token");
  },
  clear() {
    localStorage.removeItem("pei_cards_user");
    localStorage.removeItem("pei_cards_token");
  },
  isLoggedIn() {
    return !!Session.user();
  },
};

async function api(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  const token = Session.token();
  if (token) headers["Authorization"] = "Bearer " + token;
  if (!isForm && body) headers["Content-Type"] = "application/json";

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    credentials: "include",
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    // account got banned/suspended (possibly mid-session, via the Telegram
    // bot) - clear the stale session and send them back to the login screen
    // instead of leaving a "logged in" UI that every request now 403s on
    if (data && (data.banned || data.suspended_until)) {
      Session.clear();
      if (!/index\.html$/.test(location.pathname) && location.pathname !== "/") {
        window.location.href = "index.html";
      }
    }
    throw new Error(message);
  }
  return data;
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function requireLogin() {
  if (!Session.isLoggedIn()) {
    window.location.href = "index.html";
  }
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

function highlightNav() {
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("nav.shop-nav a").forEach((a) => {
    if (a.getAttribute("href") === page) a.classList.add("active");
  });
}

function renderAuthArea() {
  const slot = document.getElementById("nav-auth-slot");
  if (!slot) return;
  const user = Session.user();
  if (user) {
    slot.innerHTML = `
      <span class="nav-btn" style="cursor:default;">👤 ${escapeHtml(user.username)}</span>
      <button class="nav-btn" id="logout-btn">Log out</button>
    `;
    document.getElementById("logout-btn").addEventListener("click", async () => {
      try { await api("/api/logout", { method: "POST" }); } catch {}
      Session.clear();
      window.location.href = "index.html";
    });
  } else {
    slot.innerHTML = `<a class="nav-btn" href="index.html">Log in</a>`;
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  highlightNav();
  renderAuthArea();
});
