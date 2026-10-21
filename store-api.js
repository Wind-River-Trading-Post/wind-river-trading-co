// This is the existing public Storefront token, not an Admin API credential.
const ENDPOINT = "https://au0k9n-1k.myshopify.com/api/2026-07/graphql.json";
const TOKEN = "5f29155f262d24f52aeecfde17190129";
const COLLECTION = "gid://shopify/Collection/495491317985";
const PRODUCT_FIELDS = `id handle title description productType availableForSale
  images(first:12) { nodes { url altText width height } }
  variants(first:100) { nodes { id title availableForSale price { amount currencyCode }
    selectedOptions { name value } image { url altText } } }`;
const CART_FIELDS = `id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } }
  lines(first:250) { nodes { id quantity cost { totalAmount { amount currencyCode } }
    merchandise { ... on ProductVariant { id title availableForSale image { url altText }
      product { title handle } price { amount currencyCode } } } } }`;

export function categoryFor(product) {
  const name = product.title.toLowerCase();
  if (/earring|beaded hoops|geometric diamonds/.test(name)) return "earrings";
  if (/purse|wallet|pouch|bag/.test(name)) return "bags";
  return "accessories";
}
export const categories = {
  earrings: "Earrings",
  bags: "Bags & wallets",
  accessories: "Accessories",
};
export function priceFor(product) {
  const prices = product.variants.nodes.map((v) => Number(v.price.amount));
  return Math.min(...prices);
}
export function filterProducts(
  products,
  { category = "all", search = "", sort = "featured" } = {},
) {
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const result = products.filter(
    (p) =>
      (category === "all" || categoryFor(p) === category) &&
      terms.every((term) =>
        `${p.title} ${p.description}`.toLowerCase().includes(term),
      ),
  );
  if (sort === "price-asc") result.sort((a, b) => priceFor(a) - priceFor(b));
  if (sort === "price-desc") result.sort((a, b) => priceFor(b) - priceFor(a));
  if (sort === "name") result.sort((a, b) => a.title.localeCompare(b.title));
  return result;
}
export function createStoreClient({
  fetcher = globalThis.fetch,
  storage,
  timeout = 20000,
} = {}) {
  const key = "wind-river-cart-v2";
  const legacyKey = `${TOKEN}.au0k9n-1k.myshopify.com.checkoutId`;
  let catalogPromise,
    currentCart,
    queue = Promise.resolve();
  const readId = () => {
    try {
      const current = storage?.getItem(key);
      const legacy = storage?.getItem(legacyKey);
      // The current Buy Button SDK stores Cart IDs under its older checkout key.
      return (
        current || (legacy?.startsWith("gid://shopify/Cart/") ? legacy : null)
      );
    } catch {
      return currentCart?.id || null;
    }
  };
  function remember(cart) {
    currentCart = cart;
    try {
      if (cart) storage?.setItem(key, cart.id);
      else {
        storage?.removeItem(key);
        if (storage?.getItem(legacyKey)?.startsWith("gid://shopify/Cart/"))
          storage?.removeItem(legacyKey);
      }
    } catch {
      /* In-memory cart still works when storage is unavailable. */
    }
    return cart;
  }
  async function request(query, variables = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetcher(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": TOKEN,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          "The store is temporarily unavailable. Please try again.",
        );
      const result = await response.json();
      if (result.errors?.length || !result.data)
        throw new Error(
          "The store could not complete this request. Please try again.",
        );
      return result.data;
    } catch (error) {
      if (error.name === "AbortError")
        throw new Error(
          "The store took too long to respond. Please try again.",
        );
      if (error instanceof TypeError)
        throw new Error(
          "We couldn’t reach the store. Check your connection and try again.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async function catalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = (async () => {
      let cursor = null,
        products = [];
      do {
        const data = await request(
          `query Catalog($id:ID!, $cursor:String) { collection(id:$id) { products(first:100,after:$cursor) { pageInfo { hasNextPage endCursor } nodes { ${PRODUCT_FIELDS} } } } }`,
          { id: COLLECTION, cursor },
        );
        if (!data.collection)
          throw new Error(
            "The collection is unavailable. Please call the store for help.",
          );
        const connection = data.collection.products;
        products.push(...connection.nodes);
        const next = connection.pageInfo.hasNextPage
          ? connection.pageInfo.endCursor
          : null;
        if (next && next === cursor)
          throw new Error(
            "The collection could not finish loading. Please try again.",
          );
        cursor = next;
      } while (cursor);
      return products;
    })().catch((error) => {
      catalogPromise = null;
      throw error;
    });
    return catalogPromise;
  }
  async function refreshCart() {
    const id = currentCart?.id || readId();
    if (!id) return null;
    const data = await request(
      `query SavedCart($id:ID!) { cart(id:$id) { ${CART_FIELDS} } }`,
      { id },
    );
    return remember(data.cart);
  }
  function enqueue(action) {
    const pending = queue.then(action);
    queue = pending.catch(() => {});
    return pending;
  }
  function result(payload) {
    if (payload.userErrors?.length)
      throw new Error(payload.userErrors.map((e) => e.message).join(" "));
    if (!payload.cart)
      throw new Error("Your bag could not be updated. Please try again.");
    return { cart: remember(payload.cart), warnings: payload.warnings || [] };
  }
  const payloadFields = `cart { ${CART_FIELDS} } userErrors { field message } warnings { message }`;
  function add(merchandiseId, quantity = 1) {
    return enqueue(async () => {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
        throw new Error("Choose a quantity between 1 and 99.");
      const cart = await refreshCart();
      const lines = [{ merchandiseId, quantity }];
      if (!cart) {
        const data = await request(
          `mutation AddFirstItem($input:CartInput!) { cartCreate(input:$input) { ${payloadFields} } }`,
          { input: { lines } },
        );
        return result(data.cartCreate);
      }
      const data = await request(
        `mutation AddItems($cartId:ID!, $lines:[CartLineInput!]!) { cartLinesAdd(cartId:$cartId,lines:$lines) { ${payloadFields} } }`,
        { cartId: cart.id, lines },
      );
      return result(data.cartLinesAdd);
    });
  }
  function update(lineId, quantity) {
    return enqueue(async () => {
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99)
        throw new Error("Choose a quantity between 0 and 99.");
      const cart = await refreshCart();
      if (!cart)
        throw new Error("Your bag has expired. Please add your items again.");
      if (!cart.lines.nodes.some((line) => line.id === lineId))
        return {
          cart,
          warnings: [{ message: "This item is no longer in your bag." }],
        };
      if (!quantity) {
        const data = await request(
          `mutation RemoveItem($cartId:ID!, $lineIds:[ID!]!) { cartLinesRemove(cartId:$cartId,lineIds:$lineIds) { ${payloadFields} } }`,
          { cartId: cart.id, lineIds: [lineId] },
        );
        return result(data.cartLinesRemove);
      }
      const data = await request(
        `mutation UpdateItem($cartId:ID!, $lines:[CartLineUpdateInput!]!) { cartLinesUpdate(cartId:$cartId,lines:$lines) { ${payloadFields} } }`,
        { cartId: cart.id, lines: [{ id: lineId, quantity }] },
      );
      return result(data.cartLinesUpdate);
    });
  }
  return { catalog, getCart: () => enqueue(refreshCart), add, update };
}
