(function () {
  function parseYamlScalar(raw) {
    const value = (raw || "").trim();
    if (!value) return "";
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    return value;
  }

  function parseSimpleYaml(text) {
    const out = {};
    const lines = String(text || "").split(/\r?\n/);
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        i += 1;
        continue;
      }

      const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(trimmed);
      if (!match) {
        i += 1;
        continue;
      }

      const key = match[1];
      const inline = match[2];

      if (inline) {
        out[key] = parseYamlScalar(inline);
        i += 1;
        continue;
      }

      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j += 1;
      if (j < lines.length && /^\s*-\s*(.*)$/.test(lines[j])) {
        const items = [];
        i += 1;
        while (i < lines.length) {
          const listLine = lines[i];
          if (!listLine.trim()) {
            i += 1;
            continue;
          }
          const listMatch = /^\s*-\s*(.*)$/.exec(listLine);
          if (!listMatch) break;
          items.push(parseYamlScalar(listMatch[1]));
          i += 1;
        }
        out[key] = items;
      } else {
        out[key] = "";
        i += 1;
      }
    }

    return out;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatAuthor(name) {
    const safe = escapeHtml(name);
    return safe.replace(/minghui guo(\*{0,2})/gi, "<b>$&</b>");
  }

  async function fetchYaml(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Failed to fetch " + path);
    }
    return parseSimpleYaml(await res.text());
  }

  async function loadYamlItems(folder) {
    const indexData = await fetchYaml(folder + "/index.yaml");
    const files = Array.isArray(indexData.items) ? indexData.items : [];
    return Promise.all(files.map((file) => fetchYaml(folder + "/" + file)));
  }

  function githubRepository(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "github.com" || parsed.protocol !== "https:") return "";
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return "";
      return parts[0] + "/" + parts[1].replace(/\.git$/, "");
    } catch (_) {
      return "";
    }
  }

  function renderCodeLink(url, showStars = true) {
    const repo = githubRepository(url);
    if (!repo) return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">Code</a>';

    return '<a class="github-code' + (showStars ? ' github-stars' : '') + '" href="' + escapeHtml(url) + '"' +
      (showStars ? ' data-github-repo="' + escapeHtml(repo) + '" data-stars-state="loading"' : '') +
      ' target="_blank" rel="noreferrer" aria-label="View ' + escapeHtml(repo) + ' on GitHub" title="' + (showStars ? 'Loading GitHub stars…' : 'View ' + escapeHtml(repo) + ' on GitHub') + '">' +
      '<svg class="github-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.386-1.333-1.756-1.333-1.756-1.09-.744.083-.729.083-.729 1.205.084 1.838 1.238 1.838 1.238 1.07 1.835 2.809 1.305 3.495.998.108-.775.418-1.305.762-1.605-2.665-.304-5.466-1.334-5.466-5.93 0-1.31.465-2.38 1.236-3.22-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.3 1.23A11.51 11.51 0 0 1 12 6.844c1.02.005 2.045.137 3.003.402 2.29-1.553 3.296-1.23 3.296-1.23.655 1.653.243 2.874.12 3.176.77.84 1.234 1.91 1.234 3.22 0 4.608-2.804 5.624-5.475 5.922.43.372.814 1.102.814 2.222 0 1.606-.014 2.9-.014 3.293 0 .321.216.694.825.576C20.565 21.797 24 17.298 24 12c0-6.63-5.373-12-12-12z"/></svg>' +
      '<span>GitHub</span>' + (showStars ? '<span class="github-stars-divider" aria-hidden="true"></span>' +
      '<svg class="github-star-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.4 2.04 4.13 4.56.66-3.3 3.22.78 4.55L8 11.81l-4.08 2.15.78-4.55L1.4 6.19l4.56-.66L8 1.4Z"/></svg>' +
      '<span class="github-star-count">…</span>' : '') + '</a>';
  }

  function validStarCount(value) {
    return typeof value === "string" && /^\d+(?:,\d{3})*(?:\.\d+)?[kmb]?$/i.test(value);
  }

  function readStarCache(repo) {
    try {
      const cached = JSON.parse(localStorage.getItem("github-stars:" + repo));
      return cached && validStarCount(cached.count) && Number.isFinite(cached.updatedAt) && cached.updatedAt > 0
        ? cached : null;
    } catch (_) {
      return null;
    }
  }

  function showStarCount(repo, links, count, source, updatedAt) {
    links.forEach((link) => {
      link.querySelector(".github-star-count").textContent = count;
      link.dataset.starsState = source === "cache" ? "cached" : "ready";
      link.dataset.starsSource = source;
      link.title = repo + " · " + count + " GitHub stars";
      if (source === "cache") {
        link.title += " · Last retrieved: " + new Date(updatedAt).toLocaleString();
      } else if (source === "shields") {
        link.title += " · Provided by Shields.io; may be cached";
      }
      link.setAttribute("aria-label", "View " + repo + " on GitHub, " + count + " stars" + (source === "cache" ? ", last available count" : ""));
    });
  }

  async function fetchStarData(url, headers) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        headers,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error("GitHub stars unavailable");
      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function loadGitHubStars() {
    const groups = new Map();
    document.querySelectorAll("[data-github-repo]").forEach((link) => {
      const repo = link.dataset.githubRepo;
      if (!groups.has(repo)) groups.set(repo, []);
      groups.get(repo).push(link);
    });
    if (!groups.size) return;

    await Promise.all(Array.from(groups, async ([repo, links]) => {
      const cached = readStarCache(repo);
      if (cached) showStarCount(repo, links, cached.count, "cache", cached.updatedAt);
      const path = repo.split("/").map(encodeURIComponent).join("/");
      try {
        let count;
        let source = "github";
        try {
          const data = await fetchStarData("https://api.github.com/repos/" + path, { Accept: "application/vnd.github+json" });
          if (!Number.isInteger(data.stargazers_count) || data.stargazers_count < 0) throw new Error("Invalid GitHub star count");
          count = data.stargazers_count.toLocaleString("en-US");
        } catch (_) {
          const badge = await fetchStarData("https://img.shields.io/github/stars/" + path + ".json");
          if (!validStarCount(badge.message)) throw new Error("Invalid GitHub star badge");
          count = badge.message;
          source = "shields";
        }
        const updatedAt = Date.now();
        showStarCount(repo, links, count, source, updatedAt);
        try {
          localStorage.setItem("github-stars:" + repo, JSON.stringify({ count, updatedAt }));
        } catch (_) {
          // Storage may be unavailable; the loaded count can still be displayed.
        }
      } catch (_) {
        if (!cached) {
          links.forEach((link) => {
            link.querySelector(".github-star-count").textContent = "—";
            link.dataset.starsState = "unavailable";
            link.title = "Star count is currently unavailable. Open GitHub to view the repository.";
          });
        }
      }
    }));
  }

  function renderPublicationLinks(item) {
    const links = [
      [item.paper, "Paper"],
      [item.homepage || item.website, "Project"],
      [item.models, "Models"],
      [item.dataset, "Dataset"]
    ].filter(([url]) => url).map(([url, label]) => '<a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">' + label + "</a>");
    if (item.code) links.push(renderCodeLink(item.code, item.show_stars !== "false"));
    if (!links.length) return "";
    return '<p class="pub-links">' + links.join("") + "</p>";
  }

  function renderPublications(items) {
    const root = document.getElementById("publicationList");
    if (!root) return;
    if (!items.length) {
      root.innerHTML = '<p class="empty-message">No publication entries yet.</p>';
      return;
    }

    root.innerHTML = items
      .map((item) => {
        const venue = item.venue ? "<b>" + escapeHtml(item.venue) + "</b>" : "";
        const year = item.year ? " (" + escapeHtml(item.year) + ")" : "";
        const authors = Array.isArray(item.authors) ? item.authors.map(formatAuthor).join(", ") : "";
        const coverImage = item.cover
          ? '<img src="' + escapeHtml(item.cover) + '" alt="' + escapeHtml(item.title || "Publication cover") + '" loading="lazy" />'
          : "Coming soon";
        const cover = item.cover && item.paper
          ? '<a href="' + escapeHtml(item.paper) + '" target="_blank" rel="noreferrer" aria-label="Open paper: ' + escapeHtml(item.title) + '">' + coverImage + "</a>"
          : coverImage;
        const coverClass = item.cover ? "pub-thumb" : "pub-thumb pub-thumb-empty";
        const title = item.paper
          ? '<a href="' + escapeHtml(item.paper) + '" target="_blank" rel="noreferrer">' + escapeHtml(item.title) + "</a>"
          : escapeHtml(item.title);
        return (
          '<article class="pub-item">' +
          '<div class="' + coverClass + '">' + cover + "</div>" +
          '<div class="pub-content">' +
          "<h3>" + title + "</h3>" +
          (authors ? '<p class="pub-authors">' + authors + "</p>" : "") +
          '<p class="pub-meta">' + venue + year + "</p>" +
          renderPublicationLinks(item) +
          "</div></article>"
        );
      })
      .join("");
    loadGitHubStars();
  }

  function renderInternships(items) {
    const root = document.getElementById("internshipList");
    if (!root) return;
    if (!items.length) {
      root.innerHTML = '<p class="empty-message">No internship entries yet.</p>';
      return;
    }

    root.innerHTML = items
      .map((item) => {
        const logo = item.logo
          ? '<img src="' + escapeHtml(item.logo) + '" alt="' + escapeHtml(item.company || "Company logo") + '" />'
          : '<div class="intern-logo-placeholder">No logo</div>';

        const company = item.website
          ? '<a href="' + escapeHtml(item.website) + '" target="_blank" rel="noreferrer">' + escapeHtml(item.company || "Unnamed Company") + "</a>"
          : escapeHtml(item.company || "Unnamed Company");
        const supervisor = item.supervisor_url
          ? '<a class="text-link" href="' + escapeHtml(item.supervisor_url) + '" target="_blank" rel="noreferrer">' + escapeHtml(item.supervisor) + "</a>"
          : escapeHtml(item.supervisor);

        return (
          '<article class="intern-item">' +
          '<div class="intern-logo">' + logo + "</div>" +
          '<div class="intern-content">' +
          '<h3 class="intern-company">' + company + "</h3>" +
          '<p class="intern-role">' + escapeHtml(item.role || "") + "</p>" +
          (item.supervisor ? '<p class="intern-supervisor">Supervisor: ' + supervisor + "</p>" : "") +
          '</div><div class="intern-meta">' +
          (item.time ? '<p class="intern-time">' + escapeHtml(item.time) + "</p>" : "") +
          (item.location ? '<p class="intern-location">' + escapeHtml(item.location) + "</p>" : "") +
          "</div></article>"
        );
      })
      .join("");
  }

  function renderAwards(items) {
    const root = document.getElementById("awardList");
    if (!root) return;
    if (!items.length) {
      root.innerHTML = '<p class="empty-message">No award entries yet.</p>';
      return;
    }

    root.innerHTML = items
      .map((item) => {
        const rawTitle = item.title || "";
        const titleParts = rawTitle.split("|").map((part) => part.trim()).filter(Boolean);
        const competition = item.competition || titleParts[0] || "Untitled Award";
        const prize = item.prize || (titleParts.length > 1 ? titleParts.slice(1).join(" ") : "");

        return (
          '<article class="award-item">' +
          '<div class="award-main">' +
          '<p class="award-title">' + escapeHtml(competition) + "</p>" +
          (prize ? '<p class="award-prize">' + escapeHtml(prize) + "</p>" : "") +
          "</div>" +
          '<p class="award-time">' + escapeHtml(item.time || "") + "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  window.addEventListener("DOMContentLoaded", async () => {
    document.body.classList.add("loaded");
    const y = document.getElementById("year");
    if (y) y.textContent = String(new Date().getFullYear());
    await Promise.all([
      ["publication", "publicationList", "Publications", renderPublications],
      ["internship", "internshipList", "Internship details", renderInternships],
      ["awards", "awardList", "Awards", renderAwards]
    ].map(async ([folder, rootId, label, render]) => {
      try {
        render(await loadYamlItems(folder));
      } catch (err) {
        const root = document.getElementById(rootId);
        if (root) root.innerHTML = '<p class="empty-message">' + label + ' are temporarily unavailable. Please refresh the page.</p>';
        console.error(err);
      }
    }));

    const anchor = document.getElementById(window.location.hash.slice(1));
    if (anchor) anchor.scrollIntoView({ behavior: "instant", block: "start" });
  });
})();
