(function () {
  /**
   * Helper function to get a cookie value by name.
   * @param {string} name - Name of the cookie.
   * @returns {string|null} - Cookie value or null if not found.
   */
  function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(";");
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == " ") c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) == 0) {
        try { return decodeURIComponent(c.substring(nameEQ.length, c.length)); } catch { return null; }
      }
    }
    return null;
  }

  /**
   * Helper function to set a cookie with a 30-day expiry.
   * @param {string} name - Name of the cookie.
   * @param {string} value - Value to store.
   * @param {number} days - Number of days until expiry.
   */
  function setCookie(name, value, days) {
    var expires = "";
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + encodeURIComponent(value || "") + expires + "; path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
  }

  /**
   * Helper function to restore the visibility of all target elements.
   * @param {NodeList} targets - NodeList of targeted elements.
   */
  function restoreVisibility(targets) {
    if (targets && targets.length > 0) {
      for (var i = 0; i < targets.length; i++) {
        targets[i].style.visibility = "";
      }
    }
  }

  /**
   * Sanitize personalized markup with a constrained DOM allowlist. Regex-only
   * sanitization can be bypassed with malformed HTML or less-common URL schemes.
   * @param {string} html - HTML string to sanitize.
   * @returns {string} - Sanitized HTML string.
   */
  function sanitizeHtml(html) {
    if (typeof html !== 'string') return '';
    var template = document.createElement('template');
    template.innerHTML = html;
    var allowedTags = {
      A: true, B: true, BR: true, BUTTON: true, DIV: true, EM: true,
      I: true, IMG: true, LI: true, P: true, SPAN: true, STRONG: true,
      U: true, UL: true, OL: true, H1: true, H2: true, H3: true, H4: true,
      SMALL: true, IFRAME: true
    };
    var allowedAttrs = {
      A: { href: true, target: true, rel: true, title: true, class: true, id: true },
      IMG: { src: true, alt: true, width: true, height: true, class: true, id: true },
      IFRAME: { src: true, width: true, height: true, title: true, class: true, id: true, frameborder: true, allow: true, referrerpolicy: true },
      '*': { class: true, id: true, title: true }
    };
    var nodes = template.content.querySelectorAll('*');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var node = nodes[i];
      if (!allowedTags[node.tagName]) {
        node.remove();
        continue;
      }
      var attrs = Array.prototype.slice.call(node.attributes);
      var tagAttrs = allowedAttrs[node.tagName] || {};
      for (var j = 0; j < attrs.length; j++) {
        var attr = attrs[j];
        var name = attr.name.toLowerCase();
        var value = attr.value.trim();
        var allowed = !!(tagAttrs[name] || allowedAttrs['*'][name]);
        if (!allowed || name.indexOf('on') === 0 || /^(javascript|data|vbscript):/i.test(value)) {
          node.removeAttribute(attr.name);
        }
      }
      if ((node.tagName === 'A' || node.tagName === 'IMG' || node.tagName === 'IFRAME') && node.hasAttribute('href')) {
        if (!/^https?:\/\//i.test(node.getAttribute('href'))) node.removeAttribute('href');
      }
      if ((node.tagName === 'IMG' || node.tagName === 'IFRAME') && node.hasAttribute('src')) {
        if (!/^https:\/\//i.test(node.getAttribute('src'))) node.removeAttribute('src');
      }
      if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    return template.innerHTML;
  }

  // 1. Check if the global client ID variable is defined
  var clientId = window.SR_CLIENT_ID;
  if (!clientId) {
    return;
  }

  // 2. Parse URL parameters for conversion and tracking signals
  var urlParams = new URLSearchParams(window.location.search);
  var sid = urlParams.get("sid");
  var gclid = urlParams.get("gclid");
  var fbclid = urlParams.get("fbclid");
  var liFatId = urlParams.get("li_fat_id");
  var ttclid = urlParams.get("ttclid");
  var utmSource = urlParams.get("utm_source");
  var utmMedium = urlParams.get("utm_medium");
  var utmCampaign = urlParams.get("utm_campaign");
  var utmContent = urlParams.get("utm_content");
  var utmTerm = urlParams.get("utm_term");

  // 3. Read first-party tracking cookie
  var visitorCookie = getCookie("_sr_visitor");

  // A lightweight installation heartbeat is separate from analytics events.
  // It is throttled per browser and never consumes visit quota.
  try {
    var pingKey = "_sr_ping_" + clientId;
    var lastPing = Number(localStorage.getItem(pingKey) || 0);
    if (!lastPing || Date.now() - lastPing > 86400000) {
      fetch("https://app.churnaut.com/api/snippet-ping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId }), keepalive: true })
        .then(function (response) { if (response.ok) localStorage.setItem(pingKey, String(Date.now())); })
        .catch(function () {});
    }
  } catch (pingError) { void pingError; }

  // 4. Exit immediately if no tracking signals or active cookie exists
  if (!sid && !gclid && !fbclid && !liFatId && !ttclid && !utmSource && !utmMedium && !utmCampaign && !utmContent && !utmTerm && !visitorCookie) {
    return;
  }

  // 5. Hide target elements matching class 'sr-target' to prevent a flash of original content
  var targets = document.querySelectorAll(".sr-target");
  for (var i = 0; i < targets.length; i++) {
    targets[i].style.visibility = "hidden";
  }

  // 6. Build the payload and send a POST request to resolve the signals
  var payload = {
    client_id: clientId,
    cookie: visitorCookie,
    signals: {
      sid: sid,
      gclid: gclid,
      fbclid: fbclid,
      li_fat_id: liFatId,
      ttclid: ttclid,
    },
    utms: {
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      utm_term: utmTerm,
    },
    page_url: window.location.href,
  };

  var controller = new AbortController();
  var timeoutId = setTimeout(function() {
    controller.abort();
  }, 4000);

  fetch("https://app.churnaut.com/api/resolve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify(payload),
  })
    .then(function (response) {
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error("HTTP error! Status: " + response.status);
      }
      return response.json();
    })
    .then(function (data) {
      if (data && data.visitor_token) {
        setCookie("_sr_visitor", data.visitor_token, 30);
      }
      if (data && data.swaps && Array.isArray(data.swaps)) {
        for (var j = 0; j < data.swaps.length; j++) {
          var swap = data.swaps[j];
          if (swap.selector && typeof swap.content === "string") {
            try {
              var element = document.querySelector(swap.selector);
              if (element) element.innerHTML = sanitizeHtml(swap.content);
            } catch (selectorError) {
              console.warn("[Churnaut] Ignoring invalid personalization selector:", selectorError);
            }
          }
        }
      }
    })
    .catch(function (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.warn("[Churnaut] Resolve request timed out — restoring original content.");
      } else {
        console.error("[Churnaut] Failed to resolve signals:", error);
      }
    })
    .finally(function () {
      restoreVisibility(targets);
    });
})();
