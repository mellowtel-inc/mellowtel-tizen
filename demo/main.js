/* global Mellowtel, tizen */
(function () {
  "use strict";

  // Replace with your real publishable key from the Mellowtel dashboard.
  var PUBLIC_KEY = "DEMO_PUBLIC_KEY";

  var mellowtel = new Mellowtel(PUBLIC_KEY, { disableLogs: false, logLevel: "debug" });

  var el = {
    dot: document.getElementById("dot"),
    statusText: document.getElementById("statusText"),
    daily: document.getElementById("daily"),
    total: document.getElementById("total"),
    btnToggle: document.getElementById("btnToggle"),
    btnConsent: document.getElementById("btnConsent"),
    nodeId: document.getElementById("nodeId"),
  };

  var buttons = [el.btnToggle, el.btnConsent];
  var focusIndex = 0;

  function paintFocus() {
    buttons.forEach(function (b, i) {
      if (i === focusIndex) b.classList.add("focused");
      else b.classList.remove("focused");
    });
  }

  async function refresh() {
    var status = await mellowtel.getOptInStatus(); // true | false | undefined
    var optedIn = status === true;
    el.dot.className = "dot " + (optedIn ? "on" : "off");
    el.statusText.textContent = optedIn
      ? "Sharing bandwidth (opted in)"
      : status === false
      ? "Paused (opted out)"
      : "Not decided yet";
    el.btnToggle.textContent = optedIn ? "Opt out" : "Opt in";

    var stats = await mellowtel.getStats();
    el.daily.textContent = String(stats.daily);
    el.total.textContent = String(stats.total);

    var id = mellowtel.getNodeId();
    if (id) el.nodeId.textContent = "node: " + id;
  }

  async function onToggle() {
    var status = await mellowtel.getOptInStatus();
    if (status === true) {
      await mellowtel.optOut();
    } else {
      await mellowtel.optIn();
    }
    await refresh();
  }

  async function onConsent() {
    await mellowtel.showConsentDialog({
      title: "Support this app",
      incentive:
        "Help keep this app free by sharing a little unused bandwidth. " +
        "We never collect personal data, and you can turn this off anytime.",
    });
    await refresh();
  }

  function onKey(e) {
    switch (e.keyCode) {
      case 37: // LEFT
        focusIndex = Math.max(0, focusIndex - 1);
        paintFocus();
        break;
      case 39: // RIGHT
        focusIndex = Math.min(buttons.length - 1, focusIndex + 1);
        paintFocus();
        break;
      case 13: // ENTER
        if (focusIndex === 0) onToggle();
        else onConsent();
        break;
      case 10009: // RETURN/BACK on the Samsung remote — exit the app
        try {
          if (typeof tizen !== "undefined" && tizen.application) {
            tizen.application.getCurrentApplication().exit();
          }
        } catch (err) {
          /* noop */
        }
        break;
      default:
        break;
    }
  }

  // Mouse/click fallback for the emulator
  el.btnToggle.addEventListener("click", onToggle);
  el.btnConsent.addEventListener("click", onConsent);

  window.addEventListener("load", async function () {
    document.addEventListener("keydown", onKey);

    // Register the BACK key with the Tizen TV input device, if available.
    try {
      if (typeof tizen !== "undefined" && tizen.tvinputdevice) {
        tizen.tvinputdevice.registerKey("Return");
      }
    } catch (err) {
      /* noop */
    }

    paintFocus();

    // Identity + config; auto-starts if the user already opted in.
    await mellowtel.initBackground();
    await refresh();

    // Refresh the live counters periodically.
    setInterval(refresh, 5000);
  });
})();
