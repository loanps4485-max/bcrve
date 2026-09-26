const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

exports.handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { customer, note, items, total } = body;

    if (!customer || !items || !Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Données invalides' }) };
    }

    // Vérifier et baisser le stock
    for (const item of items) {
      const { data: product, error } = await supabase
        .from('products')
        .select('stock, name')
        .eq('id', item.id)
        .single();

      if (error || !product) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Produit introuvable: ${item.name}` }) };
      }

      if (product.stock < item.qty) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Stock insuffisant pour ${product.name}` }) };
      }

      // Baisser le stock
      await supabase
        .from('products')
        .update({ stock: product.stock - item.qty })
        .eq('id', item.id);
    }

    // Créer l'ID de commande
    const orderId = 'B85-' + Date.now().toString().slice(-6);

    // Enregistrer la commande
    const { error: orderError } = await supabase
      .from('orders')
      .insert({
        order_id: orderId,
        customer,
        note: note || '',
        items,
        total,
        status: 'pending'
      });

    if (orderError) {
      console.error(orderError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur enregistrement commande' }) };
    }

    // Préparer le message Telegram
    let message = `🛒 *Nouvelle commande ${orderId}*\n\n`;
    message += `👤 Client : ${customer}\n`;
    if (note) message += `📝 Note : ${note}\n`;
    message += `\n*Articles :*\n`;

    items.forEach(item => {
      message += `• ${item.emoji || ''} ${item.name} × ${item.qty} — ${(item.price * item.qty).toFixed(2)} €\n`;
    });

    message += `\n💰 *Total : ${total.toFixed(2)} €*`;

    // Envoyer la notification Telegram
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, orderId })
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erreur serveur' })
    };
  }
};
