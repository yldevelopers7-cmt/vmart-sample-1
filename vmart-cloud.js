import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.VMART_CONFIG || {};
const configured = !!cfg.firebase?.apiKey && cfg.firebase.apiKey !== 'REPLACE_ME' &&
  !!cfg.supabase?.url && !cfg.supabase.url.includes('REPLACE_ME') &&
  !!cfg.supabase?.publishableKey && cfg.supabase.publishableKey !== 'REPLACE_ME';

let app = null;
let auth = null;
let supabase = null;
let confirmationResult = null;
let recaptcha = null;

if (configured) {
  app = getApps().length ? getApps()[0] : initializeApp(cfg.firebase);
  auth = getAuth(app);
  auth.useDeviceLanguage();
  supabase = createClient(cfg.supabase.url, cfg.supabase.publishableKey, {
    auth: { persistSession: false },
    accessToken: async () => auth.currentUser ? auth.currentUser.getIdToken() : null
  });
}

function getUser() { return auth?.currentUser || null; }
function isConfigured() { return configured; }

async function setupRecaptcha(buttonId) {
  if (!auth) throw new Error('Firebase is not configured.');
  if (recaptcha) { try { recaptcha.clear(); } catch {} }
  recaptcha = new RecaptchaVerifier(auth, buttonId, { size: 'invisible' });
  await recaptcha.render();
  return recaptcha;
}

async function sendPhoneOtp(phone, buttonId) {
  if (!configured) throw new Error('Add Firebase and Supabase values to vmart-config.js first.');
  const verifier = await setupRecaptcha(buttonId);
  confirmationResult = await signInWithPhoneNumber(auth, phone, verifier);
  return true;
}

async function verifyPhoneOtp(code) {
  if (!confirmationResult) throw new Error('Request an OTP first.');
  const result = await confirmationResult.confirm(code);
  confirmationResult = null;
  return result.user;
}

async function adminLogin(email, password) {
  if (!configured) throw new Error('Add Firebase and Supabase values to vmart-config.js first.');
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

async function logout() {
  if (auth) await signOut(auth);
}

function watchAuth(callback) {
  if (!auth) { callback(null); return () => {}; }
  return onAuthStateChanged(auth, callback);
}

async function upsertProfile(profile) {
  if (!supabase || !getUser()) return null;
  const user = getUser();
  const payload = { firebase_uid: user.uid, phone: user.phoneNumber || profile.phone || null, name: profile.name || null, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('profiles').upsert(payload, { onConflict: 'firebase_uid' }).select().single();
  if (error) throw error;
  return data;
}

async function loadCatalog() {
  if (!supabase) return null;
  const [{ data: categories, error: cErr }, { data: products, error: pErr }] = await Promise.all([
    supabase.from('categories').select('*').eq('active', true).order('sort_order'),
    supabase.from('products').select('*').eq('active', true).order('name')
  ]);
  if (cErr) throw cErr;
  if (pErr) throw pErr;
  return { categories, products };
}

async function saveOrder(order, profile) {
  if (!supabase || !getUser()) return null;
  const user = getUser();
  const { data: row, error } = await supabase.from('orders').insert({
    order_number: order.id,
    firebase_uid: user.uid,
    customer_name: profile.name,
    customer_phone: user.phoneNumber || profile.phone,
    status: 'Order Placed',
    payment_method: 'Cash on Delivery',
    delivery_method: order.deliveryMethod,
    address: order.address,
    subtotal: order.subtotal ?? null,
    discount: order.discount ?? 0,
    delivery_fee: order.deliveryFee ?? 0,
    total: order.total
  }).select().single();
  if (error) throw error;
  if (order.items?.length) {
    const items = order.items.map(i => ({ order_id: row.id, product_id: i.id || null, product_name: i.name, quantity: i.qty, unit_price: i.price }));
    const { error: itemErr } = await supabase.from('order_items').insert(items);
    if (itemErr) throw itemErr;
  }
  return row;
}


async function upsertAddress(address) {
  if (!supabase || !getUser()) return null;
  const user = getUser();
  const payload = {
    firebase_uid: user.uid, name: address.name, phone: user.phoneNumber || address.phone || null,
    house: address.house, area: address.area, city: address.city, pincode: address.pin, is_default: true
  };
  const { data, error } = await supabase.from('addresses').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) throw error;
  return data;
}



async function loadAdminCatalog() {
  if (!supabase || !getUser()) return null;
  const [{ data: categories, error: cErr }, { data: products, error: pErr }] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('products').select('*').order('name')
  ]);
  if (cErr) throw cErr;
  if (pErr) throw pErr;
  return { categories: categories || [], products: products || [] };
}

async function loadAllOrders() {
  if (!supabase || !getUser()) return [];
  const { data, error } = await supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function syncAdminProducts(products) {
  if (!supabase || !getUser()) return;
  const rows = products.map(p => ({ id: p.id, name: p.name, brand: p.brand || null, category_id: p.category, price: p.price, original_price: p.originalPrice, weight: p.weight || null, image_url: (p.image || '').startsWith('http') ? p.image : null, rating: p.rating || 0, stock: p.stock || 0, featured: !!p.featured, offer: !!p.offer, description: p.desc || null, active: p.status !== 'Inactive' }));
  const { error } = await supabase.from('products').upsert(rows);
  if (error) throw error;
}

async function syncAdminCategories(categories) {
  if (!supabase || !getUser()) return;
  const rows = categories.map((c,i) => ({ id: c.id, name: c.name, icon: c.icon || '🛒', description: c.desc || null, sort_order: i, active: c.status !== 'Inactive' }));
  const { error } = await supabase.from('categories').upsert(rows);
  if (error) throw error;
}

async function updateAdminOrderStatus(orderNumber, status) {
  if (!supabase || !getUser()) return;
  const { error } = await supabase.from('orders').update({ status }).eq('order_number', orderNumber);
  if (error) throw error;
}

async function loadMyOrders() {
  if (!supabase || !getUser()) return [];
  const { data, error } = await supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function syncAdminOrders(orders) {
  if (!supabase || !getUser()) return;
  for (const o of orders) {
    const { error } = await supabase.from('orders').update({ status: o.status, payment_method: o.paymentMethod || o.payment || 'Cash on Delivery' }).eq('order_number', o.id);
    if (error && !String(error.message||'').toLowerCase().includes('no rows')) throw error;
  }
}

window.VMART_CLOUD = {
  configured: isConfigured,
  getUser,
  watchAuth,
  setupRecaptcha,
  sendPhoneOtp,
  verifyPhoneOtp,
  adminLogin,
  logout,
  upsertProfile,
  loadCatalog,
  saveOrder,
  loadMyOrders,
  loadAllOrders,
  loadAdminCatalog,
  syncAdminProducts,
  syncAdminCategories,
  updateAdminOrderStatus,
  syncAdminOrders,
  upsertAddress,
  get supabase() { return supabase; }
};
