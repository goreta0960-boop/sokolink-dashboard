"use client";
import { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   CONFIG — Supabase + Claude API
   ═══════════════════════════════════════════════════════════════ */
const SUPABASE_URL = "https://fcbtuovrjsakaenkeukh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjYnR1b3ZyanNha2FlbmtldWtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMTExNDksImV4cCI6MjA4ODU4NzE0OX0.1Bg7rjzId4hl1E60y7WtZ4jh52e9JtDUF_NHjCXGzn0";

const sb = (endpoint: string, opts: Record<string, unknown> = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: (opts.prefer as string) || "return=representation",
      ...(opts.headers as Record<string, string> || {}),
    },
    method: (opts.method as string) || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(r => r.json()).catch(e => { console.error("Supabase error:", e); return null; });

const rpc = (fn: string, params: Record<string, unknown> = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  }).then(r => r.json()).catch(e => { console.error("RPC error:", e); return null; });

/* ═══════════════════════════════════════════════════════════════
   AI NLP — Uses Claude API for entity extraction
   ═══════════════════════════════════════════════════════════════ */
const extractEntitiesAI = async (text: string, _lang: string) => {
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: `You are an NLP entity extractor for a Tanzanian agricultural marketplace called SokoLink.
Extract structured data from user messages in Swahili, English, or Arabic.
ALWAYS respond with ONLY valid JSON, no markdown, no explanation.
Response format: {"intent":"sell|buy|search|greet|help|unknown","product":null|"string","price":null|number,"qty":null|number,"unit":"kg|bag|debe","location":null|"string"}
Product names should be in Swahili (lowercase). Map: corn/maize→mahindi, rice→mchele, tomato→nyanya, beans→maharage, onion→vitunguu, potato→viazi, wheat→ngano, banana→ndizi, avocado→parachichi, cabbage→kabeji, kale/collard→sukuma, garlic→tungule, ginger→tangawizi, cashew→korosho, coffee→kahawa, peas→njegere, pepper→pilipili, mango→embe, pineapple→nanasi, okra→bamia, watermelon→tikiti, sunflower→alizeti, sorghum→mtama, groundnut/peanut→karanga
"tani"/"tonne" = 1000 kg. "debe" = ~20kg tin. "gunia"/"bag" = ~100kg.
Extract numbers even from messy input like "1500 tz kama kg" → price:1500`,
        messages: [{ role: "user", content: text }],
      }),
    });
    const data = await resp.json();
    const raw = data.content?.[0]?.text || "{}";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.log("AI extraction fallback:", e);
    return localExtract(text);
  }
};

/* ── Local fallback extractor (no API needed) ── */
const localExtract = (text: string) => {
  const tl = text.toLowerCase().trim();
  const result: Record<string, unknown> = { intent: "unknown", product: null, price: null, qty: null, unit: "kg", location: null };

  if (/^(ninauza|nauza|i('m)?\s*sell|kuuza|sell|بيع)/i.test(tl)) result.intent = "sell";
  else if (/^(nataka|ninataka|kununua|buy|شراء|i\s*(want|need))/i.test(tl)) result.intent = "buy";
  else if (/^(tafuta|search|بحث)/i.test(tl)) result.intent = "search";
  else if (/^(menu|help|msaada)/i.test(tl)) result.intent = "help";
  else if (/^(habari|hi|hello|hey|jambo|salama|مرحب)/i.test(tl)) result.intent = "greet";

  const PRODUCTS = ["mahindi", "nyanya", "mchele", "maharage", "vitunguu", "viazi", "ngano", "mtama",
    "alizeti", "karanga", "korosho", "kahawa", "pilipili", "bamia", "njegere", "tikiti",
    "embe", "ndizi", "nanasi", "parachichi", "kabeji", "sukuma", "spinachi", "tungule", "tangawizi",
    "corn", "maize", "rice", "tomato", "beans", "onion", "potato", "wheat", "banana", "avocado"];
  const ALIAS: Record<string, string> = { corn: "mahindi", maize: "mahindi", rice: "mchele", tomato: "nyanya", tomatoes: "nyanya",
    beans: "maharage", onion: "vitunguu", onions: "vitunguu", potato: "viazi", wheat: "ngano",
    banana: "ndizi", avocado: "parachichi" };
  for (const p of PRODUCTS) {
    if (tl.includes(p)) { result.product = ALIAS[p] || p; break; }
  }

  const nums = tl.replace(/,/g, "").match(/\d+/g)?.map(Number) || [];
  if (nums.length >= 2) { result.price = nums[0]; result.qty = nums[1]; }
  else if (nums.length === 1) {
    if (/bei|price|سعر/i.test(tl)) result.price = nums[0];
    else if (/kg|kilo|kiasi|quantity|كمية/i.test(tl)) result.qty = nums[0];
    else result.price = nums[0];
  }

  if (/tani|tonne|ton/i.test(tl)) { result.unit = "kg"; if (result.qty) result.qty = (result.qty as number) * 1000; }
  if (/debe/i.test(tl)) result.unit = "debe";
  if (/gunia|bag/i.test(tl)) result.unit = "bag";

  return result;
};

/* ═══════════════════════════════════════════════════════════════
   LANGUAGE PACK — Trilingual (SW / EN / AR)
   ═══════════════════════════════════════════════════════════════ */
const LANG = {
  sw: {
    welcome: "Karibu *SokoLink* 🌾\nSoko lako la kilimo — rahisi, haraka, salama.",
    menuLabel: "Chagua huduma:",
    menu: [
      { icon: "🛒", label: "Kununua", cmd: "kununua" },
      { icon: "💰", label: "Kuuza", cmd: "kuuza" },
      { icon: "🔍", label: "Tafuta", cmd: "tafuta" },
      { icon: "📦", label: "Bidhaa Zangu", cmd: "bidhaa zangu" },
      { icon: "📜", label: "Historia", cmd: "historia" },
    ],
    sellSteps: ["Bidhaa", "Bei", "Kiasi", "Eneo", "Thibitisha"],
    askProduct: "Bidhaa gani unataka kuuza?",
    askPrice: "Bei ngapi kwa KG? (namba tu)",
    askQty: "Kiasi ni KG ngapi?",
    askLocation: "Bidhaa iko wapi? (mji/mkoa)",
    confirmSell: (p: string, pr: number, q: number, loc: string) =>
      `📋 *Muhtasari wa Bidhaa*\n\n🌱 Bidhaa: ${p}\n💵 Bei: ${pr.toLocaleString()} TZS/kg\n📦 Kiasi: ${q.toLocaleString()} kg\n📍 Eneo: ${loc}\n\nThibitisha?`,
    sellDone: (id: string | null) => `✅ Bidhaa imesajiliwa!\n🆔 ${id ? id.slice(0, 8) : "—"}\nWanunuzi wataiona hivi karibuni.`,
    sellCancel: "❌ Umefuta orodha hii.",
    askBuyProduct: "Unataka kununua bidhaa gani?",
    askBuyQty: "Unataka KG ngapi?",
    noResults: "😕 Hakuna matokeo.\nJaribu jina lingine au andika 'menu'.",
    priceErr: "⚠️ Weka bei kwa namba tu. Mfano: 1500",
    qtyErr: "⚠️ Weka kiasi kwa namba tu. Mfano: 500",
    cancelled: "Umefuta. Andika 'menu' kuanza upya.",
    noListings: "📦 Huna bidhaa bado.\nAndika 'kuuza' kuanza!",
    noHistory: "📜 Hakuna historia bado.",
    help: "ℹ️ *Msaada wa SokoLink*\n\n💰 'kuuza' — orodhesha bidhaa\n🛒 'kununua' — nunua bidhaa\n🔍 'tafuta' — tafuta sokoni\n📦 'bidhaa zangu' — orodha yako\n📜 'historia' — shughuli zako\n❌ 'cancel' — futa hatua",
    results: "🔍 *Matokeo*",
    selectItem: "Chagua namba:",
    buyConfirm: (p: string, s: string, pr: number, q: number, loc: string, trust: number) =>
      `🛒 *Muhtasari wa Ununuzi*\n\n🌱 Bidhaa: ${p}\n👤 Muuzaji: ${s}${trust ? ` ⭐${trust}` : ""}\n📍 Eneo: ${loc || "—"}\n💵 Bei: ${pr.toLocaleString()} TZS/kg\n📦 Kiasi: ${q.toLocaleString()} kg\n💰 Jumla: ${(pr * q).toLocaleString()} TZS\n\nEndelea?`,
    buyDone: (id: string | null) => `✅ Oda imetumwa!\n🆔 ${id ? id.slice(0, 8) : "—"}\nMuuzaji atawasiliana nawe.`,
    myProducts: "📦 *Bidhaa Zako*",
    history: "📜 *Historia Yako*",
    edited: "✅ Bidhaa imebadilishwa!",
    deleted: "🗑️ Bidhaa imefutwa.",
    editPrompt: "Chagua namba kubadilisha:",
    editAction: "Chagua:\n1️⃣ Badilisha bei\n2️⃣ Futa bidhaa",
    newPrice: "Weka bei mpya kwa KG:",
    yes: "Ndiyo", no: "Hapana",
    popular: "Maarufu:", popularItems: ["Mahindi", "Mchele", "Nyanya", "Maharage", "Vitunguu"],
    typing: "inaandika...", onlineStatus: "Mtandaoni",
    stepOf: (c: number, t: number) => `Hatua ${c}/${t}`,
    greet: "Habari! 👋 Karibu SokoLink.\nAndika 'menu' kuona huduma.",
    dbError: "⚠️ Tatizo la mfumo. Jaribu tena.",
    smartConfirm: (e: Record<string, unknown>) => `Nimeelewa:\n🌱 ${e.product || "?"}\n💵 ${e.price ? (e.price as number).toLocaleString() + " TZS/kg" : "?"}\n📦 ${e.qty ? (e.qty as number).toLocaleString() + " kg" : "?"}\n\nSahihi?`,
    registering: "Karibu! Tunakusajili...",
    registered: (name: string) => `✅ Umesajiliwa kama ${name}.\nSasa unaweza kuuza na kununua!`,
    askName: "Jina lako ni nani?",
    askPhone: "Namba yako ya simu?",
    loadingDb: "⏳ Inapakia...",
  },
  en: {
    welcome: "Welcome to *SokoLink* 🌾\nYour agricultural market — simple, fast, secure.",
    menuLabel: "Choose a service:",
    menu: [
      { icon: "🛒", label: "Buy", cmd: "buy" },
      { icon: "💰", label: "Sell", cmd: "sell" },
      { icon: "🔍", label: "Search", cmd: "search" },
      { icon: "📦", label: "My Products", cmd: "my products" },
      { icon: "📜", label: "History", cmd: "history" },
    ],
    sellSteps: ["Product", "Price", "Quantity", "Location", "Confirm"],
    askProduct: "What product do you want to sell?",
    askPrice: "Price per KG? (number only)",
    askQty: "How many KGs?",
    askLocation: "Where is the product located? (city/region)",
    confirmSell: (p: string, pr: number, q: number, loc: string) =>
      `📋 *Listing Summary*\n\n🌱 Product: ${p}\n💵 Price: ${pr.toLocaleString()} TZS/kg\n📦 Quantity: ${q.toLocaleString()} kg\n📍 Location: ${loc}\n\nConfirm?`,
    sellDone: (id: string | null) => `✅ Product listed!\n🆔 ${id ? id.slice(0, 8) : "—"}\nBuyers will see it shortly.`,
    sellCancel: "❌ Listing cancelled.",
    askBuyProduct: "What product are you looking for?",
    askBuyQty: "How many KGs do you need?",
    noResults: "😕 No results found.\nTry a different name or type 'menu'.",
    priceErr: "⚠️ Enter price as a number only. Example: 1500",
    qtyErr: "⚠️ Enter quantity as a number only. Example: 500",
    cancelled: "Cancelled. Type 'menu' to start over.",
    noListings: "📦 No listings yet.\nType 'sell' to get started!",
    noHistory: "📜 No history yet.",
    help: "ℹ️ *SokoLink Help*\n\n💰 'sell' — list a product\n🛒 'buy' — purchase products\n🔍 'search' — search the market\n📦 'my products' — your listings\n📜 'history' — your activity\n❌ 'cancel' — cancel current step",
    results: "🔍 *Results*",
    selectItem: "Select a number:",
    buyConfirm: (p: string, s: string, pr: number, q: number, loc: string, trust: number) =>
      `🛒 *Purchase Summary*\n\n🌱 Product: ${p}\n👤 Seller: ${s}${trust ? ` ⭐${trust}` : ""}\n📍 Location: ${loc || "—"}\n💵 Price: ${pr.toLocaleString()} TZS/kg\n📦 Quantity: ${q.toLocaleString()} kg\n💰 Total: ${(pr * q).toLocaleString()} TZS\n\nProceed?`,
    buyDone: (id: string | null) => `✅ Order sent!\n🆔 ${id ? id.slice(0, 8) : "—"}\nThe seller will contact you.`,
    myProducts: "📦 *Your Products*",
    history: "📜 *Your History*",
    edited: "✅ Product updated!",
    deleted: "🗑️ Product deleted.",
    editPrompt: "Select number to edit:",
    editAction: "Choose:\n1️⃣ Change price\n2️⃣ Delete product",
    newPrice: "Enter new price per KG:",
    yes: "Yes", no: "No",
    popular: "Popular:", popularItems: ["Corn", "Rice", "Tomatoes", "Beans", "Onions"],
    typing: "typing...", onlineStatus: "Online",
    stepOf: (c: number, t: number) => `Step ${c}/${t}`,
    greet: "Hi! 👋 Welcome to SokoLink.\nType 'menu' to see services.",
    dbError: "⚠️ System error. Please try again.",
    smartConfirm: (e: Record<string, unknown>) => `I understood:\n🌱 ${e.product || "?"}\n💵 ${e.price ? (e.price as number).toLocaleString() + " TZS/kg" : "?"}\n📦 ${e.qty ? (e.qty as number).toLocaleString() + " kg" : "?"}\n\nCorrect?`,
    registering: "Welcome! Registering you...",
    registered: (name: string) => `✅ Registered as ${name}.\nYou can now buy and sell!`,
    askName: "What is your name?",
    askPhone: "What is your phone number?",
    loadingDb: "⏳ Loading...",
  },
  ar: {
    welcome: "مرحبًا بك في *SokoLink* 🌾\nسوقك الزراعي — بسيط، سريع، آمن.",
    menuLabel: "اختر خدمة:",
    menu: [
      { icon: "🛒", label: "شراء", cmd: "شراء" },
      { icon: "💰", label: "بيع", cmd: "بيع" },
      { icon: "🔍", label: "بحث", cmd: "بحث" },
      { icon: "📦", label: "منتجاتي", cmd: "منتجاتي" },
      { icon: "📜", label: "السجل", cmd: "السجل" },
    ],
    sellSteps: ["المنتج", "السعر", "الكمية", "الموقع", "تأكيد"],
    askProduct: "ما المنتج الذي تريد بيعه؟",
    askPrice: "كم السعر لكل كيلوغرام؟ (أرقام فقط)",
    askQty: "كم كيلوغرام؟",
    askLocation: "أين يقع المنتج؟ (مدينة/منطقة)",
    confirmSell: (p: string, pr: number, q: number, loc: string) =>
      `📋 *ملخص المنتج*\n\n🌱 المنتج: ${p}\n💵 السعر: ${pr.toLocaleString()} TZS/كغ\n📦 الكمية: ${q.toLocaleString()} كغ\n📍 الموقع: ${loc}\n\nتأكيد؟`,
    sellDone: (id: string | null) => `✅ تم تسجيل المنتج!\n🆔 ${id ? id.slice(0, 8) : "—"}\nالمشترون سيشاهدونه قريبًا.`,
    sellCancel: "❌ تم إلغاء القائمة.",
    askBuyProduct: "ما المنتج الذي تبحث عنه؟",
    askBuyQty: "كم كيلوغرام تحتاج؟",
    noResults: "😕 لا توجد نتائج.\nجرب اسمًا آخر أو اكتب 'menu'.",
    priceErr: "⚠️ أدخل السعر كرقم فقط. مثال: 1500",
    qtyErr: "⚠️ أدخل الكمية كرقم فقط. مثال: 500",
    cancelled: "تم الإلغاء. اكتب 'menu' للبدء.",
    noListings: "📦 لا توجد منتجات بعد.\nاكتب 'بيع' للبدء!",
    noHistory: "📜 لا يوجد سجل بعد.",
    help: "ℹ️ *مساعدة SokoLink*\n\n💰 'بيع' — عرض منتج\n🛒 'شراء' — شراء منتج\n🔍 'بحث' — البحث في السوق\n📦 'منتجاتي' — قائمتك\n📜 'السجل' — نشاطك\n❌ 'cancel' — إلغاء",
    results: "🔍 *النتائج*",
    selectItem: "اختر رقمًا:",
    buyConfirm: (p: string, s: string, pr: number, q: number, loc: string, trust: number) =>
      `🛒 *ملخص الشراء*\n\n🌱 المنتج: ${p}\n👤 البائع: ${s}${trust ? ` ⭐${trust}` : ""}\n📍 الموقع: ${loc || "—"}\n💵 السعر: ${pr.toLocaleString()} TZS/كغ\n📦 الكمية: ${q.toLocaleString()} كغ\n💰 الإجمالي: ${(pr * q).toLocaleString()} TZS\n\nمتابعة؟`,
    buyDone: (id: string | null) => `✅ تم إرسال الطلب!\n🆔 ${id ? id.slice(0, 8) : "—"}\nالبائع سيتواصل معك.`,
    myProducts: "📦 *منتجاتك*",
    history: "📜 *سجلك*",
    edited: "✅ تم تحديث المنتج!",
    deleted: "🗑️ تم حذف المنتج.",
    editPrompt: "اختر رقم المنتج:",
    editAction: "اختر:\n1️⃣ تغيير السعر\n2️⃣ حذف المنتج",
    newPrice: "أدخل السعر الجديد:",
    yes: "نعم", no: "لا",
    popular: "الأكثر طلبًا:", popularItems: ["ذرة", "أرز", "طماطم", "فاصوليا", "بصل"],
    typing: "يكتب...", onlineStatus: "متصل",
    stepOf: (c: number, t: number) => `خطوة ${c}/${t}`,
    greet: "أهلاً! 👋 مرحبًا في SokoLink.\nاكتب 'menu' لرؤية الخدمات.",
    dbError: "⚠️ خطأ في النظام. حاول مرة أخرى.",
    smartConfirm: (e: Record<string, unknown>) => `فهمت:\n🌱 ${e.product || "?"}\n💵 ${e.price ? (e.price as number).toLocaleString() + " TZS/كغ" : "?"}\n📦 ${e.qty ? (e.qty as number).toLocaleString() + " كغ" : "?"}\n\nصحيح؟`,
    registering: "مرحبًا! جاري التسجيل...",
    registered: (name: string) => `✅ تم التسجيل باسم ${name}.\nيمكنك الآن البيع والشراء!`,
    askName: "ما اسمك؟",
    askPhone: "ما رقم هاتفك؟",
    loadingDb: "⏳ جاري التحميل...",
  },
} as const;

type LangKey = keyof typeof LANG;

/* ═══════════════════════════════════════════════════════════════
   UTILITY HELPERS
   ═══════════════════════════════════════════════════════════════ */
const extractNumber = (text: string) => {
  const m = text.replace(/,/g, "").match(/[\d]+/);
  return m ? parseInt(m[0], 10) : null;
};
const isYes = (t: string) => /^(ndiyo|ndio|yes|yeah|yep|y|نعم|ok|sawa|naam|1)$/i.test(t.trim());
const isNo  = (t: string) => /^(hapana|no|nope|n|لا|la|acha|2)$/i.test(t.trim());
const timeNow = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const renderBold = (text: string) => {
  if (!text) return text;
  return text.split(/\*([^*]+)\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i} style={{ fontWeight: 700 }}>{part}</strong> : part
  );
};

const SELL_STEP_MAP: Record<string, number> = { product: 0, price: 1, qty: 2, location: 3, confirm: 4 };

type MarketItem = {
  id: string;
  product_name: string;
  seller_name: string;
  price_tzs: number;
  qty: number;
  seller_location: string;
  seller_trust: number;
};

type Message = {
  from: "user" | "bot";
  text: string;
  time: string;
  showMenu?: boolean;
  productCards?: MarketItem[];
  myProductCards?: (MarketItem & { location?: string })[];
  quickReplies?: string[];
  showPopular?: boolean;
};

type FlowData = Record<string, unknown>;

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function SokoLinkChat() {
  const [lang, setLang] = useState<LangKey>("sw");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [flow, setFlow] = useState<string | null>(null);
  const [flowData, setFlowData] = useState<FlowData>({});
  const [isTyping, setIsTyping] = useState(false);
  const [started, setStarted] = useState(false);
  const [userPhone, setUserPhone] = useState("");
  const [userProfile, setUserProfile] = useState<Record<string, unknown> | null>(null);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const t = LANG[lang];
  const isArabic = lang === "ar";

  const scroll = useCallback(() => {
    setTimeout(() => chatEnd.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }, []);

  const addBot = useCallback((text: string, opts?: Partial<Message>) => {
    setIsTyping(true);
    scroll();
    const delay = Math.min(250 + (text?.length || 0) * 3, 1000);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, { from: "bot", text, time: timeNow(), ...(opts || {}) }]);
      scroll();
    }, delay);
  }, [scroll]);

  const addUser = useCallback((text: string) => {
    setMessages((prev) => [...prev, { from: "user", text, time: timeNow() }]);
    scroll();
  }, [scroll]);

  useEffect(() => {
    if (!started) {
      setStarted(true);
      (async () => {
        // Read logged-in user from localStorage (set by login page)
        const stored = localStorage.getItem("sokolink_profile");
        const storedProfile = stored ? JSON.parse(stored) : null;
        const phone = storedProfile?.phone ?? "";
        if (phone) setUserPhone(phone);

        try {
          const profiles = await sb(`profiles?phone=eq.${encodeURIComponent(phone)}&limit=1`);
          if (Array.isArray(profiles)) {
            setDbConnected(true);
            if (profiles.length > 0) {
              setUserProfile(profiles[0]);
              if (profiles[0].lang) setLang(profiles[0].lang as LangKey);
            }
          } else {
            setDbConnected(false);
          }
        } catch {
          setDbConnected(false);
        }
        setTimeout(() => addBot(LANG[lang].welcome, { showMenu: true }), 500);
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logConversation = async (direction: string, text: string, intent: string | null, entities: unknown, flowName: string | null, step: unknown) => {
    if (!dbConnected) return;
    try {
      await sb("conversation_logs", {
        method: "POST",
        body: { phone: userPhone, direction, message_text: text, intent, entities: entities || {}, flow: flowName, flow_step: step },
      });
    } catch (e) { console.log("Log failed:", e); }
  };

  const searchMarket = async (query: string): Promise<MarketItem[]> => {
    if (dbConnected) {
      try {
        const q = encodeURIComponent(`%${query.toLowerCase()}%`);
        const items = await sb(`inventory?status=eq.available&product_name=ilike.${q}&select=id,product_name,price_tzs,qty,unit,supplier_id&order=is_featured.desc,price_tzs.asc&limit=5`);
        if (Array.isArray(items) && items.length > 0) {
          // Fetch supplier profiles in one call
          const ids = [...new Set(items.map((i: Record<string, unknown>) => i.supplier_id as string).filter(Boolean))];
          let suppMap: Record<string, Record<string, unknown>> = {};
          if (ids.length) {
            const supps = await sb(`profiles?id=in.(${ids.join(",")})&select=id,phone,trust_score,location_name`);
            if (Array.isArray(supps)) suppMap = Object.fromEntries(supps.map((s: Record<string, unknown>) => [s.id, s]));
          }
          return items.map((i: Record<string, unknown>) => {
            const s = suppMap[i.supplier_id as string] ?? {};
            return {
              id:              i.id as string,
              product_name:    i.product_name as string,
              seller_name:     (s.phone as string) ?? "—",
              price_tzs:       Number(i.price_tzs),
              qty:             Number(i.qty),
              seller_location: (s.location_name as string) ?? "—",
              seller_trust:    Number(s.trust_score ?? 0),
            };
          });
        }
      } catch (e) { console.log("searchMarket error:", e); }
    }
    return FALLBACK_MARKET.filter(i => i.product_name.includes(query.toLowerCase())).slice(0, 3);
  };

  const FALLBACK_MARKET: MarketItem[] = [
    { id: "m1", product_name: "mahindi", seller_name: "Juma K.",  price_tzs: 800,  qty: 5000, seller_location: "Dodoma",   seller_trust: 4.6 },
    { id: "m2", product_name: "mahindi", seller_name: "Amina B.", price_tzs: 850,  qty: 2000, seller_location: "Morogoro", seller_trust: 4.2 },
    { id: "m3", product_name: "nyanya",  seller_name: "Hassan M.",price_tzs: 1200, qty: 500,  seller_location: "Arusha",   seller_trust: 4.8 },
    { id: "m4", product_name: "nyanya",  seller_name: "Grace P.", price_tzs: 1000, qty: 800,  seller_location: "Iringa",   seller_trust: 4.4 },
    { id: "m5", product_name: "mchele",  seller_name: "Bakari S.",price_tzs: 2500, qty: 3000, seller_location: "Mbeya",    seller_trust: 4.7 },
    { id: "m6", product_name: "maharage",seller_name: "Saidi N.", price_tzs: 2000, qty: 1200, seller_location: "Kigoma",   seller_trust: 4.5 },
    { id: "m7", product_name: "vitunguu",seller_name: "Peter L.", price_tzs: 1500, qty: 700,  seller_location: "Singida",  seller_trust: 4.3 },
  ];

  const detectLang = (text: string): LangKey | null => {
    const tl = text.toLowerCase().trim();
    if (tl === "english") return "en";
    if (/[\u0600-\u06FF]/.test(text) || tl === "arabic" || tl === "عربي") return "ar";
    if (tl === "swahili" || tl === "kiswahili") return "sw";
    return null;
  };

  const detectIntent = (text: string) => {
    const tl = text.toLowerCase().trim();
    if (/^(menu|orodha|القائمة)$/i.test(tl)) return "menu";
    if (/^(help|msaada|مساعدة)$/i.test(tl)) return "help";
    if (/^(cancel|futa|sitisha|إلغاء)$/i.test(tl)) return "cancel";
    if (/^(kuuza|sell|بيع)$/i.test(tl)) return "sell";
    if (/^(kununua|buy|شراء)$/i.test(tl)) return "buy";
    if (/^(tafuta|search|بحث)$/i.test(tl)) return "search";
    if (/^(bidhaa zangu|my products|منتجاتي)$/i.test(tl)) return "myproducts";
    if (/^(historia|history|السجل)$/i.test(tl)) return "history";
    if (/^(habari|hi|hello|hey|jambo|salama|مرحب)/i.test(tl)) return "greet";
    return null;
  };

  const resetFlow = () => { setFlow(null); setFlowData({}); };

  const processMessage = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    addUser(text);
    logConversation("in", text, null, null, flow, flowData.step);

    const newLang = detectLang(text);
    if (newLang && newLang !== lang) {
      setLang(newLang); resetFlow();
      addBot(LANG[newLang].welcome, { showMenu: true });
      return;
    }

    if (flow) { await handleFlow(text); return; }

    const words = text.split(/\s+/).length;
    let entities: Record<string, unknown> | null = null;
    if (words >= 3) {
      entities = await extractEntitiesAI(text, lang);
    }

    if (entities?.intent === "sell" && entities.product) {
      const d: FlowData = { step: "product", product: entities.product };
      if (entities.price) d.price = entities.price;
      if (entities.qty) d.qty = entities.qty;
      if (d.price && d.qty) {
        d.step = "location"; setFlow("sell"); setFlowData(d); addBot(t.askLocation);
      } else if (d.price) {
        d.step = "qty"; setFlow("sell"); setFlowData(d); addBot(t.askQty);
      } else {
        d.step = "price"; setFlow("sell"); setFlowData(d); addBot(t.askPrice);
      }
      return;
    }

    if (entities?.intent === "buy" && entities.product) {
      const results = await searchMarket(entities.product as string);
      if (results.length > 0) {
        setFlow("buy"); setFlowData({ step: "select", product: entities.product, results, qty: entities.qty || null });
        addBot(t.results, { productCards: results });
      } else { addBot(t.noResults); }
      return;
    }

    const intent = detectIntent(text);
    switch (intent) {
      case "menu":       addBot(t.welcome, { showMenu: true }); break;
      case "help":       addBot(t.help); break;
      case "cancel":     resetFlow(); addBot(t.cancelled); break;
      case "greet":      addBot(t.greet); break;
      case "sell":       setFlow("sell"); setFlowData({ step: "product" }); addBot(t.askProduct, { showPopular: true }); break;
      case "buy":        setFlow("buy");  setFlowData({ step: "product" }); addBot(t.askBuyProduct, { showPopular: true }); break;
      case "search":     setFlow("search"); setFlowData({ step: "query" }); addBot(t.askBuyProduct, { showPopular: true }); break;
      case "myproducts": await showMyProducts(); break;
      case "history":    await showHistory(); break;
      default: {
        const results = await searchMarket(text);
        if (results.length > 0) {
          setFlow("buy"); setFlowData({ step: "select", product: text, results });
          addBot(t.results, { productCards: results });
        } else { addBot(t.help); }
      }
    }
  };

  const handleFlow = async (text: string) => {
    const tl = text.toLowerCase().trim();
    if (/^(cancel|futa|sitisha|إلغاء)$/i.test(tl)) { resetFlow(); addBot(t.cancelled); return; }
    if (/^(menu|orodha|القائمة)$/i.test(tl)) { resetFlow(); addBot(t.welcome, { showMenu: true }); return; }
    if (flow === "sell")            await handleSellFlow(text);
    else if (flow === "buy")        await handleBuyFlow(text);
    else if (flow === "search")     await handleSearchFlow(text);
    else if (flow === "myproducts_edit") handleEditFlow(text);
  };

  const handleSellFlow = async (text: string) => {
    const d = { ...flowData };
    switch (d.step) {
      case "product":
        d.product = text.trim().toLowerCase(); d.step = "price"; setFlowData(d); addBot(t.askPrice); break;
      case "price": {
        const n = extractNumber(text);
        if (!n || n <= 0) { addBot(t.priceErr); return; }
        d.price = n; d.step = "qty"; setFlowData(d); addBot(t.askQty); break;
      }
      case "qty": {
        const n = extractNumber(text);
        if (!n || n <= 0) { addBot(t.qtyErr); return; }
        d.qty = n; d.step = "location"; setFlowData(d); addBot(t.askLocation); break;
      }
      case "location":
        d.location = text.trim(); d.step = "confirm"; setFlowData(d);
        addBot(t.confirmSell(d.product as string, d.price as number, d.qty as number, d.location as string), { quickReplies: [t.yes, t.no] }); break;
      case "confirm":
        if (isYes(text)) {
          let listingId = null;
          if (dbConnected && userProfile) {
            try {
              const result = await sb("inventory", {
                method: "POST",
                body: {
                  supplier_id:  userProfile.id,
                  product_name: d.product,
                  category:     "crops",
                  qty:          d.qty,
                  unit:         "kg",
                  price_tzs:    d.price,
                  status:       "available",
                },
              });
              listingId = Array.isArray(result) ? (result[0]?.id ?? null) : null;
            } catch (e) { console.log("Create listing error:", e); }
          }
          resetFlow(); addBot(t.sellDone(listingId as string | null));
        } else if (isNo(text)) { resetFlow(); addBot(t.sellCancel); }
        else { addBot(t.confirmSell(d.product as string, d.price as number, d.qty as number, d.location as string), { quickReplies: [t.yes, t.no] }); }
        break;
    }
  };

  const handleBuyFlow = async (text: string) => {
    const d = { ...flowData };
    switch (d.step) {
      case "product":
        d.product = text.trim().toLowerCase(); d.step = "qty"; setFlowData(d); addBot(t.askBuyQty); break;
      case "qty": {
        const n = extractNumber(text);
        if (!n || n <= 0) { addBot(t.qtyErr); return; }
        d.qty = n;
        const results = await searchMarket(d.product as string);
        if (results.length === 0) { resetFlow(); addBot(t.noResults); return; }
        d.results = results; d.step = "select"; setFlowData(d);
        addBot(t.results, { productCards: results as MarketItem[] }); break;
      }
      case "select": {
        const results = d.results as MarketItem[];
        const n = extractNumber(text);
        if (!n || n < 1 || n > results.length) { addBot(t.selectItem); return; }
        const sel = results[n - 1]; d.selected = sel; d.step = "confirm"; setFlowData(d);
        addBot(t.buyConfirm(sel.product_name, sel.seller_name, sel.price_tzs, (d.qty as number) || 1, sel.seller_location, sel.seller_trust), { quickReplies: [t.yes, t.no] }); break;
      }
      case "confirm": {
        const sel = d.selected as MarketItem;
        if (isYes(text)) {
          let orderId = null;
          if (dbConnected && userProfile && sel?.id) {
            try {
              // Look up supplier_id from the listing
              const listing = await sb(`inventory?id=eq.${sel.id}&select=supplier_id`);
              const supplierId = Array.isArray(listing) ? (listing[0]?.supplier_id ?? null) : null;
              const qty = (d.qty as number) || 1;
              const result = await sb("orders", {
                method: "POST",
                body: {
                  buyer_id:       userProfile.id,
                  supplier_id:    supplierId,
                  items:          { product: sel.product_name, qty, unit: "kg" },
                  total_price:    sel.price_tzs * qty,
                  commission_tzs: Math.round(sel.price_tzs * qty * 0.05),
                  status:         "pending",
                },
              });
              orderId = Array.isArray(result) ? (result[0]?.id ?? null) : null;
            } catch (e) { console.log("Place order error:", e); }
          }
          resetFlow(); addBot(t.buyDone(orderId as string | null));
        } else if (isNo(text)) { resetFlow(); addBot(t.cancelled); }
        else { addBot(t.buyConfirm(sel.product_name, sel.seller_name, sel.price_tzs, (d.qty as number) || 1, sel.seller_location, sel.seller_trust), { quickReplies: [t.yes, t.no] }); }
        break;
      }
    }
  };

  const handleSearchFlow = async (text: string) => {
    const results = await searchMarket(text);
    if (results.length === 0) { resetFlow(); addBot(t.noResults); return; }
    setFlow("buy"); setFlowData({ step: "select", product: text, results, qty: null });
    addBot(t.results, { productCards: results });
  };

  const showMyProducts = async () => {
    if (dbConnected && userProfile) {
      const items = await sb(`inventory?supplier_id=eq.${userProfile.id}&status=eq.available&order=created_at.desc`);
      if (Array.isArray(items) && items.length > 0) {
        addBot(t.myProducts, { myProductCards: items.map((i: MarketItem) => ({ ...i, location: (userProfile.location_name as string) || "" })) });
        setFlow("myproducts_edit"); setFlowData({ step: "select", items });
        return;
      }
    }
    addBot(t.noListings);
  };

  const showHistory = async () => {
    if (dbConnected && userProfile) {
      const orders = await sb(`orders?or=(buyer_id.eq.${userProfile.id},supplier_id.eq.${userProfile.id})&order=created_at.desc&limit=10`);
      if (Array.isArray(orders) && orders.length > 0) {
        const lines = orders.map((o: Record<string, unknown>) => {
          const isBuyer = o.buyer_id === userProfile.id;
          const items = (o.items as Record<string, unknown>[])?.[0] || {};
          return `${isBuyer ? "🛒" : "💰"} ${(items.product as string) || "?"} — ${Number(o.total_price || 0).toLocaleString()} TZS — ${o.status} — ${new Date(o.created_at as string).toLocaleDateString()}`;
        }).join("\n");
        addBot(`${t.history}\n\n${lines}`);
        return;
      }
    }
    addBot(t.noHistory);
  };

  const handleEditFlow = (text: string) => {
    const d = { ...flowData };
    const items = d.items as MarketItem[];
    switch (d.step) {
      case "select": {
        const n = extractNumber(text);
        if (!n || !items || n < 1 || n > items.length) { addBot(t.editPrompt); return; }
        d.index = n - 1; d.selectedItem = items[n - 1]; d.step = "action"; setFlowData(d);
        addBot(t.editAction); break;
      }
      case "action": {
        const n = extractNumber(text);
        const sel = d.selectedItem as MarketItem;
        if (n === 1) { d.step = "newprice"; setFlowData(d); addBot(t.newPrice); }
        else if (n === 2) {
          if (dbConnected && sel?.id) sb(`inventory?id=eq.${sel.id}`, { method: "PATCH", body: { status: "expired" } });
          resetFlow(); addBot(t.deleted);
        } else { addBot(t.editAction); }
        break;
      }
      case "newprice": {
        const n = extractNumber(text);
        if (!n || n <= 0) { addBot(t.priceErr); return; }
        const sel = d.selectedItem as MarketItem;
        if (dbConnected && sel?.id) sb(`inventory?id=eq.${sel.id}`, { method: "PATCH", body: { price_tzs: n } });
        resetFlow(); addBot(t.edited); break;
      }
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    processMessage(input);
    setInput("");
    inputRef.current?.focus();
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

  const SellProgress = () => {
    if (flow !== "sell") return null;
    const idx = SELL_STEP_MAP[flowData.step as string] ?? 0;
    const steps = t.sellSteps;
    return (
      <div style={{ padding: "8px 16px", background: "#111b21", borderBottom: "1px solid #1a2730", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, direction: isArabic ? "rtl" : "ltr" }}>
        <span style={{ color: "#8696a0", fontSize: 11, marginRight: isArabic ? 0 : 8, marginLeft: isArabic ? 8 : 0, whiteSpace: "nowrap" }}>{t.stepOf(idx + 1, steps.length)}</span>
        <div style={{ display: "flex", flex: 1, gap: 3 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= idx ? "#25d366" : "#2a3942", transition: "background 0.3s" }} />
          ))}
        </div>
      </div>
    );
  };

  const ProductCard = ({ item, index }: { item: MarketItem; index: number }) => (
    <div onClick={() => processMessage(String(index + 1))} style={{
      background: "#111b21", border: "1px solid #2a3942", borderRadius: 12, padding: "10px 12px", marginTop: 6, cursor: "pointer", transition: "border-color 0.2s, background 0.2s", display: "flex", gap: 10, alignItems: "center",
    }} onMouseOver={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#25d366"; (e.currentTarget as HTMLDivElement).style.background = "#0d2018"; }}
      onMouseOut={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#2a3942"; (e.currentTarget as HTMLDivElement).style.background = "#111b21"; }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: "#1a3a2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, color: "#25d366", fontWeight: 700 }}>{index + 1}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#e9edef", fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{item.product_name}</span>
          <span style={{ color: "#25d366", fontSize: 13, fontWeight: 700 }}>{Number(item.price_tzs).toLocaleString()} TZS</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ color: "#8696a0", fontSize: 11 }}>👤 {item.seller_name || "—"}  ·  📍 {item.seller_location || "—"}</span>
          <span style={{ color: "#8696a0", fontSize: 11 }}>📦 {Number(item.qty).toLocaleString()}kg</span>
        </div>
        {item.seller_trust && (
          <div style={{ marginTop: 3 }}>
            <span style={{ color: "#f5c842", fontSize: 10 }}>{"★".repeat(Math.floor(Number(item.seller_trust)))}{"☆".repeat(5 - Math.floor(Number(item.seller_trust)))}</span>
            <span style={{ color: "#8696a0", fontSize: 10, marginLeft: 4 }}>{Number(item.seller_trust).toFixed(1)}</span>
          </div>
        )}
      </div>
    </div>
  );

  const MyProductCard = ({ item, index }: { item: MarketItem & { location?: string }; index: number }) => (
    <div onClick={() => processMessage(String(index + 1))} style={{
      background: "#111b21", border: "1px solid #2a3942", borderRadius: 10, padding: "8px 12px", marginTop: 5, cursor: "pointer", transition: "border-color 0.2s", display: "flex", justifyContent: "space-between", alignItems: "center",
    }} onMouseOver={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#25d366"; }}
      onMouseOut={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#2a3942"; }}>
      <div>
        <span style={{ color: "#e9edef", fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{item.product_name}</span>
        <span style={{ color: "#8696a0", fontSize: 11, marginLeft: 8 }}>{Number(item.qty).toLocaleString()} kg · {item.location || "—"}</span>
      </div>
      <span style={{ color: "#25d366", fontSize: 13, fontWeight: 700 }}>{Number(item.price_tzs).toLocaleString()} TZS/kg</span>
    </div>
  );

  const TypingIndicator = () => (
    <div style={{ display: "flex", justifyContent: isArabic ? "flex-end" : "flex-start", marginBottom: 8 }}>
      <div style={{ background: "#1f2c34", padding: "10px 16px", borderRadius: "12px 12px 12px 2px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 3 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#8696a0", animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />
          ))}
        </div>
        <span style={{ color: "#8696a0", fontSize: 11 }}>{t.typing}</span>
      </div>
    </div>
  );

  return (
    <div style={{ height: "100vh", width: "100%", display: "flex", flexDirection: "column", background: "#0b1419", fontFamily: "'SF Pro Text', 'Segoe UI', -apple-system, sans-serif", direction: isArabic ? "rtl" : "ltr" }}>

      {/* HEADER */}
      <div style={{ background: "#1f2c34", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #2a3942", flexShrink: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #25d366 0%, #128c7e 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, flexShrink: 0, boxShadow: "0 2px 8px rgba(37,211,102,0.25)" }}>🌾</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#e9edef", fontSize: 16, fontWeight: 700, letterSpacing: "-0.2px" }}>SokoLink</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ color: "#25d366", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#25d366", display: "inline-block" }} />
              {t.onlineStatus}
            </div>
            {dbConnected !== null && (
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 6, background: dbConnected ? "rgba(37,211,102,0.15)" : "rgba(255,100,100,0.15)", color: dbConnected ? "#25d366" : "#ff6b6b", fontWeight: 600 }}>
                {dbConnected ? "DB ✓" : "Offline"}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {([{ code: "sw", label: "SW" }, { code: "en", label: "EN" }, { code: "ar", label: "AR" }] as { code: LangKey; label: string }[]).map(({ code, label }) => (
            <button key={code} onClick={() => {
              if (code !== lang) { setLang(code); resetFlow(); addBot(LANG[code].welcome, { showMenu: true }); }
            }} style={{
              padding: "5px 10px", borderRadius: 14,
              background: lang === code ? "#25d366" : "transparent",
              color: lang === code ? "#fff" : "#8696a0",
              border: lang === code ? "none" : "1px solid #2a3942",
              fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", letterSpacing: "0.5px",
            }}>{label}</button>
          ))}
        </div>
      </div>

      <SellProgress />

      {/* CHAT */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", background: "#060e13", backgroundImage: `radial-gradient(circle at 20% 80%, rgba(37,211,102,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(18,140,126,0.03) 0%, transparent 50%)` }}>
        {messages.map((msg, i) => {
          const isUser = msg.from === "user";
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? (isArabic ? "flex-start" : "flex-end") : (isArabic ? "flex-end" : "flex-start"), marginBottom: 6, animation: "msgIn 0.25s ease" }}>
              <div style={{
                maxWidth: "85%",
                background: isUser ? "linear-gradient(135deg, #005c4b 0%, #004a3d 100%)" : "#1f2c34",
                color: "#e9edef", padding: "8px 12px",
                borderRadius: isUser ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                boxShadow: isUser ? "0 1px 3px rgba(0,92,75,0.3)" : "0 1px 2px rgba(0,0,0,0.2)",
              }}>
                <div>{renderBold(msg.text)}</div>

                {msg.showMenu && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 10 }}>
                    {t.menu.map((m, j) => (
                      <button key={j} onClick={() => processMessage(m.cmd)} style={{
                        padding: "9px 10px", background: "rgba(37,211,102,0.07)", border: "1px solid rgba(37,211,102,0.25)", borderRadius: 10,
                        color: "#e9edef", fontSize: 12.5, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                        textAlign: isArabic ? "right" : "left", transition: "all 0.15s",
                        ...(j === t.menu.length - 1 && t.menu.length % 2 !== 0 ? { gridColumn: "1 / -1" } : {}),
                      }} onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,211,102,0.15)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#25d366"; }}
                        onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,211,102,0.07)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(37,211,102,0.25)"; }}>
                        <span style={{ fontSize: 15 }}>{m.icon}</span><span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {msg.productCards && (
                  <div style={{ marginTop: 6 }}>
                    {msg.productCards.map((item, j) => <ProductCard key={j} item={item} index={j} />)}
                    <div style={{ color: "#8696a0", fontSize: 11, marginTop: 8, textAlign: "center" }}>{t.selectItem}</div>
                  </div>
                )}

                {msg.myProductCards && (
                  <div style={{ marginTop: 6 }}>
                    {msg.myProductCards.map((item, j) => <MyProductCard key={j} item={item} index={j} />)}
                    <div style={{ color: "#8696a0", fontSize: 11, marginTop: 8, textAlign: "center" }}>{t.editPrompt}</div>
                  </div>
                )}

                <div style={{ fontSize: 10, color: isUser ? "rgba(255,255,255,0.45)" : "#667781", textAlign: isArabic ? "left" : "right", marginTop: 3, display: "flex", justifyContent: isArabic ? "flex-start" : "flex-end", alignItems: "center", gap: 3 }}>
                  {msg.time}
                  {isUser && <span style={{ fontSize: 11, color: "#53bdeb" }}>✓✓</span>}
                </div>
              </div>

              {msg.quickReplies && (
                <div style={{ display: "flex", gap: 6, marginTop: 5, justifyContent: isArabic ? "flex-end" : "flex-start" }}>
                  {msg.quickReplies.map((qr, j) => (
                    <button key={j} onClick={() => processMessage(qr)} style={{
                      padding: "6px 18px", borderRadius: 18,
                      background: j === 0 ? "rgba(37,211,102,0.12)" : "rgba(255,100,100,0.08)",
                      border: `1px solid ${j === 0 ? "rgba(37,211,102,0.4)" : "rgba(255,100,100,0.25)"}`,
                      color: j === 0 ? "#25d366" : "#ff6b6b", fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    }} onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.04)"; }}
                      onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}>{qr}</button>
                  ))}
                </div>
              )}

              {msg.showPopular && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6, justifyContent: isArabic ? "flex-end" : "flex-start" }}>
                  <span style={{ color: "#667781", fontSize: 11, width: "100%", marginBottom: 2 }}>{t.popular}</span>
                  {t.popularItems.map((item, j) => (
                    <button key={j} onClick={() => processMessage(item)} style={{
                      padding: "4px 12px", borderRadius: 14, background: "#1a2730", border: "1px solid #2a3942",
                      color: "#8696a0", fontSize: 11.5, cursor: "pointer", transition: "all 0.15s",
                    }} onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#25d366"; (e.currentTarget as HTMLButtonElement).style.color = "#25d366"; }}
                      onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a3942"; (e.currentTarget as HTMLButtonElement).style.color = "#8696a0"; }}>{item}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {isTyping && <TypingIndicator />}
        <div ref={chatEnd} />
      </div>

      {/* INPUT */}
      <div style={{ padding: "8px 12px", background: "#1f2c34", display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid #2a3942", flexShrink: 0 }}>
        <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
          placeholder={lang === "sw" ? "Andika ujumbe..." : lang === "ar" ? "اكتب رسالة..." : "Type a message..."}
          style={{ flex: 1, padding: "11px 18px", borderRadius: 24, border: "none", background: "#2a3942", color: "#e9edef", fontSize: 14, outline: "none", direction: isArabic ? "rtl" : "ltr" }} />
        <button onClick={handleSend} style={{
          width: 44, height: 44, borderRadius: "50%", background: input.trim() ? "#25d366" : "#2a3942",
          border: "none", display: "flex", alignItems: "center", justifyContent: "center",
          cursor: input.trim() ? "pointer" : "default", flexShrink: 0, transition: "all 0.2s",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? "#fff" : "#8696a0"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.2s" }}>
            <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes typingBounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }
        input::placeholder { color: #8696a0 !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a3942; border-radius: 4px; }
        button:active { transform: scale(0.96) !important; }
      `}</style>
    </div>
  );
}
