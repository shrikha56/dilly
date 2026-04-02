(function () {
  const CART_PATTERNS = [
    /\/cart\/add/i,
    /\/cart\.js/i,
    /\/cart\/update/i,
    /\/cart\/ajax/i,
    /\/api\/cart/i,
    /\/checkout\/cart/i,
    /\/bag\/add/i,
    /\/basket\/add/i,
    /\/api\/.*basket/i,
    /\/api\/.*bag/i,
    /\/commerce\/.*cart/i,
    /\/store\/.*cart/i,
    /addtobag/i,
    /addtocart/i,
    /add-to-cart/i,
    /add-to-bag/i,
    /AddItemToBasket/i,
    /Cart-AddProduct/i,
    /Cart-MiniAddProduct/i,
    /demandware.*cart/i,
    /dw\/shop\/.*basket/i,
    /ocapi\/.*basket/i,
    /\/trolley\/add/i,
    /\/items\/add/i,
    /\/line.items/i,
    /graphql.*addToCart/i,
    /graphql.*addItemsToCart/i,
    /\/gp\/cart\/add/i,
    /\/gp\/buy\/spc\/handlers/i,
    /\/gp\/product\/handle-buy-box/i
  ];

  function isCartBody(body) {
    if (!body) {
      return false;
    }

    const text = typeof body === "string" ? body : "";

    try {
      const str = text || (body instanceof FormData ? "" : JSON.stringify(body));
      return /addToCart|add_to_cart|AddProduct|add_item|cartAdd|buyNow|submit\.add/i.test(str);
    } catch (error) {
      return false;
    }
  }

  function isCartUrl(url) {
    try {
      const parsed = new URL(url, location.origin);
      return CART_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
    } catch (error) {
      return false;
    }
  }

  function requestDecision(url, method) {
    return new Promise((resolve) => {
      const id = `dilly-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      function onResponse(event) {
        if (event.detail?.id !== id) {
          return;
        }

        document.removeEventListener("dilly-cart-response", onResponse);
        resolve(event.detail.allow === true);
      }

      document.addEventListener("dilly-cart-response", onResponse);

      document.dispatchEvent(
        new CustomEvent("dilly-cart-request", {
          detail: { id, url, method }
        })
      );

      setTimeout(() => {
        document.removeEventListener("dilly-cart-response", onResponse);
        resolve(true);
      }, 120000);
    });
  }

  const originalFetch = window.fetch;

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = (init?.method || (typeof input === "object" ? input?.method : null) || "GET").toUpperCase();

    if (method === "POST" && isCartUrl(url)) {
      const allowed = await requestDecision(url, "fetch");
      if (!allowed) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return originalFetch.apply(this, arguments);
  };

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._dillyMethod = method;
    this._dillyUrl = url;
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const xhr = this;
    const method = (xhr._dillyMethod || "GET").toUpperCase();
    const url = xhr._dillyUrl || "";

    if (method === "POST" && isCartUrl(url)) {
      requestDecision(url, "xhr").then((allowed) => {
        if (allowed) {
          originalXhrSend.call(xhr, body);
        } else {
          xhr.dispatchEvent(new Event("loadstart"));
          Object.defineProperty(xhr, "status", { writable: true, value: 200 });
          Object.defineProperty(xhr, "readyState", { writable: true, value: 4 });
          Object.defineProperty(xhr, "responseText", {
            writable: true,
            value: JSON.stringify({ items: [] })
          });
          xhr.dispatchEvent(new Event("readystatechange"));
          xhr.dispatchEvent(new Event("load"));
          xhr.dispatchEvent(new Event("loadend"));
        }
      });
      return;
    }

    return originalXhrSend.apply(this, arguments);
  };
})();
