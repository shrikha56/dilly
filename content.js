console.warn("[Dilly] Content script loaded on:", window.location.href);

/** Cart POSTs (fetch/XHR) can fire without an add click — only pause if user just interacted */
let lastTrustedUserActivationAt = 0;
const NETWORK_PAUSE_GESTURE_MS = 5000;

function bumpUserActivation(ev) {
  if (ev && ev.isTrusted) {
    lastTrustedUserActivationAt = Date.now();
  }
}

const DILLY_ROOT_ID = "dilly-overlay-root";
const INTERCEPTABLE_SELECTOR = [
  "button",
  'input[type="submit"]',
  'input[type="button"]',
  '[role="button"]',
  '[class*="add-to-bag"]',
  '[class*="add-to-cart"]',
  '[class*="addToBag"]',
  '[class*="addToCart"]',
  '[class*="add-to-basket"]',
  '[class*="btn-cart"]',
  '[class*="btn-bag"]',
  '[id*="addToBag"]',
  '[id*="addToCart"]',
  '[id*="add-to-cart"]',
  '[id*="buy-now"]',
  '[id*="buyNow"]',
  '[class*="a-button"]',
  '[aria-label*="add to cart" i]',
  '[aria-label*="add to bag" i]',
  '[aria-label*="add to basket" i]',
  '[aria-label*="buy now" i]',
  'a[href*="/cart/add" i]',
  'a[href*="cart_add" i]',
  'a[href*="add-to-cart" i]',
  'a[href*="addtocart" i]',
  'a[href*="add-to-bag" i]',
  'a[href*="addtobag" i]',
  'a[href*="add_to_cart" i]',
  'a[href*="checkout" i]',
  'form[action*="checkout" i] [type="submit"]',
  'form[action*="cart" i] [type="submit"]'
].join(", ");
const BUTTON_KEYWORDS = [
  "add to cart",
  "add to bag",
  "add to basket",
  "add to trolley",
  "buy now",
  "buy it now",
  "shop pay",
  "purchase now",
  "secure checkout",
  "proceed to checkout",
  "go to checkout",
  "complete order",
  "place order",
  "continue to payment",
  "secure payment",
  "pay now",
  "book now",
  "get plan",
  "choose plan",
  "upgrade plan",
  "upgrade to pro",
  "start subscription",
  "subscribe now"
];

const NEGATIVE_BUTTON_KEYWORDS = [
  "size",
  "colour",
  "color",
  "swatch",
  "option",
  "wishlist",
  "quick view",
  "quick shop",
  "quick add",
  "notify me",
  "compare",
  "view product",
  "view details",
  "shop now",
  "see more",
  "learn more",
  "read more",
  "details",
  "share",
  "download",
  "export",
  "save",
  "copy link",
  "print",
  "embed",
  "invite",
  "sign in",
  "sign up",
  "log in",
  "log out",
  "settings",
  "profile",
  "account"
];

const SITE_CONFIGS = [
  {
    name: "Amazon",
    hostPattern: /(^|\.)amazon\./i,
    selectors: [
      "#add-to-cart-button",
      "#buy-now-button",
      '[name="submit.add-to-cart"]',
      '[name="submit.addToCart"]',
      'input[name*="submit.addToCart"]',
      'button[name*="submit.addToCart"]',
      '[aria-label*="add to cart" i]',
      '[aria-label*="buy now" i]',
      '[aria-label*="increase quantity" i]',
      '[id*="add-to-cart" i]',
      '[id*="buy-now" i]',
      '[data-action="add-to-cart"]'
    ],
    priceSelectors: [".a-price .a-offscreen", "#corePrice_feature_div .a-offscreen"],
    cartTotalSelectors: ["#sc-subtotal-amount-activecart", "#subtotal-amount", ".sc-subtotal-activecart .a-offscreen"]
  },
  {
    name: "ASOS",
    hostPattern: /(^|\.)asos\.com$/i,
    selectors: ['[data-test-id="add-button"]', 'button[data-testid="add-button"]'],
    priceSelectors: ['[data-testid="current-price"]', ".current-price", '[data-auto-id="productTilePrice"]']
  },
  {
    name: "Zara",
    hostPattern: /(^|\.)zara\.com$/i,
    selectors: ['button[data-qa-action="add-to-cart"]', 'button[data-qa-action="add-to-cart-sticky"]'],
    priceSelectors: ['[data-qa-anchor="product-price"]', '[class*="price"]']
  },
  {
    name: "H&M",
    hostPattern: /hm\.com$/i,
    selectors: ['button[data-testid="add-to-cart"]', 'button[data-articlecode]', '[data-testid="buy-button"]'],
    priceSelectors: ['[data-testid="formatted-value"]', '[class*="Price"]', '[class*="price"]']
  },
  {
    name: "SHEIN",
    hostPattern: /(^|\.)shein\.com$/i,
    selectors: ['button[aria-label*="bag" i]', 'button[aria-label*="cart" i]', '[class*="add-cart"]'],
    priceSelectors: ['[class*="product-intro__head-price"]', '[class*="from"], [class*="price"]']
  },
  {
    name: "NET-A-PORTER",
    hostPattern: /(^|\.)net-a-porter\.com$/i,
    selectors: ['button[data-testid="add-to-bag"]'],
    priceSelectors: ['[data-testid="price"]', '[class*="Price"]']
  },
  {
    name: "Revolve",
    hostPattern: /(^|\.)revolve\.com$/i,
    selectors: ['button[data-code*="addtocart" i]', 'button.addtocart', '[data-testid="add-to-bag"]'],
    priceSelectors: ['[class*="price"]', '[data-testid="price"]']
  },
  {
    name: "eBay",
    hostPattern: /(^|\.)ebay\./i,
    selectors: ["#atcBtn_btn_1", "#binBtn_btn_1", '[data-testid="x-atc-action"]'],
    priceSelectors: [".x-price-primary span", "#prcIsum", '[data-testid="x-price-primary"]']
  },
  {
    name: "Etsy",
    hostPattern: /(^|\.)etsy\.com$/i,
    selectors: ['button[data-selector="add-to-cart-button"]', '[data-buy-box-region] button'],
    priceSelectors: ['[data-selector="price-only"]', '[data-buy-box-region] p', '[class*="currency-value"]']
  }
];

const SHOPIFY_SELECTORS = [
  'form[action*="/cart/add"] button[type="submit"]',
  'form[action*="/cart/add"] [type="submit"]',
  'button[name="add"]',
  '[data-action*="add-to-cart"]',
  ".shopify-payment-button__button"
];

const SHOPIFY_CART_TOTAL_SELECTORS = [
  '.totals__subtotal-value',
  '[data-cart-subtotal]',
  '.cart__subtotal',
  '.cart-subtotal__price',
  '.cart-drawer__subtotal',
  '[data-cart-total]',
  '.cart-total__price'
];

const GENERIC_PRICE_SELECTORS = [
  '[data-testid*="price"]',
  '[data-test*="price"]',
  '[data-qa*="price"]',
  '[data-price]',
  '[data-product-price]',
  '[data-current-price]',
  '[itemprop="price"]',
  '.product-price',
  '.product__price',
  '[class*="ProductPrice"]',
  '[class*="product-price"]',
  '[class*="productPrice"]',
  '[class*="price"]',
  '[class*="Price"]',
  '[class*="currentPrice"]',
  '[class*="current-price"]',
  '[class*="salePrice"]',
  '[class*="sale-price"]',
  '[class*="offer-price"]',
  '[class*="offerPrice"]',
  '[id*="price"]',
  '[id*="Price"]'
];

const CART_TOTAL_SELECTORS = [
  '[class*="subtotal" i]',
  '[class*="cart-total" i]',
  '[class*="cartTotal" i]',
  '[class*="order-total" i]',
  '[class*="orderTotal" i]',
  '[class*="grand-total" i]',
  '[class*="grandTotal" i]',
  '[data-subtotal]',
  '[data-cart-total]',
  '[data-cart-subtotal]',
  '[data-order-total]',
  '.totals__subtotal-value',
  '.cart__subtotal',
  '#cart-subtotal',
  '[class*="cart__total"]',
  '[class*="cart-subtotal"]',
  '[class*="cartSubtotal"]'
];

const SUPPORT_LINES = [];

const AFFIRMATIONS = [
  "Good call. Your future self thanks you.",
  "Love that for your bank account.",
  "A calm no is still a power move.",
  "That pause looked good on you."
];

let activeOverlay = null;
let networkInterceptActive = false;
const bypassTargets = new WeakSet();
const DEFAULT_SETTINGS = {
  spendingThreshold: 30,
  pauseDurationSeconds: 30,
  intentionalMode: false,
  isPaused: false,
  userGoal: "",
  userName: "",
  goalPromptDismissed: false,
  goalSetAt: null,
  motivationPhotoDataUrl: null
};

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pause headline: personalized when userName is set in the popup. */
function formatPauseHeadline(userName) {
  const trimmed = userName && String(userName).trim();
  if (trimmed) {
    return `${escapeHtml(trimmed)}, do you really <em>need</em> this?`;
  }
  return `Do you really <em>need</em> this?`;
}

function formatHostname(hostname) {
  const cleaned = hostname.replace(/^www\./i, "");
  const primary = cleaned.split(".")[0] || cleaned;
  return primary
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sendRuntimeMessage(message) {
  try {
    const result = chrome.runtime.sendMessage(message);
    return result && typeof result.catch === "function" ? result.catch(() => null) : Promise.resolve(null);
  } catch (error) {
    return Promise.resolve(null);
  }
}

async function getMotivationPhotoDataUrlFromStorage() {
  try {
    const stored = await chrome.storage.local.get("dilly-state");
    const raw = stored?.["dilly-state"]?.settings?.motivationPhotoDataUrl;
    const s = raw && String(raw).trim();
    if (s && /^data:image\//i.test(s)) {
      return s;
    }
  } catch (error) {
    console.warn("[Dilly] motivation photo read failed:", error);
  }
  return null;
}

/**
 * Prefer storage so large data URLs are always current (get-state payloads can omit huge fields).
 */
async function resolveMotivationPhotoDataUrl(settings) {
  const fromStorage = await getMotivationPhotoDataUrlFromStorage();
  if (fromStorage) {
    return fromStorage;
  }
  const s = settings.motivationPhotoDataUrl && String(settings.motivationPhotoDataUrl).trim();
  if (s && /^data:image\//i.test(s)) {
    return s;
  }
  return null;
}

/** Prefer storage so the pause headline matches the popup even if messaging returns stale settings. */
async function resolveUserName(settings) {
  try {
    const stored = await chrome.storage.local.get("dilly-state");
    const raw = stored?.["dilly-state"]?.settings?.userName;
    const fromStorage = raw != null ? String(raw).trim() : "";
    if (fromStorage) {
      return fromStorage;
    }
  } catch (error) {
    console.warn("[Dilly] userName read failed:", error);
  }
  const fallback = settings?.userName && String(settings.userName).trim();
  return fallback || null;
}

function applyMotivationPhotoCircleStyles(wrap, img) {
  if (!wrap || !img) {
    return;
  }
  img.style.setProperty("display", "block", "important");
  img.style.setProperty("width", "100%", "important");
  img.style.setProperty("height", "100%", "important");
  img.style.setProperty("max-width", "none", "important");
  img.style.setProperty("max-height", "none", "important");
  img.style.setProperty("object-fit", "cover", "important");
  img.style.setProperty("object-position", "center", "important");
  img.style.setProperty("border-radius", "50%", "important");
}

async function getState() {
  const response = await sendRuntimeMessage({ action: "get-state" });
  if (response?.ok) {
    return response.data;
  }

  // Fallback: read persisted state directly when runtime messaging is flaky.
  try {
    const stored = await chrome.storage.local.get("dilly-state");
    const parsed = stored?.["dilly-state"];
    if (!parsed) {
      return null;
    }

    const settings = {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings || {})
    };
    const events = Array.isArray(parsed?.stats?.events) ? parsed.stats.events : [];
    const goalProgress =
      typeof globalThis.dillyComputeGoalProgress === "function"
        ? globalThis.dillyComputeGoalProgress(events, settings)
        : null;

    return {
      settings,
      stats: {
        ...(parsed.stats || { events: [] }),
        events,
        goalProgress
      }
    };
  } catch (error) {
    return null;
  }
}

async function recordEvent(eventType, site, price, productKey) {
  console.log(`[Dilly] Recording: ${eventType}, site=${site}, price=${price}, key=${productKey}`);
  const response = await sendRuntimeMessage({
    action: "record-event",
    eventType,
    site,
    price,
    productKey
  });
  if (response?.ok) {
    console.warn("[Dilly] Event saved.");
  } else {
    console.warn("[Dilly] Event save FAILED:", response?.error);
  }
  return response?.ok ? response.data : null;
}

function buildProductKey(siteName) {
  const titleSource =
    document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
    document.querySelector("h1")?.textContent ||
    document.title ||
    "";

  const normalizedTitle = normalizeText(titleSource).slice(0, 120);
  const normalizedPath = `${window.location.origin}${window.location.pathname}`.toLowerCase();
  return `${siteName}::${normalizedPath}::${normalizedTitle}`;
}

function getSiteConfig() {
  const hostname = window.location.hostname;
  return SITE_CONFIGS.find((site) => site.hostPattern.test(hostname)) || null;
}

function isShopifyStore() {
  return (
    Boolean(document.querySelector('form[action*="/cart/add"]')) ||
    Boolean(document.querySelector(".shopify-payment-button__button"))
  );
}

function getActiveSiteName() {
  const siteConfig = getSiteConfig();
  if (siteConfig) {
    return siteConfig.name;
  }

  return formatHostname(window.location.hostname);
}

function getTextSignature(element) {
  return normalizeText(
    [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("name"),
      element.getAttribute("value")
    ].join(" ")
  );
}

function hasBuyingIntentText(text) {
  if (!text) {
    return false;
  }

  if (/(wishlist|compare|notify me)/i.test(text)) {
    return false;
  }

  if (BUTTON_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return true;
  }

  return /\b(checkout|purchase|subscribe|upgrade)\b/i.test(text);
}

function hasIntentInUrlLike(value) {
  const text = normalizeText(value);
  if (!text) {
    return false;
  }
  return /(checkout|purchase|add.to.cart|add.to.bag|buy.now)/i.test(text);
}

function hasCtaIntent(element) {
  if (!(element instanceof Element)) {
    return false;
  }

  const attrs = [
    element.getAttribute("href"),
    element.getAttribute("data-action"),
    element.getAttribute("data-testid"),
    element.getAttribute("aria-label"),
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("class"),
    element.getAttribute("onclick")
  ];

  if (attrs.some((value) => hasIntentInUrlLike(value))) {
    return true;
  }

  const formAction = element.closest("form")?.getAttribute("action");
  if (hasIntentInUrlLike(formAction)) {
    return true;
  }

  return false;
}

function getShortSignature(element) {
  const directText = Array.from(element.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join(" ");

  return normalizeText(
    [
      directText,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("value"),
      element.getAttribute("name"),
      element.getAttribute("data-action")
    ].join(" ")
  );
}

function isInteractiveElement(el) {
  if (!el || !(el instanceof Element)) return false;
  const tag = el.tagName;
  if (tag === "BUTTON" || tag === "A" || tag === "INPUT") return true;
  if (el.getAttribute("role") === "button" || el.getAttribute("role") === "link") return true;
  if (el.hasAttribute("data-cta") || el.hasAttribute("onclick")) return true;
  return false;
}

function findCartAncestor(target) {
  let current = target;
  let depth = 0;

  while (current && depth < 10) {
    if (!(current instanceof Element) || current.id === DILLY_ROOT_ID) {
      return null;
    }

    if (isInteractiveElement(current)) {
      const shortText = getShortSignature(current);
      if (hasBuyingIntentText(shortText)) {
        return current;
      }

      const fullText = getTextSignature(current);
      if (fullText.length < 60 && hasBuyingIntentText(fullText)) {
        return current;
      }
    }

    current = current.parentElement;
    depth += 1;
  }

  return null;
}

function getCandidateTrigger(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  const candidate = target.closest(INTERCEPTABLE_SELECTOR);

  if (candidate && !candidate.closest(`#${DILLY_ROOT_ID}`)) {
    if (candidate.hasAttribute("disabled") || candidate.getAttribute("aria-disabled") === "true") {
      return null;
    }

    const shortText = getShortSignature(candidate);
    const candidateText = getTextSignature(candidate);

    if (candidateText.length > 60) {
      if (hasBuyingIntentText(shortText)) {
        return candidate;
      }
    } else {
      if (hasBuyingIntentText(candidateText)) {
        return candidate;
      }
    }

    if (candidateText.length <= 60 && hasCtaIntent(candidate)) {
      return candidate;
    }

    const siteConfig = getSiteConfig();
    const selectorPool = [...(siteConfig?.selectors || []), ...SHOPIFY_SELECTORS];

    if (
      selectorPool.some((selector) => {
        try {
          return candidate.matches(selector);
        } catch (error) {
          return false;
        }
      })
    ) {
      return candidate;
    }

    const candidateContext = normalizeText(
      [candidate.id, candidate.className].join(" ")
    );

    const looksLikeVariantPicker =
      candidate.matches('[role="radio"], [role="option"]') ||
      NEGATIVE_BUTTON_KEYWORDS.some((keyword) => candidateText.includes(keyword) || candidateContext.includes(keyword));

    if (looksLikeVariantPicker) {
      return null;
    }
  }

  const ancestor = findCartAncestor(target);
  if (ancestor) {
    return ancestor;
  }

  return null;
}

function getCandidateTriggerFromEvent(event) {
  if (event && "submitter" in event) {
    const submitter = event.submitter;
    if (submitter instanceof Element) {
      const submitTrigger = getCandidateTrigger(submitter);
      if (submitTrigger) {
        return submitTrigger;
      }
    }
  }

  const direct = getCandidateTrigger(event.target);
  if (direct) {
    return direct;
  }

  if (typeof event.composedPath !== "function") {
    return null;
  }

  const path = event.composedPath();
  for (const entry of path) {
    if (!(entry instanceof Element)) {
      continue;
    }
    const trigger = getCandidateTrigger(entry);
    if (trigger) {
      return trigger;
    }
  }

  // Amazon quick-add modules often submit hidden forms with non-obvious targets.
  if ((window.location.hostname || "").includes("amazon.")) {
    for (const entry of path) {
      if (!(entry instanceof Element)) {
        continue;
      }

      const amazonForm = entry.closest(
        'form[action*="/cart" i], form[action*="/gp/" i], form[action*="/handle-buy-box" i]'
      );

      if (!amazonForm) {
        continue;
      }

      const amazonButton =
        amazonForm.querySelector('[name*="submit.addToCart" i]') ||
        amazonForm.querySelector('[name*="submit.add-to-cart" i]') ||
        amazonForm.querySelector("#add-to-cart-button") ||
        amazonForm.querySelector('[aria-label*="add to cart" i]') ||
        amazonForm.querySelector('[aria-label*="buy now" i]') ||
        amazonForm.querySelector('[type="submit"]');

      if (amazonButton instanceof Element) {
        return amazonButton;
      }
    }
  }

  return null;
}

function parsePriceFromText(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) {
    return null;
  }

  const patterns = [
    /(?:USD|AUD|CAD|GBP|EUR|NZD|HKD|SGD)?\s*[$£€¥]\s?(\d[\d,]*(?:\.\d{1,2})?)/i,
    /[$£€¥]\s?(\d[\d,]*(?:\.\d{1,2})?)/,
    /(\d[\d,]*\.\d{2})\s*(?:USD|AUD|CAD|GBP|EUR|NZD|HKD|SGD)/i,
    /(?:price|now|sale)[:\s]*[$£€¥]?\s?(\d[\d,]*(?:\.\d{1,2})?)/i,
    /(\d[\d,]*\.\d{2})/
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match || !match[1]) {
      continue;
    }

    const value = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0 || value > 100000) {
      continue;
    }

    return {
      value,
      display: `$${value.toFixed(2)}`
    };
  }

  return null;
}

/**
 * Homepage / JSON price fields often encode cents or minor units; 7000 can display as $7000 when the item is ~$70.
 */
function maybeFixMisscaledPrice(p) {
  if (!p || typeof p.value !== "number" || !Number.isFinite(p.value)) {
    return p;
  }
  const v = p.value;
  if (v >= 1000 && v < 50000 && v % 100 === 0) {
    const asDollars = v / 100;
    if (asDollars >= 10 && asDollars <= 499) {
      return { value: asDollars, display: `$${asDollars.toFixed(2)}` };
    }
  }
  return p;
}

function extractCartTotal() {
  const siteConfig = getSiteConfig();
  const siteCartSelectors = siteConfig?.cartTotalSelectors || [];
  const shopifyCartSelectors = isShopifyStore() ? SHOPIFY_CART_TOTAL_SELECTORS : [];
  const selectors = [...siteCartSelectors, ...shopifyCartSelectors, ...CART_TOTAL_SELECTORS];

  for (const selector of selectors) {
    try {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!node.offsetParent && node.tagName !== "META") continue;

        const text = (node.textContent || "").trim();
        const price = parsePriceFromText(text);
        if (price && price.value >= 1) {
          console.warn("[Dilly] Cart total found via selector:", selector, price.display);
          return price;
        }

        const dataVal = node.getAttribute("data-subtotal") ||
                        node.getAttribute("data-cart-total") ||
                        node.getAttribute("data-cart-subtotal") || "";
        if (dataVal) {
          let numVal = Number(dataVal.replace(/[^0-9.]/g, ""));
          if (Number.isFinite(numVal) && numVal > 0) {
            if (numVal > 10000 && !dataVal.includes(".")) numVal = numVal / 100;
            if (numVal >= 1 && numVal < 100000) {
              const result = { value: numVal, display: `$${numVal.toFixed(2)}` };
              console.warn("[Dilly] Cart total found via data attr:", selector, result.display);
              return result;
            }
          }
        }
      }
    } catch (e) {
      continue;
    }
  }

  const TOTAL_LABELS = /\b(subtotal|cart\s*total|order\s*total|bag\s*total|estimated\s*total)\b/i;
  try {
    const candidates = document.querySelectorAll("span, div, p, td, th, dt, dd, strong, b");
    for (const el of candidates) {
      if (!el.offsetParent) continue;
      const ownText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent)
        .join("")
        .trim();
      if (!TOTAL_LABELS.test(ownText)) continue;

      const row = el.closest("tr, div, li, dl, section") || el.parentElement;
      if (!row) continue;
      const rowText = row.textContent || "";
      const price = parsePriceFromText(rowText.replace(ownText, ""));
      if (price && price.value >= 1) {
        console.warn("[Dilly] Cart total found via label scan:", ownText.trim(), price.display);
        return price;
      }
    }
  } catch (e) {
    // fall through
  }

  return null;
}

function isCheckoutTrigger(trigger) {
  if (!(trigger instanceof Element)) return false;

  const text = normalizeText(
    [trigger.textContent, trigger.getAttribute("aria-label"), trigger.getAttribute("value")].join(" ")
  );

  const CHECKOUT_KEYWORDS = [
    "checkout", "check out", "buy now", "buy it now", "place order",
    "complete order", "pay now", "secure checkout", "proceed to checkout",
    "go to checkout", "continue to payment", "secure payment", "complete purchase"
  ];

  if (CHECKOUT_KEYWORDS.some(kw => text.includes(kw))) return true;

  try {
    const form = trigger.closest("form");
    if (form) {
      const action = (form.getAttribute("action") || "").toLowerCase();
      if (/checkout|payment|order/.test(action)) return true;
    }
  } catch (e) {
    // fall through
  }

  try {
    const href = trigger.getAttribute("href") || "";
    if (/checkout|cart|payment/i.test(href)) return true;
  } catch (e) {
    // fall through
  }

  const isOnCartPage = /\/(cart|bag|basket|checkout)\b/i.test(window.location.pathname);
  if (isOnCartPage) return true;

  return false;
}

function getContainerCandidates(trigger) {
  const candidates = [];
  let current = trigger;
  let depth = 0;

  while (current && depth < 6) {
    if (current instanceof Element) {
      candidates.push(current);
    }
    current = current.parentElement;
    depth += 1;
  }

  const extras = [
    trigger.closest("form"),
    trigger.closest("[data-product-id]"),
    document.querySelector("main"),
    document.body
  ].filter(Boolean);

  return [...new Set([...candidates, ...extras])];
}

function extractPrice(trigger) {
  const siteConfig = getSiteConfig();
  const selectors = [...(siteConfig?.priceSelectors || []), ...GENERIC_PRICE_SELECTORS];
  const containers = getContainerCandidates(trigger);

  for (const container of containers) {
    for (const selector of selectors) {
      try {
        const node = container.querySelector(selector);
        if (!node) {
          continue;
        }
        const parsed = parsePriceFromText(node.textContent || node.getAttribute("content"));
        if (parsed) {
          return parsed;
        }
      } catch (error) {
        continue;
      }
    }

    const containerText = container.textContent || "";
    if (!isNoisyPriceText(containerText)) {
      const fallback = parsePriceFromText(containerText);
      if (fallback) {
        return fallback;
      }
    }
  }

  return extractPriceFromPage();
}

/**
 * Price only from the trigger's ancestors (and its form), not whole-page / main —
 * used to tell newsletter "Subscribe" from a priced subscription or cart CTA.
 */
function extractPriceNearTrigger(trigger) {
  if (!(trigger instanceof Element)) {
    return null;
  }

  const siteConfig = getSiteConfig();
  const selectors = [...(siteConfig?.priceSelectors || []), ...GENERIC_PRICE_SELECTORS];
  const containers = [];
  let current = trigger;
  let depth = 0;

  while (current && depth < 8) {
    if (current === document.body || current === document.documentElement) {
      break;
    }
    containers.push(current);
    current = current.parentElement;
    depth += 1;
  }

  const form = trigger.closest("form");
  if (form && !containers.includes(form)) {
    containers.push(form);
  }

  for (const container of containers) {
    for (const selector of selectors) {
      try {
        const node = container.querySelector(selector);
        if (!node) {
          continue;
        }
        const parsed = parsePriceFromText(node.textContent || node.getAttribute("content"));
        if (parsed) {
          return parsed;
        }
      } catch (error) {
        continue;
      }
    }

    const containerText = container.textContent || "";
    if (!isNoisyPriceText(containerText)) {
      const fallback = parsePriceFromText(containerText);
      if (fallback) {
        return fallback;
      }
    }
  }

  return null;
}

function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function replayOriginalAction(trigger) {
  if (!(trigger instanceof HTMLElement)) {
    return;
  }

  bypassTargets.add(trigger);

  window.setTimeout(() => {
    try {
      if (typeof trigger.click === "function") {
        trigger.click();
      }
    } finally {
      window.setTimeout(() => bypassTargets.delete(trigger), 800);
    }
  }, 0);
}

function formatStatLine(stats) {
  if (!stats) {
    return "A thoughtful pause is still progress.";
  }

  if (stats.pausedThisWeek > 0) {
    return `You've paused ${stats.pausedThisWeek} purchase${stats.pausedThisWeek === 1 ? "" : "s"} this week.`;
  }

  if (stats.reconsideredThisMonth > 0) {
    return `You've reconsidered ${stats.reconsideredThisMonth} purchase${stats.reconsideredThisMonth === 1 ? "" : "s"} this month.`;
  }

  return "A thoughtful pause is still progress.";
}

function removeOverlay() {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}

function mountOverlay({
  siteName,
  price,
  stats,
  pauseSeconds,
  onConfirm,
  onDismiss,
  userGoal,
  goalProgress,
  motivationPhotoDataUrl,
  userName
}) {
  removeOverlay();

  const root = document.createElement("div");
  root.id = DILLY_ROOT_ID;
  root.innerHTML = `
    <div class="dilly-overlay-backdrop"></div>
    <div class="dilly-overlay-dialog" role="dialog" aria-modal="true" aria-labelledby="dilly-headline">
      <div class="dilly-overlay-card">
        <button type="button" class="dilly-overlay-close" data-dismiss-x aria-label="Close">\u00d7</button>

        <p class="dilly-overlay-brand">Dilly</p>
        <div class="dilly-overlay-hero">
          <h2 id="dilly-headline" class="dilly-overlay-headline">${formatPauseHeadline(userName)}</h2>
          <div class="dilly-overlay-photo-stack" data-motivation-photo-wrap hidden>
            <div class="dilly-overlay-motivation-wrap">
              <img class="dilly-overlay-motivation-img" alt="" data-motivation-photo loading="eager" decoding="async" />
            </div>
          </div>
        </div>

        <div class="dilly-overlay-goal-pill" data-user-goal-wrap hidden>
          <span class="dilly-overlay-goal-label">Your goal</span>
          <p class="dilly-overlay-goal-text" data-user-goal></p>
        </div>

        <div class="dilly-overlay-body">
          <div class="dilly-overlay-item-info">
            <span class="dilly-overlay-site-name">${siteName}</span>
            <span class="dilly-overlay-price">${price ? price.display : ""}</span>
          </div>
          <p class="dilly-overlay-reminder">Save here, spend intentionally on what you really love.</p>
          <div class="dilly-overlay-timer-row">
            <div class="dilly-progress-track" aria-hidden="true">
              <div class="dilly-progress-fill" style="width:100%"></div>
            </div>
            <span class="dilly-overlay-timer-text" data-countdown>${pauseSeconds}s</span>
          </div>
        </div>

        <div class="dilly-overlay-actions">
          <button type="button" class="dilly-button dilly-button-primary" data-dismiss>Not today</button>
          <button type="button" class="dilly-button dilly-button-secondary" data-confirm disabled>Yes, add it</button>
        </div>
      </div>
    </div>
  `;

  root.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.documentElement.appendChild(root);
  activeOverlay = root;

  const photoWrap = root.querySelector("[data-motivation-photo-wrap]");
  const photoImg = root.querySelector("[data-motivation-photo]");
  const photoUrl = motivationPhotoDataUrl && String(motivationPhotoDataUrl).trim();
  if (photoUrl && photoWrap && photoImg) {
    applyMotivationPhotoCircleStyles(photoWrap, photoImg);
    photoImg.onerror = function onMotivationPhotoError() {
      this.onerror = null;
      if (photoWrap) {
        photoWrap.hidden = true;
      }
    };
    photoImg.onload = () => {
      applyMotivationPhotoCircleStyles(photoWrap, photoImg);
    };
    photoImg.src = photoUrl;
    photoWrap.hidden = false;
  }

  const goalWrap = root.querySelector("[data-user-goal-wrap]");
  const goalNode = root.querySelector("[data-user-goal]");
  const trimmedGoal = userGoal && String(userGoal).trim();
  if (trimmedGoal && goalWrap && goalNode) {
    goalNode.textContent = trimmedGoal;
    goalWrap.hidden = false;
  }

  const confirmButton = root.querySelector("[data-confirm]");
  const dismissButton = root.querySelector("[data-dismiss]");
  const progressFill = root.querySelector(".dilly-progress-fill");
  const countdownNode = root.querySelector("[data-countdown]");
  const headline = root.querySelector(".dilly-overlay-headline");

  let totalSeconds = pauseSeconds;
  let endTime = 0;
  let timerId = null;

  function stopTimer() {
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function finishTimer() {
    confirmButton.disabled = false;
    progressFill.style.width = "0%";
    countdownNode.textContent = "done";
    stopTimer();
  }

  function startTimer() {
    void (async () => {
      endTime = Date.now() + totalSeconds * 1000;
      confirmButton.disabled = true;
      const freshName = await resolveUserName({ userName });
      headline.innerHTML = formatPauseHeadline(freshName);

      stopTimer();

      const tick = () => {
        const remainingMs = Math.max(0, endTime - Date.now());
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        const remainingRatio = remainingMs / (totalSeconds * 1000);

        countdownNode.textContent = `${remainingSeconds}s`;
        progressFill.style.width = `${Math.max(0, remainingRatio) * 100}%`;

        if (remainingMs <= 0) {
          finishTimer();
        }
      };

      tick();
      timerId = window.setInterval(tick, 120);
    })();
  }

  function refreshPauseHeadlineFromStorage() {
    return resolveUserName({ userName }).then((n) => {
      const h = root.querySelector(".dilly-overlay-headline");
      if (h) {
        h.innerHTML = formatPauseHeadline(n);
      }
    });
  }

  const closeX = root.querySelector("[data-dismiss-x]");

  dismissButton.addEventListener("click", async () => {
    stopTimer();
    await onDismiss(root);
  });

  if (closeX) {
    closeX.addEventListener("click", async () => {
      stopTimer();
      await onDismiss(root);
    });
  }

  confirmButton.addEventListener("click", async () => {
    if (confirmButton.disabled) {
      return;
    }
    stopTimer();
    await onConfirm();
  });

  void refreshPauseHeadlineFromStorage();
  window.setTimeout(() => {
    void refreshPauseHeadlineFromStorage();
  }, 150);

  startTimer();
}

async function maybeIntercept(event) {
  if (!event.isTrusted || activeOverlay) {
    return;
  }

  const siteName = getActiveSiteName();
  if (!siteName) {
    return;
  }

  const trigger = getCandidateTriggerFromEvent(event);
  if (!trigger) {
    return;
  }

  if (bypassTargets.has(trigger)) {
    bypassTargets.delete(trigger);
    return;
  }

  stopEvent(event);

  try {
    const price = getResolvedPrice(trigger);
    console.warn("[Dilly] Final price for overlay:", price ? `${price.display} (value=${price.value})` : "NONE");

    const localPrice = extractPriceNearTrigger(trigger);
    const subscribeLabel = normalizeText(`${getShortSignature(trigger)} ${getTextSignature(trigger)}`);
    if (
      typeof globalThis.subscribeIntentBypassesPause === "function" &&
      globalThis.subscribeIntentBypassesPause(subscribeLabel, Boolean(localPrice))
    ) {
      console.warn("[Dilly] Subscribe without local price — skipping pause.");
      replayOriginalAction(trigger);
      return;
    }

    const state = await getState();
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(state?.settings || {})
    };
    const productKey = buildProductKey(siteName);

    if (settings.isPaused) {
      replayOriginalAction(trigger);
      return;
    }

    const threshold = Math.max(0, Number(settings.spendingThreshold) || 0);
    const shouldPause =
      settings.intentionalMode ||
      !price ||
      price.value > threshold;
    const pauseSeconds = Math.max(10, Number(settings.pauseDurationSeconds) || 30);

    if (!shouldPause) {
      replayOriginalAction(trigger);
      return;
    }

    const shownSnapshot = await recordEvent("shown", siteName, price?.value ?? null, productKey);

    const motivationPhotoDataUrl = await resolveMotivationPhotoDataUrl(settings);
    const resolvedUserName = await resolveUserName(settings);

    mountOverlay({
      siteName,
      price,
      stats: shownSnapshot?.stats || state?.stats,
      pauseSeconds,
      userGoal: String(settings.userGoal || "").trim() || null,
      goalProgress: state?.stats?.goalProgress || null,
      motivationPhotoDataUrl,
      userName: resolvedUserName,
      onConfirm: async () => {
        removeOverlay();
        networkInterceptActive = true;
        await recordEvent("confirmed", siteName, price?.value ?? null, productKey);
        replayOriginalAction(trigger);
        window.setTimeout(() => { networkInterceptActive = false; }, 3000);
      },
      onDismiss: async (root) => {
        const card = root.querySelector(".dilly-overlay-card");
        const snapshot = await recordEvent("dismissed", siteName, price?.value ?? null, productKey);
        const statNode = root.querySelector(".dilly-overlay-stat");

        if (card) {
          card.classList.add("is-closing");
        }

        if (statNode) {
          statNode.textContent = `${pickRandom(AFFIRMATIONS)} ${formatStatLine(snapshot?.stats)}`;
        }

        window.setTimeout(removeOverlay, 1200);
      }
    });
  } catch (error) {
    console.warn("[Dilly] maybeIntercept failed after stopEvent, replaying action:", error);
    networkInterceptActive = true;
    replayOriginalAction(trigger);
    window.setTimeout(() => { networkInterceptActive = false; }, 3000);
  }
}

document.addEventListener(
  "pointerdown",
  bumpUserActivation,
  true
);

document.addEventListener(
  "click",
  (event) => {
    bumpUserActivation(event);

    const el = event.target;
    if (el instanceof Element) {
      const text = getTextSignature(el);
      const hasCartWord = hasBuyingIntentText(text);
      if (hasCartWord) {
        console.warn("[Dilly] Cart-like click detected on:", el.tagName, el.className, "text:", text.slice(0, 80));
      }
    }

    maybeIntercept(event).catch(() => {
      console.warn("[Dilly] Intercept error on click; action not auto-replayed.");
    });
  },
  true
);

document.addEventListener(
  "keydown",
  (event) => {
    if (event.isTrusted && (event.key === "Enter" || event.key === " ")) {
      bumpUserActivation(event);
    }
  },
  true
);

document.addEventListener(
  "submit",
  (event) => {
    maybeIntercept(event).catch(() => {
      console.warn("[Dilly] Intercept error on submit; action not auto-replayed.");
    });
  },
  true
);

function injectNetworkInterceptor() {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("interceptor.js");
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  } catch (error) {
    // fail silently
  }
}

async function handleCartRequest(event) {
  const detail = event.detail;
  if (!detail?.id || activeOverlay || networkInterceptActive) {
    document.dispatchEvent(
      new CustomEvent("dilly-cart-response", {
        detail: { id: detail?.id, allow: true }
      })
    );
    return;
  }

  if (Date.now() - lastTrustedUserActivationAt > NETWORK_PAUSE_GESTURE_MS) {
    console.warn(
      "[Dilly] Cart request without a recent click/keypress — allowing (no pause). Add-to-cart uses a tap within the last few seconds."
    );
    document.dispatchEvent(
      new CustomEvent("dilly-cart-response", {
        detail: { id: detail.id, allow: true }
      })
    );
    return;
  }

  networkInterceptActive = true;

  const siteName = getActiveSiteName() || formatHostname(window.location.hostname);
  const price = maybeFixMisscaledPrice(extractPriceFromPage() || prefetchedPrice);
  console.warn("[Dilly] Network intercept — final price:", price ? `${price.display} (value=${price.value})` : "NONE");
  const productKey = buildProductKey(siteName);

  let state;
  try {
    state = await getState();
  } catch (error) {
    state = null;
  }

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(state?.settings || {})
  };

  if (settings.isPaused) {
    document.dispatchEvent(
      new CustomEvent("dilly-cart-response", {
        detail: { id: detail.id, allow: true }
      })
    );
    networkInterceptActive = false;
    return;
  }

  const threshold = Math.max(0, Number(settings.spendingThreshold) || 0);
  const shouldPause =
    settings.intentionalMode ||
    !price ||
    price.value > threshold;
  const pauseSeconds = Math.max(10, Number(settings.pauseDurationSeconds) || 30);

  if (!shouldPause) {
    document.dispatchEvent(
      new CustomEvent("dilly-cart-response", {
        detail: { id: detail.id, allow: true }
      })
    );
    networkInterceptActive = false;
    return;
  }

  const shownSnapshot = await recordEvent("shown", siteName, price?.value ?? null, productKey);

  const motivationPhotoDataUrl = await resolveMotivationPhotoDataUrl(settings);
  const resolvedUserName = await resolveUserName(settings);

  mountOverlay({
    siteName,
    price,
    stats: shownSnapshot?.stats || state?.stats,
    pauseSeconds,
    userGoal: String(settings.userGoal || "").trim() || null,
    goalProgress: state?.stats?.goalProgress || null,
    motivationPhotoDataUrl,
    userName: resolvedUserName,
    onConfirm: async () => {
      removeOverlay();
      await recordEvent("confirmed", siteName, price?.value ?? null, productKey);
      document.dispatchEvent(
        new CustomEvent("dilly-cart-response", {
          detail: { id: detail.id, allow: true }
        })
      );
      networkInterceptActive = false;
    },
    onDismiss: async (root) => {
      const card = root.querySelector(".dilly-overlay-card");
      const snapshot = await recordEvent("dismissed", siteName, price?.value ?? null, productKey);
      const statNode = root.querySelector(".dilly-overlay-stat");

      if (card) {
        card.classList.add("is-closing");
      }

      if (statNode) {
        statNode.textContent = `${pickRandom(AFFIRMATIONS)} ${formatStatLine(snapshot?.stats)}`;
      }

      document.dispatchEvent(
        new CustomEvent("dilly-cart-response", {
          detail: { id: detail.id, allow: false }
        })
      );

      window.setTimeout(() => {
        removeOverlay();
        networkInterceptActive = false;
      }, 1200);
    }
  });
}

function collectPriceCandidates(text, out) {
  const PRICE_RE = /(?:AUD|USD|CAD|GBP|EUR|NZD|HKD|SGD|A\$|US\$|NZ\$)?\s*[$£€¥]\s?\d[\d,]*(?:\.\d{1,2})?|[$£€¥]\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*\.\d{2}\s*(?:AUD|USD|CAD|GBP|EUR|NZD|HKD|SGD)/gi;

  const matches = text.match(PRICE_RE);
  if (!matches) {
    return;
  }

  for (const match of matches) {
    const numStr = match.replace(/[^0-9.]/g, "");
    const value = Number(numStr);
    if (Number.isFinite(value) && value >= 1 && value < 50000) {
      out.push({ value, display: `$${value.toFixed(2)}` });
    }
  }
}

const PRICE_NOISE_RE = /free.?delivery|free.?shipping|spend\s+over|orders?\s+(?:over|above)|minimum.?order|save\s+up\s+to|off\s+orders|get\s+\$?\d+\s+off|earn|reward|cashback|afterpay|klarna|zip\s+pay|pay\s+in\s+\d|per\s+week|per\s+month|was\s+\$/i;

function isNoisyPriceText(text) {
  return PRICE_NOISE_RE.test(text);
}

function scrapePriceFromAnywhere() {
  const candidates = [];

  collectPriceCandidates(document.title || "", candidates);
  if (candidates.length) {
    return candidates[0];
  }

  try {
    const scripts = document.querySelectorAll("script:not([src])");
    for (const script of scripts) {
      const text = script.textContent || "";
      const pricePatterns = [
        /"price"\s*:\s*"?(\d[\d,]*(?:\.\d{1,2})?)"?/i,
        /"salePrice"\s*:\s*"?(\d[\d,]*(?:\.\d{1,2})?)"?/i,
        /"currentPrice"\s*:\s*"?(\d[\d,]*(?:\.\d{1,2})?)"?/i,
        /"unitPrice"\s*:\s*"?(\d[\d,]*(?:\.\d{1,2})?)"?/i,
        /"amount"\s*:\s*"?(\d[\d,]*(?:\.\d{1,2})?)"?/i
      ];

      for (const pattern of pricePatterns) {
        const priceMatch = text.match(pattern);
        if (priceMatch) {
          const value = Number(priceMatch[1].replace(/,/g, ""));
          if (Number.isFinite(value) && value >= 1 && value < 50000) {
            candidates.push({ value, display: `$${value.toFixed(2)}` });
          }
        }
      }
    }
  } catch (error) {
    // fall through
  }

  if (candidates.length) {
    return candidates[0];
  }

  const productArea =
    document.querySelector('[class*="product-detail"]') ||
    document.querySelector('[class*="product-info"]') ||
    document.querySelector('[class*="pdp"]') ||
    document.querySelector('[data-testid*="product"]') ||
    document.querySelector('[class*="ProductDetail"]') ||
    document.querySelector('[class*="product_detail"]') ||
    document.querySelector("main") ||
    document.body;

  const walker = document.createTreeWalker(productArea, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }

      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "IFRAME") {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest(`#${DILLY_ROOT_ID}`)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let textNode;
  while ((textNode = walker.nextNode())) {
    const text = (textNode.textContent || "").trim();
    if (text && text.length < 80 && !isNoisyPriceText(text)) {
      collectPriceCandidates(text, candidates);
    }
  }

  if (candidates.length) {
    const reasonable = candidates.find((c) => c.value >= 5 && c.value < 10000);
    return reasonable || candidates[0];
  }

  const allElements = productArea.querySelectorAll("*");
  for (const el of allElements) {
    const ariaLabel = el.getAttribute("aria-label") || "";
    if (ariaLabel && !isNoisyPriceText(ariaLabel)) {
      collectPriceCandidates(ariaLabel, candidates);
    }

    const dataContent = el.getAttribute("data-content") || el.getAttribute("data-value") || "";
    if (dataContent) {
      collectPriceCandidates(dataContent, candidates);
    }
  }

  if (!candidates.length) {
    return null;
  }

  const reasonable = candidates.find((c) => c.value >= 5 && c.value < 10000);
  return reasonable || candidates[0];
}

function extractPriceFromPage() {
  const metaSelectors = [
    'meta[property="og:price:amount"]',
    'meta[property="product:price:amount"]',
    'meta[property="og:price"]',
    'meta[name="twitter:data1"]'
  ];

  for (const selector of metaSelectors) {
    try {
      const node = document.querySelector(selector);
      const raw = node?.getAttribute("content") || node?.getAttribute("value") || "";
      if (raw) {
        const numVal = Number(raw.replace(/[^0-9.]/g, ""));
        if (Number.isFinite(numVal) && numVal > 0) {
          return { value: numVal, display: `$${numVal.toFixed(2)}` };
        }
      }
    } catch (error) {
      continue;
    }
  }

  try {
    const jsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonScripts) {
      const text = script.textContent || "";
      if (!text.includes("price")) {
        continue;
      }

      const data = JSON.parse(text);
      const priceValue =
        data?.price ||
        data?.offers?.price ||
        data?.offers?.[0]?.price;

      if (priceValue) {
        const numVal = Number(String(priceValue).replace(/[^0-9.]/g, ""));
        if (Number.isFinite(numVal) && numVal > 0) {
          return { value: numVal, display: `$${numVal.toFixed(2)}` };
        }
      }
    }
  } catch (error) {
    // fall through
  }

  try {
    const allScripts = document.querySelectorAll("script:not([src])");
    for (const script of allScripts) {
      const text = script.textContent || "";
      if (text.length < 20 || text.length > 500000) {
        continue;
      }

      const variantMatch = text.match(/"variants"\s*:\s*\[.*?"price"\s*:\s*"?(\d[\d,]*(?:\.\d{1,2})?)"?/s);
      if (variantMatch) {
        let value = Number(variantMatch[1].replace(/,/g, ""));
        if (Number.isFinite(value) && value > 0) {
          if (value > 10000 && !variantMatch[1].includes(".")) {
            value = value / 100;
          }
          if (value >= 1 && value < 50000) {
            return { value, display: `$${value.toFixed(2)}` };
          }
        }
      }

      const productPriceMatch = text.match(/"(?:price|current_price|sale_price)"\s*:\s*"?(\d[\d,]*(?:\.\d{1,2})?)"?/);
      if (productPriceMatch) {
        let value = Number(productPriceMatch[1].replace(/,/g, ""));
        if (Number.isFinite(value) && value > 0) {
          if (value > 10000 && !productPriceMatch[1].includes(".")) {
            value = value / 100;
          }
          if (value >= 1 && value < 50000) {
            return { value, display: `$${value.toFixed(2)}` };
          }
        }
      }
    }
  } catch (error) {
    // fall through
  }

  const dataPriceNodes = document.querySelectorAll("[data-price], [data-product-price]");
  for (const node of dataPriceNodes) {
    const raw = node.getAttribute("data-price") || node.getAttribute("data-product-price") || "";
    if (raw) {
      const numVal = Number(raw.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(numVal) && numVal > 0) {
        const displayVal = numVal > 1000 && !raw.includes(".") ? numVal / 100 : numVal;
        return { value: displayVal, display: `$${displayVal.toFixed(2)}` };
      }
    }
  }

  const siteConfig = getSiteConfig();
  const selectors = [...(siteConfig?.priceSelectors || []), ...GENERIC_PRICE_SELECTORS];

  for (const selector of selectors) {
    try {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        const nodeText = (node.textContent || "").trim();
        if (!nodeText || nodeText.length > 60 || isNoisyPriceText(nodeText)) {
          continue;
        }

        const parsed = parsePriceFromText(nodeText);
        if (parsed && parsed.value > 0) {
          return parsed;
        }
      }
    } catch (error) {
      continue;
    }
  }

  return scrapePriceFromAnywhere();
}

let prefetchedPrice = null;

async function prefetchPrice() {
  try {
    const pathname = window.location.pathname;
    const shopifyMatch = pathname.match(/\/products\/([^/?#]+)/);

    if (shopifyMatch) {
      const handle = shopifyMatch[1];
      const url = `${window.location.origin}/products/${handle}.json`;
      console.warn("[Dilly] Fetching Shopify API:", url);

      const response = await fetch(url);
      console.warn("[Dilly] Shopify API status:", response.status);

      if (response.ok) {
        const data = await response.json();
        const raw = data?.product?.variants?.[0]?.price;
        console.warn("[Dilly] Shopify API raw price:", raw);

        if (raw) {
          const numVal = Number(String(raw).replace(/[^0-9.]/g, ""));
          if (Number.isFinite(numVal) && numVal >= 1 && numVal < 50000) {
            prefetchedPrice = { value: numVal, display: `$${numVal.toFixed(2)}` };
            console.warn("[Dilly] Shopify price cached:", prefetchedPrice.display);
            return;
          }
        }
      }
    }
  } catch (error) {
    console.warn("[Dilly] Shopify API failed:", error.message);
  }

  try {
    const url = window.location.href.split("?")[0].split("#")[0];
    console.warn("[Dilly] Fetching page HTML for meta price:", url);
    const response = await fetch(url);

    if (response.ok) {
      const html = await response.text();

      const ogMatch = html.match(/<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:price:amount["']/i);

      if (ogMatch) {
        const numVal = Number(ogMatch[1].replace(/[^0-9.]/g, ""));
        if (Number.isFinite(numVal) && numVal >= 1 && numVal < 50000) {
          prefetchedPrice = { value: numVal, display: `$${numVal.toFixed(2)}` };
          console.warn("[Dilly] Meta price cached:", prefetchedPrice.display);
          return;
        }
      }

      const priceMatch = html.match(/"price"\s*:\s*"?(\d[\d,]*(?:\.\d{1,2})?)"?/);
      if (priceMatch) {
        const numVal = Number(priceMatch[1].replace(/,/g, ""));
        if (Number.isFinite(numVal) && numVal >= 1 && numVal < 50000) {
          prefetchedPrice = { value: numVal, display: `$${numVal.toFixed(2)}` };
          console.warn("[Dilly] Inline price cached:", prefetchedPrice.display);
          return;
        }
      }
    }
  } catch (error) {
    console.warn("[Dilly] HTML fetch failed:", error.message);
  }

  console.warn("[Dilly] Prefetch found no price");
}

prefetchPrice();

function getResolvedPrice(trigger) {
  if (isCheckoutTrigger(trigger)) {
    const cartTotal = extractCartTotal();
    if (cartTotal) {
      console.warn("[Dilly] Using cart total:", cartTotal.display);
      return cartTotal;
    }
    console.warn("[Dilly] Checkout trigger detected but no cart total found, falling back to item price");
  }

  const domPrice = maybeFixMisscaledPrice(extractPrice(trigger));
  console.warn("[Dilly] DOM price:", domPrice ? domPrice.display : "null");

  if (domPrice) {
    return domPrice;
  }

  const pagePrice = maybeFixMisscaledPrice(extractPriceFromPage());
  console.warn("[Dilly] Page price:", pagePrice ? pagePrice.display : "null");

  if (pagePrice) {
    return pagePrice;
  }

  console.warn("[Dilly] Prefetched price:", prefetchedPrice ? prefetchedPrice.display : "null");
  return maybeFixMisscaledPrice(prefetchedPrice);
}

document.addEventListener("dilly-cart-request", (event) => {
  handleCartRequest(event).catch(() => {
    document.dispatchEvent(
      new CustomEvent("dilly-cart-response", {
        detail: { id: event.detail?.id, allow: true }
      })
    );
    networkInterceptActive = false;
  });
});

injectNetworkInterceptor();

function attachDirectListeners() {
  const allClickable = document.querySelectorAll(
    '[class*="add-to-bag"], [class*="add-to-cart"], [class*="addToBag"], [class*="addToCart"], [class*="add-to-basket"], [class*="btn-cart"], [class*="btn-bag"], [id*="addToCart"], [id*="addToBag"], [id*="add-to-cart"], [id*="buy-now"], [id*="buyNow"], [aria-label*="add to cart" i], [aria-label*="add to bag" i], [aria-label*="buy now" i], form[action*="/cart/add"] button[type="submit"], form[action*="/cart/add"] [type="submit"], .shopify-payment-button__button, #add-to-cart-button, #buy-now-button'
  );

  allClickable.forEach((element) => {
    if (element.dataset.dillyBound) {
      return;
    }

    element.dataset.dillyBound = "1";

    element.addEventListener(
      "click",
      (event) => {
        if (activeOverlay || bypassTargets.has(element)) {
          return;
        }

        maybeIntercept(event).catch((error) => {
          console.warn("[Dilly] Direct listener error:", error);
        });
      },
      true
    );
  });
}

function observeForCartButtons() {
  attachDirectListeners();

  const observer = new MutationObserver(() => {
    attachDirectListeners();
  });

  const target = document.body || document.documentElement;
  observer.observe(target, { childList: true, subtree: true });
}

let lastKnownUrl = window.location.href;

function resetPriceCacheIfUrlChanged() {
  const current = window.location.href;
  if (current !== lastKnownUrl) {
    lastKnownUrl = current;
    prefetchedPrice = null;
    prefetchPrice();
  }
}

const DILLY_SIDE_TAB_ID = "dilly-side-tab";

const DILLY_SETTINGS_ID = "dilly-settings-root";

function settingsFormatDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function settingsComputeStats(events) {
  const now = new Date();
  const weekDate = new Date(now); weekDate.setHours(0,0,0,0); weekDate.setDate(weekDate.getDate() - ((weekDate.getDay() + 6) % 7));
  const weekStart = weekDate.getTime();
  const monthDate = new Date(now); monthDate.setDate(1); monthDate.setHours(0,0,0,0);
  const monthStart = monthDate.getTime();
  const weekMap = new Map(), monthMap = new Map();
  for (const ev of events) {
    if (ev.type !== "dismissed" && ev.type !== "confirmed") continue;
    const k = ev.productKey || `${ev.site||"x"}::${ev.timestamp}`;
    if (ev.timestamp >= weekStart) weekMap.set(k, ev);
    if (ev.timestamp >= monthStart) monthMap.set(k, ev);
  }
  let pausedThisWeek = 0; for (const ev of weekMap.values()) if (ev.type === "dismissed") pausedThisWeek++;
  let notToday = 0, yesAdd = 0;
  for (const ev of monthMap.values()) { if (ev.type === "dismissed") notToday++; if (ev.type === "confirmed") yesAdd++; }
  const days = new Set(); for (const ev of events) if (ev.type === "dismissed") days.add(settingsFormatDayKey(ev.timestamp));
  const sorted = Array.from(days).sort();
  let cur = sorted.length ? 1 : 0;
  for (let i = sorted.length - 1; i > 0; i--) { const p = new Date(`${sorted[i-1]}T00:00:00`); p.setDate(p.getDate()+1); if (settingsFormatDayKey(p.getTime()) === sorted[i]) cur++; else break; }
  let best = sorted.length ? 1 : 0, run = 1;
  for (let i = 1; i < sorted.length; i++) { const p = new Date(`${sorted[i-1]}T00:00:00`); p.setDate(p.getDate()+1); if (settingsFormatDayKey(p.getTime()) === sorted[i]) { run++; if (run > best) best = run; } else run = 1; }
  return { pausedThisWeek, notToday, yesAdd, currentStreak: cur, bestStreak: best,
    summary: pausedThisWeek > 0 ? `You've paused ${pausedThisWeek} purchase${pausedThisWeek === 1 ? "" : "s"} this week.` : "Every small pause counts."
  };
}

async function openSettingsOverlay() {
  try {
    const existing = document.getElementById(DILLY_SETTINGS_ID);
    if (existing) { existing.remove(); return; }

    let state = null;
    try { state = await getState(); } catch (_) {}
    const s = state?.settings || { ...DEFAULT_SETTINGS };
    const st = state?.stats || {};
    const pausedWeek = st.pausedThisWeek || 0;
    const notToday = st.notTodayThisMonth || st.notTodayCount || 0;
    const yesAdd = st.yesThisMonth || st.yesAddCount || 0;
    const summary = st.summaryLine || (pausedWeek > 0 ? `You've paused ${pausedWeek} purchase${pausedWeek === 1 ? "" : "s"} this week.` : "Every small pause counts.");

    const root = document.createElement("div");
    root.id = DILLY_SETTINGS_ID;
    root.style.cssText = "position:fixed;inset:0;z-index:2147483647;font-family:var(--dilly-sans);-webkit-font-smoothing:antialiased;";
    const pauseDur = s.pauseDurationSeconds || 30;
    root.innerHTML = `
      <div class="dilly-overlay-backdrop"></div>
      <div class="dilly-overlay-dialog" role="dialog" aria-modal="true">
        <div class="dilly-overlay-card dilly-popup-sheet">
          <button type="button" class="dilly-overlay-close" data-stx aria-label="Close">\u00d7</button>

          <header style="text-align:center;">
            <p class="dilly-popup-brand">Dilly</p>
            <h2 class="dilly-popup-title dilly-popup-title--hero"><span class="dilly-popup-title-line">Be more intentional</span><span class="dilly-popup-title-line">with what you spend on.</span></h2>
          </header>

          <div id="ds-motivation-slot"></div>

          <section class="dilly-settings-group">
            <div class="dilly-setting-stack">
              <div class="dilly-pause-header">
                <p class="dilly-setting-label">Show Dilly</p>
                <label class="dilly-threshold-input-wrap dilly-threshold-inline" id="ds-threshold-wrap" ${s.intentionalMode ? "hidden" : ""}>
                  <span class="dilly-threshold-prefix">$</span>
                  <input id="ds-threshold" class="dilly-threshold-input" type="number" min="0" step="1" value="${s.spendingThreshold || 30}" ${s.intentionalMode ? "disabled" : ""} />
                </label>
              </div>
              <input id="ds-intentional" type="checkbox" style="display:none" ${s.intentionalMode ? "checked" : ""} />
              <div class="dilly-seg-control">
                <button type="button" class="dilly-seg-btn ${s.intentionalMode ? "is-active" : ""}" data-mode="every">Every cart</button>
                <button type="button" class="dilly-seg-btn ${!s.intentionalMode ? "is-active" : ""}" data-mode="above">Only above</button>
              </div>
            </div>
            <div class="dilly-setting-stack">
              <p class="dilly-setting-label">Pause length</p>
              <div id="ds-pause-opts" class="dilly-timer-options">
                <button type="button" class="dilly-timer-chip ${pauseDur === 10 ? "is-active" : ""}" data-sec="10">10s</button>
                <button type="button" class="dilly-timer-chip ${pauseDur === 30 ? "is-active" : ""}" data-sec="30">30s</button>
                <button type="button" class="dilly-timer-chip ${pauseDur === 60 ? "is-active" : ""}" data-sec="60">1m</button>
              </div>
            </div>
          </section>

          <section class="dilly-stats-panel">
            <div class="dilly-stats-header">
              <p class="dilly-setting-label">Wins</p>
              <p class="dilly-inline-note">${summary}</p>
            </div>
            <div class="dilly-stats-grid">
              <article class="dilly-stat-card"><p class="dilly-stat-value">${pausedWeek}</p><p class="dilly-stat-label">This week</p></article>
              <article class="dilly-stat-card"><p class="dilly-stat-value">${notToday}</p><p class="dilly-stat-label">Not today</p></article>
              <article class="dilly-stat-card"><p class="dilly-stat-value">${yesAdd}</p><p class="dilly-stat-label">Added</p></article>
            </div>
          </section>

          <p class="dilly-popup-footer-note">On this device only.</p>
        </div>
      </div>
    `;

    root.addEventListener("click", (ev) => ev.stopPropagation());

    const motivationSlot = root.querySelector("#ds-motivation-slot");
    if (motivationSlot && s.motivationPhotoDataUrl) {
      motivationSlot.innerHTML =
        '<div class="dilly-overlay-motivation-wrap" style="box-sizing:border-box;margin:12px auto 14px;width:72px;height:72px;max-width:72px;max-height:72px;min-width:72px;min-height:72px;aspect-ratio:1;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid rgba(92,61,46,0.14);box-shadow:0 4px 16px rgba(44,24,16,0.12);"><img class="dilly-overlay-motivation-img" alt="" style="box-sizing:border-box;display:block;width:100%;height:100%;object-fit:cover;object-position:center;" /></div><p class="dilly-inline-note" style="text-align:center;margin:0 0 12px;">Change in the Dilly popup.</p>';
      const motivationImg = motivationSlot.querySelector("img");
      if (motivationImg) {
        motivationImg.src = s.motivationPhotoDataUrl;
      }
    }

    const dismiss = () => {
      const card = root.querySelector(".dilly-overlay-card");
      if (card) { card.classList.add("is-closing"); setTimeout(() => root.remove(), 250); }
      else root.remove();
    };

    root.querySelector("[data-stx]").addEventListener("click", dismiss);
    root.querySelector(".dilly-overlay-backdrop").addEventListener("click", dismiss);

    function savePatch(patch) {
      sendRuntimeMessage({ action: "update-settings", patch });
    }

    root.querySelectorAll(".dilly-seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const isEvery = btn.dataset.mode === "every";
        savePatch({ intentionalMode: isEvery });
        root.querySelectorAll(".dilly-seg-btn").forEach(b => b.classList.toggle("is-active", b === btn));
        const thresholdWrap = root.querySelector("#ds-threshold-wrap");
        const thresholdInput = root.querySelector("#ds-threshold");
        if (thresholdWrap) thresholdWrap.hidden = isEvery;
        if (thresholdInput) thresholdInput.disabled = isEvery;
      });
    });
    const dsThreshold = root.querySelector("#ds-threshold");
    if (dsThreshold) {
      dsThreshold.addEventListener("change", (ev) => {
        savePatch({ spendingThreshold: Math.max(0, Number(ev.target.value) || 0) });
      });
    }
    root.querySelector("#ds-pause-opts").addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-sec]");
      if (!btn) return;
      const val = Number(btn.dataset.sec);
      savePatch({ pauseDurationSeconds: val });
      root.querySelectorAll("[data-sec]").forEach(b => b.classList.toggle("is-active", Number(b.dataset.sec) === val));
    });

    document.documentElement.appendChild(root);
  } catch (err) {
    console.error("[Dilly] Settings overlay error:", err);
  }
}

function isShoppingSite() {
  if (getSiteConfig()) return true;
  if (document.querySelector('link[href*="cdn.shopify"]') ||
      document.querySelector('meta[name="shopify-checkout-api-token"]') ||
      window.Shopify) return true;
  const host = window.location.hostname.toLowerCase();
  if (/checkout|cart|bag|basket|payment/i.test(window.location.pathname)) return true;
  if (document.querySelector('meta[property="og:type"][content="product"]') ||
      document.querySelector('script[type="application/ld+json"]')?.textContent?.includes('"@type":"Product"')) return true;
  return false;
}

function mountSideTab() {
  if (document.getElementById(DILLY_SIDE_TAB_ID)) return;
  if (!isShoppingSite()) return;

  const tab = document.createElement("button");
  tab.id = DILLY_SIDE_TAB_ID;
  tab.setAttribute("aria-label", "Dilly — intentional spending");
  tab.innerHTML = `<span>Dilly</span>`;

  tab.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    openSettingsOverlay();
  });

  (document.body || document.documentElement).appendChild(tab);
}

document.addEventListener("click", resetPriceCacheIfUrlChanged, true);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    observeForCartButtons();
    mountSideTab();
  });
} else {
  observeForCartButtons();
  mountSideTab();
}
