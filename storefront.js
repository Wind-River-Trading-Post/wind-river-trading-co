import "./site.js";
import {
  createStoreClient,
  categoryFor,
  categories,
  priceFor,
  filterProducts,
} from "./store-api.js";
const $ = (selector) => document.querySelector(selector);
let storage;
try {
  storage = window.localStorage;
} catch {}
const store = createStoreClient({ storage });
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (amount, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Number(amount) % 1 ? 2 : 0,
  }).format(Number(amount));
const productUrl = (p) => `product.html?handle=${encodeURIComponent(p.handle)}`;
const arrow =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
function imageUrl(url, width = 640) {
  if (!url) return "";
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== "cdn.shopify.com") return "";
  u.searchParams.set("width", width);
  return u.href;
}
function productCard(p) {
  const photo = p.images.nodes[0],
    price = priceFor(p),
    currency = p.variants.nodes[0]?.price.currencyCode || "USD";
  const from = p.variants.nodes.some((v) => Number(v.price.amount) !== price);
  return `<article class="product-card"><a class="product-photo" href="${productUrl(p)}" tabindex="-1" aria-hidden="true">
    ${photo ? `<img src="${escape(imageUrl(photo.url))}" srcset="${escape(imageUrl(photo.url, 320))} 320w, ${escape(imageUrl(photo.url, 640))} 640w, ${escape(imageUrl(photo.url, 960))} 960w" sizes="(max-width:600px) 45vw, (max-width:1000px) 30vw, 24vw" alt="" loading="lazy" width="600" height="750">` : "<span>Photo coming soon</span>"}
    <span class="product-look">Take a closer look ${arrow}</span>${p.availableForSale ? "" : '<span class="sold-out">Sold out</span>'}</a>
    <div class="product-caption"><p class="product-category">${categories[categoryFor(p)]}</p><h3><a href="${productUrl(p)}">${escape(p.title)}${p.availableForSale ? "" : '<span class="sr-only"> — Sold out</span>'}</a></h3><p class="product-price">${from ? "From " : ""}${money(price, currency)}</p></div></article>`;
}
function errorPanel(target, error, retry) {
  const heading = target.matches("[data-product-detail]") ? "h1" : "h2";
  target.innerHTML = `<div class="empty-state"><${heading}>Let’s try that again.</${heading}><p>${escape(error.message)}</p><button class="btn" data-retry>Try again</button><a class="text-link" href="tel:+13073323267">Call the store for help</a></div>`;
  target.querySelector("[data-retry]").addEventListener("click", retry);
}
async function loadFeatured() {
  const target = $("[data-featured]");
  if (!target) return;
  target.setAttribute("aria-busy", "true");
  try {
    const all = await store.catalog();
    const preferred = [
      "turquoise-feather-diamond-earrings",
      "beaded-red-rose-blue-coin-purse",
      "yellow-beaded-hoops-with-center-feather",
      "multicolored-flower-medallion",
    ];
    const featured = preferred
      .map((h) => all.find((p) => p.handle === h && p.availableForSale))
      .filter(Boolean);
    featured.push(
      ...all
        .filter((p) => p.availableForSale && !featured.includes(p))
        .slice(0, 4 - featured.length),
    );
    target.innerHTML = featured.length
      ? featured.map(productCard).join("")
      : '<p>New pieces are on their way. <a href="contact.html">Contact the store for current stock.</a></p>';
  } catch (error) {
    errorPanel(target, error, loadFeatured);
  } finally {
    target.setAttribute("aria-busy", "false");
  }
}
async function loadShop() {
  const target = $("[data-catalog]");
  if (!target) return;
  const params = new URLSearchParams(location.search);
  const filters = {
    category: Object.hasOwn(categories, params.get("category"))
      ? params.get("category")
      : "all",
    search: params.get("q") || "",
    sort: ["price-asc", "price-desc", "name"].includes(params.get("sort"))
      ? params.get("sort")
      : "featured",
  };
  let all,
    limit = 24;
  const search = $("#shop-search"),
    sort = $("#shop-sort"),
    more = $("[data-load-more]"),
    count = $("[data-result-count]");
  search.value = filters.search;
  sort.value = filters.sort;
  function render(updateUrl = false) {
    const results = filterProducts(all, filters);
    document
      .querySelectorAll("[data-category]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.category === filters.category),
        ),
      );
    count.textContent = `${results.length} ${results.length === 1 ? "piece" : "pieces"}${filters.search ? " matching your search" : ""}`;
    target.innerHTML = results.length
      ? results.slice(0, limit).map(productCard).join("")
      : '<div class="empty-state"><h2>No pieces found.</h2><p>Try another color, product name, or category.</p><button class="btn" data-clear-search>Clear filters</button></div>';
    target
      .querySelector("[data-clear-search]")
      ?.addEventListener("click", () => {
        filters.category = "all";
        filters.search = "";
        search.value = "";
        limit = 24;
        render(true);
        search.focus();
      });
    more.hidden = results.length <= limit;
    if (!more.hidden)
      more.textContent = `Show more (${results.length - limit} remaining)`;
    if (updateUrl) {
      const q = new URLSearchParams();
      if (filters.category !== "all") q.set("category", filters.category);
      if (filters.search) q.set("q", filters.search);
      if (filters.sort !== "featured") q.set("sort", filters.sort);
      history.replaceState(null, "", `shop.html${q.size ? "?" + q : ""}`);
    }
  }
  async function load() {
    target.setAttribute("aria-busy", "true");
    count.textContent = "Loading the collection…";
    try {
      all = await store.catalog();
      document.querySelectorAll("[data-category-count]").forEach((el) => {
        el.textContent =
          el.dataset.categoryCount === "all"
            ? all.length
            : all.filter((p) => categoryFor(p) === el.dataset.categoryCount)
                .length;
      });
      render();
    } catch (error) {
      count.textContent = "The collection could not load.";
      errorPanel(target, error, load);
      more.hidden = true;
    } finally {
      target.setAttribute("aria-busy", "false");
    }
  }
  document.querySelectorAll("[data-category]").forEach((b) =>
    b.addEventListener("click", () => {
      filters.category = b.dataset.category;
      limit = 24;
      if (all) render(true);
    }),
  );
  search.addEventListener("input", () => {
    filters.search = search.value;
    limit = 24;
    if (all) render(true);
  });
  sort.addEventListener("change", () => {
    filters.sort = sort.value;
    limit = 24;
    if (all) render(true);
  });
  more.addEventListener("click", () => {
    const previous = limit;
    limit += 24;
    render();
    target.querySelectorAll("h3 a")[previous]?.focus();
  });
  await load();
}
async function loadProduct() {
  const target = $("[data-product-detail]");
  if (!target) return;
  target.setAttribute("aria-busy", "true");
  try {
    const all = await store.catalog(),
      product = all.find(
        (p) => p.handle === new URLSearchParams(location.search).get("handle"),
      );
    if (!product) {
      target.innerHTML =
        '<div class="empty-state"><h1>This piece is no longer listed.</h1><p>There are more discoveries in the current collection.</p><a class="btn" href="shop.html">Explore the shop</a></div>';
      return;
    }
    document.title = `${product.title} | Wind River Trading Company`;
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute(
        "href",
        `https://wrtradingcompany.com/${productUrl(product)}`,
      );
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", product.description.slice(0, 160));
    const category = categoryFor(product),
      photos = product.images.nodes;
    let variant =
      product.variants.nodes.find((v) => v.availableForSale) ||
      product.variants.nodes[0];
    target.innerHTML = `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="shop.html">Shop</a><span>/</span><a href="shop.html?category=${category}">${categories[category]}</a></nav><div class="product-detail-grid">
      <div class="product-gallery"><div class="detail-photo">${photos[0] ? `<img data-main-photo src="${escape(imageUrl(photos[0].url, 1200))}" alt="${escape(photos[0].altText || product.title)}" width="900" height="1125">` : "<p>Photo coming soon</p>"}</div>
      <div class="thumbnails" aria-label="Product photographs">${photos.map((photo, i) => `<button type="button" data-photo="${i}" aria-label="View photo ${i + 1} of ${photos.length}" aria-pressed="${i === 0}"><img src="${escape(imageUrl(photo.url, 160))}" alt="" width="80" height="80"></button>`).join("")}</div></div>
      <div class="product-info"><p class="eyebrow">${categories[category]} · Wind River Trading Company</p><h1>${escape(product.title)}</h1><p class="detail-price" data-variant-price>${money(variant.price.amount, variant.price.currencyCode)}</p><p class="availability" data-availability>${variant.availableForSale ? "Available to order" : "Currently sold out"}</p>
      <form data-product-form>${product.variants.nodes.length > 1 ? `<label class="field-label" for="product-option">Choose an option</label><select id="product-option" name="variant">${product.variants.nodes.map((v) => `<option value="${escape(v.id)}" ${v.id === variant.id ? "selected" : ""}>${escape(v.title)}${v.availableForSale ? "" : " — sold out"}</option>`).join("")}</select>` : ""}
      <div class="purchase-row"><div><label class="field-label" for="product-quantity">Quantity</label><input id="product-quantity" type="number" name="quantity" value="1" min="1" max="99" step="1" inputmode="numeric" required></div><button class="btn add-button" type="submit" ${variant.availableForSale ? "" : "disabled"}>${variant.availableForSale ? "Add to bag" : "Sold out"} ${arrow}</button></div><p class="form-status" data-product-message role="status" aria-live="polite"></p></form>
      <p class="purchase-note">Review shipping and your final total at checkout.<br /><a class="policy-link" href="shipping.html">Shipping policy (draft)</a></p>
      <details open><summary>About this piece</summary><p class="product-description">${escape(product.description || "For more details about this piece, call (307) 332-3267.").replace(/\s*(?=(?:Length|Width|Height|Diameter|Materials|Weight|Strap|Pouch):)/g, "\n")}</p></details>
      <details><summary>Questions before ordering?</summary><p>Need a closer look, help with sizing, or information about shipping and returns? Talk with the store before ordering.</p><a class="text-link" href="tel:+13073323267">Call (307) 332-3267</a></details>
      <a class="product-store-note" href="about.html">From our trading post in Fort Washakie, Wyoming. <span aria-hidden="true">↗</span></a></div></div>`;
    target.querySelectorAll("[data-photo]").forEach((b) =>
      b.addEventListener("click", () => {
        const photo = photos[Number(b.dataset.photo)],
          image = target.querySelector("[data-main-photo]");
        image.src = imageUrl(photo.url, 1200);
        image.alt = photo.altText || product.title;
        target
          .querySelectorAll("[data-photo]")
          .forEach((other) =>
            other.setAttribute("aria-pressed", String(other === b)),
          );
      }),
    );
    const form = target.querySelector("form"),
      addButton = form.querySelector('button[type="submit"]'),
      message = form.querySelector("[data-product-message]");
    form.querySelector("select")?.addEventListener("change", (e) => {
      variant = product.variants.nodes.find((v) => v.id === e.target.value);
      target.querySelector("[data-variant-price]").textContent = money(
        variant.price.amount,
        variant.price.currencyCode,
      );
      target.querySelector("[data-availability]").textContent =
        variant.availableForSale ? "Available to order" : "Currently sold out";
      addButton.disabled = !variant.availableForSale;
      addButton.innerHTML =
        (variant.availableForSale ? "Add to bag" : "Sold out") + " " + arrow;
      message.textContent = "";
      if (variant.image && target.querySelector("[data-main-photo]"))
        target.querySelector("[data-main-photo]").src = imageUrl(
          variant.image.url,
          1200,
        );
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const quantity = Number(form.elements.quantity.value);
      addButton.disabled = true;
      addButton.textContent = "Adding…";
      message.textContent = "";
      try {
        const result = await store.add(variant.id, quantity);
        renderCart(result.cart);
        showBag(addButton);
        bagMessage.textContent =
          result.warnings.map((w) => w.message).join(" ") ||
          "Added to your bag.";
      } catch (error) {
        message.textContent = error.message;
      } finally {
        addButton.disabled = !variant.availableForSale;
        addButton.innerHTML =
          (variant.availableForSale ? "Add to bag" : "Sold out") + " " + arrow;
      }
    });
    const related = all
      .filter(
        (p) =>
          p.id !== product.id &&
          categoryFor(p) === category &&
          p.availableForSale,
      )
      .slice(0, 4);
    $("[data-related-section]").hidden = !related.length;
    $("[data-related]").innerHTML = related.map(productCard).join("");
  } catch (error) {
    errorPanel(target, error, loadProduct);
  } finally {
    target.setAttribute("aria-busy", "false");
  }
}
const bag = $("#shopping-bag"),
  bagBody = $("[data-bag-items]"),
  bagMessage = $("[data-bag-message]");
let activeCart = null,
  busy = false,
  bagReturnFocus;
function setBadge(cart) {
  const count = cart?.totalQuantity || 0;
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = count;
    el.hidden = !count;
  });
  document
    .querySelectorAll("[data-cart-trigger]")
    .forEach((el) =>
      el.setAttribute(
        "aria-label",
        `Open shopping bag${count ? `, ${count} ${count === 1 ? "item" : "items"}` : ""}`,
      ),
    );
}
function showBag(trigger) {
  if (!bag.open) {
    bagReturnFocus = trigger || document.activeElement;
    bag.showModal();
  }
}
function renderCart(cart) {
  activeCart = cart;
  setBadge(cart);
  const lines = cart?.lines.nodes || [];
  bagBody.innerHTML = lines.length
    ? lines
        .map((line) => {
          const item = line.merchandise;
          return `<article class="bag-item"><a href="${productUrl(item.product)}" tabindex="-1" aria-hidden="true">${item.image ? `<img src="${escape(imageUrl(item.image.url, 180))}" alt="" width="90" height="112">` : ""}</a><div><h3><a href="${productUrl(item.product)}">${escape(item.product.title)}</a></h3>${item.title === "Default Title" ? "" : `<p>${escape(item.title)}</p>`}<p>${money(line.cost.totalAmount.amount, line.cost.totalAmount.currencyCode)}</p><div class="quantity-row"><div class="quantity-control" role="group" aria-label="Quantity for ${escape(item.product.title)}"><button type="button" data-line="${escape(line.id)}" data-quantity="${line.quantity - 1}" aria-label="Decrease quantity of ${escape(item.product.title)}">−</button><span aria-live="polite">${line.quantity}</span><button type="button" data-line="${escape(line.id)}" data-quantity="${line.quantity + 1}" aria-label="Increase quantity of ${escape(item.product.title)}" ${line.quantity >= 99 ? "disabled" : ""}>+</button></div><button class="remove-item" type="button" data-line="${escape(line.id)}" data-quantity="0" aria-label="Remove ${escape(item.product.title)}">Remove</button></div></div></article>`;
        })
        .join("")
    : `<div class="empty-bag"><p class="eyebrow">Room for a discovery</p><h3>Your bag is empty.</h3><p>Find a piece that speaks to you.</p><a href="shop.html" class="btn">Explore the collection ${arrow}</a></div>`;
  $("[data-bag-summary]").hidden = !lines.length;
  $("[data-subtotal]").textContent = cart
    ? money(
        cart.cost.subtotalAmount.amount,
        cart.cost.subtotalAmount.currencyCode,
      )
    : "";
}
function setBusy(value) {
  busy = value;
  bag.setAttribute("aria-busy", String(value));
  bag
    .querySelectorAll("[data-line],[data-checkout]")
    .forEach(
      (b) =>
        (b.disabled =
          value || (b.dataset.quantity && Number(b.dataset.quantity) > 99)),
    );
}
document.querySelectorAll("[data-cart-trigger]").forEach((b) =>
  b.addEventListener("click", async () => {
    showBag(b);
    if (busy) return;
    bagMessage.textContent = "Loading your bag…";
    setBusy(true);
    try {
      renderCart(await store.getCart());
      bagMessage.textContent = "";
    } catch (error) {
      bagMessage.textContent = error.message;
    } finally {
      setBusy(false);
    }
  }),
);
bag.addEventListener("close", () => {
  if (bagReturnFocus?.isConnected && !bagReturnFocus.disabled)
    bagReturnFocus.focus();
});
bag.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const controls = [
    ...bag.querySelectorAll(
      "a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled)",
    ),
  ].filter((el) => el.tabIndex >= 0 && el.getClientRects().length);
  const first = controls[0],
    last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
bag
  .querySelector("[data-close-bag]")
  .addEventListener("click", () => bag.close());
bag.addEventListener("click", (e) => {
  const r = bag.getBoundingClientRect();
  if (
    e.target === bag &&
    (e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom)
  )
    bag.close();
});
bagBody.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-line]");
  if (!b || busy) return;
  const id = b.dataset.line,
    actionLabel = b.getAttribute("aria-label"),
    quantity = Number(b.dataset.quantity),
    increasing =
      activeCart?.lines.nodes.find((l) => l.id === id)?.quantity < quantity;
  setBusy(true);
  bagMessage.textContent = "Updating your bag…";
  try {
    const result = await store.update(id, quantity);
    renderCart(result.cart);
    const actual =
      result.cart.lines.nodes.find((l) => l.id === id)?.quantity || 0;
    bagMessage.textContent =
      result.warnings.map((w) => w.message).join(" ") ||
      (increasing && actual < quantity
        ? "Only the available quantity could be added."
        : "Bag updated.");
    const availableControls = [
      ...bagBody.querySelectorAll("[data-line]"),
    ].filter((button) => button.dataset.line === id && !button.disabled);
    const replacement =
      availableControls.find(
        (button) => button.getAttribute("aria-label") === actionLabel,
      ) || availableControls[0];
    (replacement || bag.querySelector("[data-close-bag]")).focus();
  } catch (error) {
    bagMessage.textContent = error.message;
  } finally {
    setBusy(false);
  }
});
$("[data-checkout]").addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  bagMessage.textContent = "Preparing checkout…";
  try {
    const cart = await store.getCart();
    renderCart(cart);
    if (!cart?.totalQuantity) {
      bagMessage.textContent = "Your bag is empty.";
      return;
    }
    const destination = new URL(cart.checkoutUrl);
    if (
      destination.protocol !== "https:" ||
      ![
        "au0k9n-1k.myshopify.com",
        "wind-river-trading-company-2.myshopify.com",
        "wrtradingcompany.com",
        "www.wrtradingcompany.com",
      ].includes(destination.hostname)
    )
      throw new Error(
        "Checkout is unavailable. Please call the store for help.",
      );
    window.location.assign(destination.href);
  } catch (error) {
    bagMessage.textContent = error.message;
  } finally {
    setBusy(false);
  }
});
renderCart(null);
store
  .getCart()
  .then((cart) => {
    if (!busy) renderCart(cart);
  })
  .catch(() => {});
loadFeatured();
loadShop();
loadProduct();
