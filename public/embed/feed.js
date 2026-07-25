(function () {
  class OpenStellarFeed extends HTMLElement {
    connectedCallback() {
      const limit = Number(this.getAttribute("limit") || "5")
      const district = this.getAttribute("district")
      const params = new URLSearchParams({ limit: String(limit) })
      if (district) params.set("district", district)

      this.attachShadow({ mode: "open" })
      this.shadowRoot.innerHTML = [
        "<style>",
        ":host{display:block;font-family:monospace;color:#e2e8f0;background:#030712;border:1px solid #1f2a44;border-radius:8px;overflow:hidden}",
        ".head{padding:10px 12px;border-bottom:1px solid #1f2a44;color:#67e8f9;font-size:11px;text-transform:uppercase;letter-spacing:.14em}",
        ".item{padding:10px 12px;border-bottom:1px solid #111827}.item:last-child{border-bottom:0}",
        ".title{font-size:12px;font-weight:700;line-height:1.45}.meta{margin-top:4px;color:#94a3b8;font-size:11px;line-height:1.5}",
        "</style>",
        "<div class='head'>Open Stellar Feed</div>",
        "<div id='items'>Loading...</div>",
      ].join("")

      fetch(`/api/feed?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          const events = Array.isArray(data.events) ? data.events : []
          this.shadowRoot.getElementById("items").innerHTML = events.map((event) => (
            `<div class="item"><div class="title">${escapeHtml(event.title)}</div><div class="meta">${escapeHtml(event.detail)}</div></div>`
          )).join("")
        })
        .catch(() => {
          this.shadowRoot.getElementById("items").textContent = "Feed unavailable"
        })
    }
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char])
  }

  if (!customElements.get("open-stellar-feed")) {
    customElements.define("open-stellar-feed", OpenStellarFeed)
  }
})()
