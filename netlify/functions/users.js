// netlify/functions/users.js
// Registra ou recupera um usuário pelo visitor_id
// Retorna { author_name, user_code, display_name }

const { createClient } = require('@supabase/supabase-js')

function sb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
}

function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }

  const supabase = sb()

  try {
    // ── GET ?visitor_id=xxx — busca usuário existente ──
    if (event.httpMethod === 'GET') {
      const { visitor_id } = event.queryStringParameters || {}
      if (!visitor_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'visitor_id obrigatório' }) }

      const { data: user } = await supabase
        .from('users')
        .select('author_name, user_code, display_name')
        .eq('visitor_id', visitor_id)
        .maybeSingle()

      return { statusCode: 200, headers, body: JSON.stringify({ user: user || null }) }
    }

    // ── POST — registra novo usuário ──
    if (event.httpMethod === 'POST') {
      const { visitor_id, author_name } = JSON.parse(event.body || '{}')

      if (!visitor_id || !author_name?.trim()) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'visitor_id e author_name obrigatórios' }) }
      }

      // Verifica se já existe
      const { data: existing } = await supabase
        .from('users')
        .select('author_name, user_code, display_name')
        .eq('visitor_id', visitor_id)
        .maybeSingle()

      if (existing) return { statusCode: 200, headers, body: JSON.stringify({ user: existing }) }

      // Gera código único (tenta até 10x)
      let user_code, inserted
      for (let i = 0; i < 10; i++) {
        user_code = generateCode()
        const { data, error } = await supabase
          .from('users')
          .insert({ visitor_id, author_name: author_name.trim().slice(0, 50), user_code })
          .select('author_name, user_code, display_name')
          .single()

        if (!error) { inserted = data; break }
        if (!error?.message?.includes('unique')) throw error
      }

      if (!inserted) throw new Error('Não foi possível gerar código único')

      return { statusCode: 201, headers, body: JSON.stringify({ user: inserted }) }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) }

  } catch (err) {
    console.error('users error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro interno' }) }
  }
}
