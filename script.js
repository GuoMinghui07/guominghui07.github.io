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
    const items = [];
    for (const file of files) {
      items.push(await fetchYaml(folder + "/" + file));
    }
    return items;
  }

  function renderPublicationLinks(item) {
    const links = [];
    if (item.code) links.push('<a href="' + escapeHtml(item.code) + '" target="_blank" rel="noreferrer">code</a>');
    if (item.website) links.push('<a href="' + escapeHtml(item.website) + '" target="_blank" rel="noreferrer">website</a>');
    if (item.paper) links.push('<a href="' + escapeHtml(item.paper) + '" target="_blank" rel="noreferrer">paper</a>');
    if (!links.length) return "";
    return '<p class="pub-links">' + links.join('<span>/</span>') + "</p>";
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
        const status = item.status ? " " + escapeHtml(item.status) : "";
        const authors = Array.isArray(item.authors) ? item.authors.map(formatAuthor).join(", ") : "";
        const cover = item.cover
          ? '<img src="' + escapeHtml(item.cover) + '" alt="' + escapeHtml(item.title || "Publication cover") + '" />'
          : "Coming soon";
        const coverClass = item.cover ? "pub-thumb" : "pub-thumb pub-thumb-empty";

        return (
          '<article class="pub-item">' +
          '<div class="' + coverClass + '">' + cover + "</div>" +
          '<div class="pub-content">' +
          "<h3>" + escapeHtml(item.title) + "</h3>" +
          '<p class="pub-meta">' + venue + year + status + "</p>" +
          (authors ? '<p class="pub-authors">' + authors + "</p>" : "") +
          renderPublicationLinks(item) +
          "</div></article>"
        );
      })
      .join("");
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
        const meta = [item.time, item.location].filter(Boolean).map(escapeHtml).join(" · ");

        const company = item.website
          ? '<a href="' + escapeHtml(item.website) + '" target="_blank" rel="noreferrer">' + escapeHtml(item.company || "Unnamed Company") + "</a>"
          : escapeHtml(item.company || "Unnamed Company");

        return (
          '<article class="intern-item">' +
          '<div class="intern-logo">' + logo + "</div>" +
          '<div class="intern-content">' +
          '<h3 class="intern-company">' + company + "</h3>" +
          '<p class="intern-role">' + escapeHtml(item.role || "") + "</p>" +
          '<p class="intern-meta">' + meta + "</p>" +
          "</div></article>"
        );
      })
      .join("");
  }

  window.addEventListener("DOMContentLoaded", async () => {
    document.body.classList.add("loaded");
    const y = document.getElementById("year");
    if (y) y.textContent = String(new Date().getFullYear());

    try {
      const [pubs, interns] = await Promise.all([loadYamlItems("publication"), loadYamlItems("internship")]);
      renderPublications(pubs);
      renderInternships(interns);
    } catch (err) {
      const pubRoot = document.getElementById("publicationList");
      const internRoot = document.getElementById("internshipList");
      if (pubRoot) pubRoot.innerHTML = '<p class="empty-message">Failed to load publication YAML.</p>';
      if (internRoot) internRoot.innerHTML = '<p class="empty-message">Failed to load internship YAML.</p>';
      console.error(err);
    }
  });
})();
