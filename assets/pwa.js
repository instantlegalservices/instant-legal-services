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

    if (
      typeof window.ILS.advocates === "function" &&
      !window.ILS.advocates.__homeRotationWrapped
    ) {

      const originalAdvocates =
        window.ILS.advocates;

      const wrappedAdvocates =
        async function(options = {}) {

          const result =
            await originalAdvocates({
              ...options,
              limit: 12,
              featured: true
            });

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

    if (
      typeof window.ILS.judgments === "function" &&
      !window.ILS.judgments.__homeRotationWrapped
    ) {

      const originalJudgments =
        window.ILS.judgments;

      const wrappedJudgments =
        async function(options = {}) {

          /*
            Homepage asks for a larger pool.
            Other judgment pages are NOT affected.
          */
          const result =
            await originalJudgments({
              ...options,
              limit: 12
            });

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
       3. Refresh homepage every 5 minutes
       ------------------------------------------------------- */

    window.setTimeout(
      () => {

        /*
          Reload only the homepage.
          Other pages are completely untouched.
        */
        if (
          document.visibilityState === "visible"
        ) {
          window.location.reload();
        } else {

          /*
            If the tab is not visible, wait until the
            user returns rather than unexpectedly reloading.
          */
          const refreshOnReturn =
            () => {

              if (
                document.visibilityState === "visible"
              ) {

                document.removeEventListener(
                  "visibilitychange",
                  refreshOnReturn
                );

                window.location.reload();
              }

            };

          document.addEventListener(
            "visibilitychange",
            refreshOnReturn
          );

        }

      },
      5 * 60 * 1000
    );

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
