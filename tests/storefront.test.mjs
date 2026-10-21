import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createStoreClient,
  categoryFor,
  filterProducts,
} from "../store-api.js";

function harness(responses, initialId = null) {
  const saved = new Map(initialId ? [["wind-river-cart-v2", initialId]] : []),
    calls = [];
  const storage = {
    getItem: (k) => saved.get(k),
    setItem: (k, v) => saved.set(k, v),
    removeItem: (k) => saved.delete(k),
  };
  const client = createStoreClient({
    storage,
    fetcher: async (url, options) => {
      const call = JSON.parse(options.body);
      calls.push(call);
      const result = responses.shift();
      if (result instanceof Error) throw result;
      assert.ok(result, "Unexpected request");
      return { ok: true, json: async () => result };
    },
  });
  return { client, calls, saved };
}
const cart = (quantity = 1) => ({
  id: "saved-cart",
  totalQuantity: quantity,
  lines: { nodes: quantity ? [{ id: "line-1", quantity }] : [] },
});
const payload = (value) => ({ cart: value, userErrors: [], warnings: [] });
const catalogPage = (nodes, next = null) => ({
  data: {
    collection: {
      products: { nodes, pageInfo: { hasNextPage: !!next, endCursor: next } },
    },
  },
});
test("catalog follows pagination and shares one request chain", async () => {
  const h = harness([
    catalogPage([{ id: 1 }], "next"),
    catalogPage([{ id: 2 }]),
  ]);
  const [a, b] = await Promise.all([h.client.catalog(), h.client.catalog()]);
  assert.deepEqual(a, [{ id: 1 }, { id: 2 }]);
  assert.equal(a, b);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].variables.cursor, "next");
});
test("catalog network failure can be retried", async () => {
  const h = harness([new TypeError("offline"), catalogPage([])]);
  await assert.rejects(h.client.catalog(), /connection/);
  assert.deepEqual(await h.client.catalog(), []);
});
test("expired saved cart creates a new cart only when an item is added", async () => {
  const h = harness(
    [{ data: { cart: null } }, { data: { cartCreate: payload(cart()) } }],
    "expired",
  );
  const result = await h.client.add("variant-1", 1);
  assert.equal(result.cart.totalQuantity, 1);
  assert.deepEqual(h.calls[1].variables.input.lines, [
    { merchandiseId: "variant-1", quantity: 1 },
  ]);
  assert.equal(h.saved.get("wind-river-cart-v2"), "saved-cart");
});
test("rapid additions are serialized and retain the first item", async () => {
  const h = harness([
    { data: { cartCreate: payload(cart()) } },
    { data: { cart: cart() } },
    { data: { cartLinesAdd: payload(cart(2)) } },
  ]);
  const result = await Promise.all([
    h.client.add("variant-1"),
    h.client.add("variant-2"),
  ]);
  assert.equal(result[1].cart.totalQuantity, 2);
  assert.match(h.calls[0].query, /cartCreate/);
  assert.match(h.calls[2].query, /cartLinesAdd/);
});
test("quantity zero removes the correct cart line", async () => {
  const h = harness(
    [
      { data: { cart: cart() } },
      { data: { cartLinesRemove: payload(cart(0)) } },
    ],
    "saved-cart",
  );
  assert.equal((await h.client.update("line-1", 0)).cart.totalQuantity, 0);
  assert.deepEqual(h.calls[1].variables.lineIds, ["line-1"]);
});
test("inventory warnings are returned with Shopify’s actual quantity", async () => {
  const h = harness(
    [
      { data: { cart: cart() } },
      {
        data: {
          cartLinesUpdate: {
            ...payload(cart()),
            warnings: [{ message: "Only one available." }],
          },
        },
      },
    ],
    "saved-cart",
  );
  const result = await h.client.update("line-1", 2);
  assert.equal(result.cart.totalQuantity, 1);
  assert.equal(result.warnings[0].message, "Only one available.");
});
test("mutation errors do not discard the saved cart or block a later retry", async () => {
  const h = harness(
    [
      { data: { cart: cart() } },
      {
        data: {
          cartLinesAdd: {
            cart: null,
            userErrors: [{ message: "Unavailable" }],
          },
        },
      },
      { data: { cart: cart() } },
      { data: { cartLinesAdd: payload(cart(2)) } },
    ],
    "saved-cart",
  );
  await assert.rejects(h.client.add("variant-2"), /Unavailable/);
  assert.equal(h.saved.get("wind-river-cart-v2"), "saved-cart");
  assert.equal((await h.client.add("variant-2")).cart.totalQuantity, 2);
});
test("invalid quantities are rejected without contacting Shopify", async () => {
  const h = harness([]);
  for (const q of [0, -1, 1.5, 100, NaN])
    await assert.rejects(h.client.add("variant", q), /quantity/);
  assert.equal(h.calls.length, 0);
});
test("cart works when local storage is blocked", async () => {
  const client = createStoreClient({
    storage: {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
    },
    fetcher: async () => ({
      ok: true,
      json: async () => ({ data: { cartCreate: payload(cart()) } }),
    }),
  });
  assert.equal((await client.add("variant")).cart.totalQuantity, 1);
});
test("saved Buy Button carts are carried into the new bag", async () => {
  const values = new Map([
    [
      "5f29155f262d24f52aeecfde17190129.au0k9n-1k.myshopify.com.checkoutId",
      "gid://shopify/Cart/legacy?key=example",
    ],
  ]);
  let variables;
  const client = createStoreClient({
    storage: {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    },
    fetcher: async (url, opts) => {
      variables = JSON.parse(opts.body).variables;
      return { ok: true, json: async () => ({ data: { cart: cart() } }) };
    },
  });
  await client.getCart();
  assert.equal(variables.id, "gid://shopify/Cart/legacy?key=example");
  assert.equal(values.get("wind-river-cart-v2"), "saved-cart");
});
test("category, keyword and numeric price filters compose without changing source order", () => {
  const product = (title, amount) => ({
    title,
    description: "Glass beads",
    variants: { nodes: [{ price: { amount } }] },
  });
  const products = [
    product("Blue Earrings", "120"),
    product("Red Earrings", "80"),
    product("Blue Coin Purse", "500"),
    product("Rose Hair Piece", "60"),
  ];
  assert.equal(categoryFor(products[2]), "bags");
  assert.equal(categoryFor(products[3]), "accessories");
  assert.equal(
    categoryFor({ title: "Yellow Beaded Hoops With Center Feather" }),
    "earrings",
  );
  assert.deepEqual(
    filterProducts(products, {
      category: "earrings",
      search: "beads",
      sort: "price-asc",
    }).map((p) => p.title),
    ["Red Earrings", "Blue Earrings"],
  );
  assert.equal(products[0].title, "Blue Earrings");
});
test("local pages, images and fragment links resolve", () => {
  const root = path.resolve(import.meta.dirname, "..");
  for (const file of fs.readdirSync(root).filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    for (const [, raw] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|tel:|mailto:)/.test(raw)) continue;
      const [part, fragment] = raw.split("#"),
        target = path.resolve(root, part.split("?")[0] || file);
      assert.ok(fs.existsSync(target), `${file}: ${raw}`);
      if (fragment && target.endsWith(".html"))
        assert.ok(
          fs.readFileSync(target, "utf8").includes(`id="${fragment}"`),
          `${file}: ${raw}`,
        );
    }
  }
});
