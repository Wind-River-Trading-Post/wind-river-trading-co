(function () {
  if (window.__windRiverShopifyCart) {
    window.__windRiverShopifyCart.bindCartTriggers();
    return;
  }

  var SDK_URL = "https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js";
  var STORE_CONFIG = {
    domain: "au0k9n-1k.myshopify.com",
    storefrontAccessToken: "5f29155f262d24f52aeecfde17190129",
    collectionId: "495491317985",
    moneyFormat: "%24%7B%7Bamount%7D%7D",
  };
  var COLLECTION_NODE_ID = "collection-component-1776613996121";
  var CART_NODE_ID = "shopify-cart-root";

  var state = {
    initPromise: null,
    cart: null,
    observer: null,
    ui: null,
  };

  function nextFrame(callback) {
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(callback);
      return;
    }

    window.setTimeout(callback, 0);
  }

  function loadShopifySdk() {
    if (window.ShopifyBuy && window.ShopifyBuy.UI) {
      return Promise.resolve(window.ShopifyBuy);
    }

    if (window.__windRiverShopifySdkPromise) {
      return window.__windRiverShopifySdkPromise;
    }

    window.__windRiverShopifySdkPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.async = true;
      script.src = SDK_URL;
      script.onload = function () {
        if (window.ShopifyBuy && window.ShopifyBuy.UI) {
          resolve(window.ShopifyBuy);
          return;
        }

        reject(new Error("Shopify Buy Button UI did not load."));
      };
      script.onerror = function () {
        reject(new Error("Failed to load Shopify Buy Button UI."));
      };
      (document.head || document.body).appendChild(script);
    });

    return window.__windRiverShopifySdkPromise;
  }

  function ensureCartNode() {
    var root = document.getElementById(CART_NODE_ID);

    if (!root) {
      root = document.createElement("div");
      root.id = CART_NODE_ID;
      document.body.appendChild(root);
    }

    return root;
  }

  function getCollectionMount() {
    return document.getElementById(COLLECTION_NODE_ID);
  }

  function getToggleButton() {
    return document.querySelector(".shopify-buy__cart-toggle");
  }

  function getToggleCountNode() {
    return document.querySelector(".shopify-buy__cart-toggle__count");
  }

  function hideNode(node) {
    if (!node) {
      return;
    }

    node.setAttribute("aria-hidden", "true");
    node.hidden = true;
    node.style.display = "none";
    node.style.opacity = "0";
    node.style.visibility = "hidden";
    node.style.pointerEvents = "none";
  }

  function hideDefaultToggle() {
    var toggle = getToggleButton();
    var toggleWrapper;
    var toggleIframe = document.querySelector("iframe.shopify-buy-frame.shopify-buy-frame--toggle");

    if (!toggle && !toggleIframe) {
      return;
    }

    if (toggle) {
      toggleWrapper = toggle.closest(".shopify-buy-frame--toggle") || toggle.closest("[class*='shopify-buy-frame']") || toggle.parentElement;
      hideNode(toggle);
      hideNode(toggleWrapper);
    }

    hideNode(toggleIframe);
  }

  function getCartCount() {
    if (state.cart && state.cart.model && Array.isArray(state.cart.model.lineItems)) {
      return state.cart.model.lineItems.reduce(function (count, item) {
        return count + item.quantity;
      }, 0);
    }

    return 0;
  }

  function syncCartBadge() {
    var count = getCartCount();

    document.querySelectorAll("[data-cart-count]").forEach(function (badge) {
      badge.textContent = String(count);
      badge.hidden = count < 1;
    });

    document.querySelectorAll("[data-cart-trigger]").forEach(function (button) {
      button.setAttribute("aria-label", count > 0 ? "Open cart, " + count + " items" : "Open cart");
    });
  }

  function observeCartState() {
    if (state.observer) {
      return;
    }

    state.observer = new MutationObserver(function () {
      nextFrame(syncCartBadge);
    });

    state.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  function waitForToggle(timeoutMs) {
    return new Promise(function (resolve) {
      var existing = getToggleButton();
      var timeoutId;
      var observer;

      if (existing) {
        resolve(existing);
        return;
      }

      observer = new MutationObserver(function () {
        var toggle = getToggleButton();

        if (toggle) {
          window.clearTimeout(timeoutId);
          observer.disconnect();
          resolve(toggle);
        }
      });

      observer.observe(document.body, {
        subtree: true,
        childList: true,
      });

      timeoutId = window.setTimeout(function () {
        observer.disconnect();
        resolve(getToggleButton());
      }, timeoutMs);
    });
  }

  function closeMobileMenuIfOpen() {
    var header = document.querySelector(".site-header");
    var navToggle = document.querySelector("[data-nav-toggle]");

    if (!header || !navToggle) {
      return;
    }

    if (header.classList.contains("is-nav-open") && navToggle.getAttribute("aria-expanded") === "true") {
      navToggle.click();
    }
  }

  function openSharedCart() {
    return initShopifyCart().then(function () {
      if (!state.ui) {
        return;
      }

      closeMobileMenuIfOpen();
      state.ui.openCart();
      hideDefaultToggle();
    });
  }

  function bindCartTriggers() {
    document.querySelectorAll("[data-cart-trigger]").forEach(function (button) {
      if (button.dataset.cartTriggerBound === "true") {
        return;
      }

      button.dataset.cartTriggerBound = "true";
      button.addEventListener("click", function (event) {
        event.preventDefault();

        initShopifyCart().then(function () {
          return openSharedCart();
        }).catch(function (error) {
          console.error(error);
        });
      });
    });
  }

  function buildCartOptions() {
    return {
      cart: {
        startOpen: false,
        text: {
          total: "Subtotal",
          button: "Checkout",
        },
      },
    };
  }

  function buildCollectionOptions() {
    return {
      product: {
        styles: {
          product: {
            "@media (min-width: 601px)": {
              "max-width": "calc(25% - 20px)",
              "margin-left": "20px",
              "margin-bottom": "50px",
              width: "calc(25% - 20px)",
            },
            img: {
              height: "calc(100% - 15px)",
              position: "absolute",
              left: "0",
              right: "0",
              top: "0",
            },
            imgWrapper: {
              "padding-top": "calc(75% + 15px)",
              position: "relative",
              height: "0",
            },
          },
        },
        text: {
          button: "Add to cart",
        },
      },
      productSet: {
        styles: {
          products: {
            "@media (min-width: 601px)": {
              "margin-left": "-20px",
            },
          },
        },
      },
      modalProduct: {
        contents: {
          img: false,
          imgWithCarousel: true,
          button: false,
          buttonWithQuantity: true,
        },
        styles: {
          product: {
            "@media (min-width: 601px)": {
              "max-width": "100%",
              "margin-left": "0px",
              "margin-bottom": "0px",
            },
          },
        },
        text: {
          button: "Add to cart",
        },
      },
      option: {},
    };
  }

  function createSharedCart(ui) {
    if (state.cart) {
      return Promise.resolve(state.cart);
    }

    return ui.createCart({
      node: ensureCartNode(),
      toggles: [],
      moneyFormat: STORE_CONFIG.moneyFormat,
      options: buildCartOptions(),
    }).then(function (cart) {
      state.cart = cart;
      return cart;
    });
  }

  function mountCollection(ui) {
    var mount = getCollectionMount();

    if (!mount) {
      return Promise.resolve();
    }

    if (mount.dataset.shopifyMounted === "true") {
      return Promise.resolve();
    }

    mount.dataset.shopifyMounted = "true";

    return ui.createComponent("collection", {
      id: STORE_CONFIG.collectionId,
      node: mount,
      moneyFormat: STORE_CONFIG.moneyFormat,
      options: buildCollectionOptions(),
    });
  }

  function initShopifyCart() {
    if (state.initPromise) {
      return state.initPromise;
    }

    state.initPromise = loadShopifySdk()
      .then(function () {
        var client = ShopifyBuy.buildClient({
          domain: STORE_CONFIG.domain,
          storefrontAccessToken: STORE_CONFIG.storefrontAccessToken,
        });

        return ShopifyBuy.UI.onReady(client);
      })
      .then(function (ui) {
        state.ui = ui;
        return createSharedCart(ui).then(function () {
          return mountCollection(ui);
        }).then(function () {
          return ui;
        });
      })
      .then(function (ui) {
        observeCartState();
        hideDefaultToggle();
        syncCartBadge();
        return ui;
      })
      .catch(function (error) {
        state.initPromise = null;
        throw error;
      });

    return state.initPromise;
  }

  window.__windRiverShopifyCart = {
    bindCartTriggers: bindCartTriggers,
    init: initShopifyCart,
  };

  bindCartTriggers();
  syncCartBadge();
  initShopifyCart().catch(function (error) {
    console.error(error);
  });
})();
