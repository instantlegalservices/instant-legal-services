(() => {

  function redirectOldAdmin() {

    if (
      location.pathname.endsWith("/portal.html") &&
      location.hash === "#admin"
    ) {

      location.replace("admin.html?v=12");
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
              !script.includes("sw.js?v=12")
            ) {
              await registration.unregister();
            }

          }

          const registration =
            await navigator.serviceWorker.register(
              "./sw.js?v=12",
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
