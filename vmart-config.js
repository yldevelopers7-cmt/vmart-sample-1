// V Mart public client configuration.
// Replace these placeholders with values from Firebase Console and Supabase.
// Never put a Supabase secret/service-role key here.
window.VMART_CONFIG = {
  firebase: {
    apiKey: 'REPLACE_ME',
    authDomain: 'REPLACE_ME.firebaseapp.com',
    projectId: 'REPLACE_ME',
    storageBucket: 'REPLACE_ME.firebasestorage.app',
    messagingSenderId: 'REPLACE_ME',
    appId: 'REPLACE_ME'
  },
  supabase: {
    url: 'https://REPLACE_ME.supabase.co',
    publishableKey: 'REPLACE_ME'
  },
  store: {
    name: 'V Mart',
    city: 'Yelahanka, Bengaluru',
    pincode: '',
    mapUrl: 'https://maps.app.goo.gl/iwbZLUDVBmqjmkmi7?g_st=aw',
    phone: '081053 24989'
  }
};
