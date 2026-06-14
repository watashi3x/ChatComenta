// netlify/functions/chat.js
const { createClient } = require('@supabase/supabase-js')

function sb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }

  const supabase = sb()
  const path = event.path

  try {
    // ── GET /chat/unread?me=Nome — conta mensagens não lidas ──
    if (event.httpMethod === 'GET' && path.includes('/unread')) {
      const { me } = event.queryStringParameters || {}
      if (!me) return { statusCode: 400, headers, body: JSON.stringify({ error: 'me obrigatório' }) }

      const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_name', me)
        .eq('read', false)

      return { statusCode: 200, headers, body: JSON.stringify({ count: count || 0 }) }
    }

    // ── GET /chat?me=A&peer=B — busca conversa entre dois usuários ──
    if (event.httpMethod === 'GET') {
      const { me, peer } = event.queryStringParameters || {}
      if (!me || !peer) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'me e peer obrigatórios' }) }
      }

      const { data: messages } = await supabase
        .from('chat_messages')
        .select('id, sender_name, receiver_name, content, created_at, read')
        .or(
          `and(sender_name.eq.${me},receiver_name.eq.${peer}),and(sender_name.eq.${peer},receiver_name.eq.${me})`
        )
        .order('created_at', { ascending: true })
        .limit(100)

      // Marca como lidas as mensagens recebidas por "me"
      const unreadIds = (messages || [])
        .filter(m => m.receiver_name === me && !m.read)
        .map(m => m.id)

      if (unreadIds.length) {
        await supabase
          .from('chat_messages')
          .update({ read: true })
          .in('id', unreadIds)
      }

      return { statusCode: 200, headers, body: JSON.stringify({ messages: messages || [] }) }
    }

    // ── POST /chat — envia mensagem ──
    if (event.httpMethod === 'POST') {
      const { sender_name, receiver_name, content, visitor_id } = JSON.parse(event.body || '{}')

      if (!sender_name?.trim() || !receiver_name?.trim() || !content?.trim()) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'sender_name, receiver_name e content obrigatórios' }) }
      }

      if (sender_name.trim() === receiver_name.trim()) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Não é possível enviar mensagem para si mesmo' }) }
      }

      const { data: message, error } = await supabase
        .from('chat_messages')
        .insert({
          sender_name: sender_name.trim().slice(0, 50),
          receiver_name: receiver_name.trim().slice(0, 50),
          content: content.trim().slice(0, 500),
          visitor_id: visitor_id || null,
          read: false,
        })
        .select()
        .single()

      if (error) throw error

      return { statusCode: 201, headers, body: JSON.stringify({ message }) }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) }

  } catch (err) {
    console.error('chat error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro interno' }) }
  }
}
