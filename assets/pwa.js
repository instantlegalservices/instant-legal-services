(()=>{

  /* OLD PORTAL ADMIN -> NEW ADMIN */
  function redirectOldAdmin(){
    if(
      location.pathname.endsWith("/portal.html") &&
      location.hash === "#admin"
    ){
      location.replace("admin.html?v=11");
      return true;
    }
    return false;
  }

  if(redirectOldAdmin()) return;

  window.addEventListener("hashchange",redirectOldAdmin);

  let deferred=null;

  window.addEventListener("beforeinstallprompt",e=>{
    e.preventDefault();
    deferred=e;

    const b=document.querySelector("[data-install-app]");
    if(b)b.hidden=false;
  });

  document.addEventListener("click",async e=>{
    const b=e.target.closest("[data-install-app]");

    if(!b||!deferred)return;

    deferred.prompt();
    await deferred.userChoice;

    deferred=null;
    b.hidden=true;
  });

  window.addEventListener("appinstalled",()=>{
    document
      .querySelectorAll("[data-install-app]")
      .forEach(b=>b.hidden=true);
  });

  if("serviceWorker" in navigator){

    window.addEventListener("load",()=>{

      navigator.serviceWorker
        .register("./sw.js?v=11")
        .catch(console.error);

    });

  }

})();
