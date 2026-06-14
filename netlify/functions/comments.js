// netlify/functions/comments.js
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

  try {
    if (event.httpMethod === 'GET') {
      const { post_id } = event.queryStringParameters || {}
      if (!post_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'post_id obrigatório' }) }

      const { data: comments } = await supabase
        .from('comments')
        .select('id, author_name, content, created_at')
        .eq('post_id', post_id)
        .order('created_at', { ascending: true })

      return { statusCode: 200, headers, body: JSON.stringify({ comments: comments || [] }) }
    }

    if (event.httpMethod === 'POST') {
      const { post_id, author_name, content } = JSON.parse(event.body || '{}')

      if (!post_id || !author_name?.trim() || !content?.trim()) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'post_id, author_name e content obrigatórios' }) }
      }

      const { data: comment, error } = await supabase
        .from('comments')
        .insert({
          post_id,
          author_name: author_name.trim().slice(0, 50),
          content: content.trim().slice(0, 500),
        })
        .select()
        .single()

      if (error) throw error

      return { statusCode: 201, headers, body: JSON.stringify({ comment }) }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) }

  } catch (err) {
    console.error('comments error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro interno' }) }
  }
}
