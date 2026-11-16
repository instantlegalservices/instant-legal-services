(() => {

  function redirectOldAdmin() {

    if (
      location.pathname.endsWith("/portal.html") &&
      location.hash === "#admin"
    ) {

      location.replace("/admin.html");
      return true;

    }

    return false;
  }

  if (redirectOldAdmin()) return;

  window.addEventListener(
    "hashchange",
    redirectOldAdmin
  );

  let deferred = null;

  window.addEventListener(
    "beforeinstallprompt",
    event => {

      event.preventDefault();

      deferred = event;

      const button =
        document.querySelector("[data-install-app]");

      if (button) {
        button.hidden = false;
      }

    }
  );

  document.addEventListener(
    "click",
    async event => {

      const button =
        event.target.closest("[data-install-app]");

      if (!button || !deferred) return;

      deferred.prompt();

      await deferred.userChoice;

      deferred = null;

      button.hidden = true;

    }
  );

  window.addEventListener(
    "appinstalled",
    () => {

      document
        .querySelectorAll("[data-install-app]")
        .forEach(button => {
          button.hidden = true;
        });

    }
  );


  /* =========================================================
     HOMEPAGE DYNAMIC ROTATION
     ---------------------------------------------------------
     Only affects index.html / homepage.
     All other pages remain untouched.
  ========================================================= */

  function setupHomepageRotation() {

    const path =
      location.pathname.replace(/\/+$/, "");

    const isHomepage =
      path === "" ||
      path === "/" ||
      path.endsWith("/index.html");

    if (!isHomepage) return;

    if (!window.ILS) return;


    /*
      Prevent duplicate setup.
    */
    if (window.__ILS_HOME_ROTATION__) return;

    window.__ILS_HOME_ROTATION__ = true;


    /* -------------------------------------------------------
       1. Rotate advocates from a larger live database pool
    ------------------------------------------------------- */

    let advocatePoolPromise = null;

    if (
      typeof window.ILS.advocates === "function" &&
      !window.ILS.advocates.__homeRotationWrapped
    ) {

      const originalAdvocates =
        window.ILS.advocates;

      const wrappedAdvocates =
        async function(options = {}) {

          if (!advocatePoolPromise) {
            advocatePoolPromise = originalAdvocates({
              ...options,
              limit: 12,
              featured: true
            }).catch(error => {
              advocatePoolPromise = null;
              throw error;
            });
          }

          const result = await advocatePoolPromise;

          if (!Array.isArray(result)) {
            return [];
          }

          /*
            Time bucket changes every 5 minutes.
            This makes the homepage selection change
            periodically without affecting advocate.html.
          */
          const bucket =
            Math.floor(
              Date.now() / (5 * 60 * 1000)
            );

          if (result.length <= 4) {
            return result;
          }

          const start =
            (bucket * 4) % result.length;

          const rotated =
            result
              .slice(start)
              .concat(result.slice(0, start));

          return rotated.slice(0, 4);
        };

      wrappedAdvocates.__homeRotationWrapped = true;

      window.ILS.advocates =
        wrappedAdvocates;
    }


    /* -------------------------------------------------------
       2. Rotate judgments from a larger live database pool
    ------------------------------------------------------- */

    let judgmentPoolPromise = null;

    if (
      typeof window.ILS.judgments === "function" &&
      !window.ILS.judgments.__homeRotationWrapped
    ) {

      const originalJudgments =
        window.ILS.judgments;

      const wrappedJudgments =
        async function(options = {}) {

          /*
            Fetch the homepage pool once per page session.
            Language changes reuse this in-memory result.
          */
          if (!judgmentPoolPromise) {
            judgmentPoolPromise = originalJudgments({
              ...options,
              limit: 12
            }).catch(error => {
              judgmentPoolPromise = null;
              throw error;
            });
          }

          const result = await judgmentPoolPromise;

          if (!Array.isArray(result)) {
            return [];
          }

          /*
            Keep the pool recent because the original
            judgments() function orders by judgment_date
            descending.

            Every 5 minutes the next 4 records are shown.
          */
          if (result.length <= 4) {
            return result;
          }

          const bucket =
            Math.floor(
              Date.now() / (5 * 60 * 1000)
            );

          const start =
            (bucket * 4) % result.length;

          const rotated =
            result
              .slice(start)
              .concat(result.slice(0, start));

          return rotated.slice(0, 4);
        };

      wrappedJudgments.__homeRotationWrapped = true;

      window.ILS.judgments =
        wrappedJudgments;
    }


    /* -------------------------------------------------------
       3. No periodic homepage reload.
       Repeated reloads caused avoidable database and image
       requests for every visitor with the homepage open.
       Data refreshes on a normal page navigation/reload.
    ------------------------------------------------------- */

  }


  /*
    pwa.js is deferred and is loaded after ils-core.js.
    Wait one microtask so ILS is fully available,
    then install the homepage-only wrapper before
    index.html's inline homepage script runs.
  */
  Promise.resolve().then(
    setupHomepageRotation
  );


  /* =========================================================
     SERVICE WORKER
     EXISTING CODE — UNCHANGED
  ========================================================= */

  if ("serviceWorker" in navigator) {

    window.addEventListener(
      "load",
      async () => {

        try {

          /*
            Remove any old service worker registrations.
          */
          const registrations =
            await navigator.serviceWorker.getRegistrations();

          for (const registration of registrations) {

            const script =
              registration.active?.scriptURL || "";

            if (
              script &&
              !script.includes("sw.js?v=13")
            ) {
              await registration.unregister();
            }

          }

          const registration =
            await navigator.serviceWorker.register(
              "./sw.js?v=13",
              {
                updateViaCache: "none"
              }
            );

          await registration.update();

        } catch (error) {

          console.error(
            "ILS Service Worker Error:",
            error
          );

        }

      }
    );

  }

})();
