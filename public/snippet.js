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
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
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
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
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
  };

  fetch("https://churnaut-backend.vercel.app/api/resolve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP error! Status: " + response.status);
      }
      return response.json();
    })
    .then(function (data) {
      // 7. Store the visitor token from the response as a cookie with a 30-day expiry
      if (data && data.visitor_token) {
        setCookie("_sr_visitor", data.visitor_token, 30);
      }

      // Iterate through the swaps array and modify matching DOM elements
      if (data && data.swaps && Array.isArray(data.swaps)) {
        for (var j = 0; j < data.swaps.length; j++) {
          var swap = data.swaps[j];
          if (swap.selector && typeof swap.content === "string") {
            var element = document.querySelector(swap.selector);
            if (element) {
              element.innerHTML = swap.content;
            }
          }
        }
      }
    })
    .catch(function (error) {
      console.error("[Churnaut] Failed to resolve signals:", error);
    })
    .finally(function () {
      // 8. Restore original visibility on all target elements regardless of outcome
      restoreVisibility(targets);
    });
})();
