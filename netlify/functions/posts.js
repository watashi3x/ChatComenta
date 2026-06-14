// netlify/functions/posts.js
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
    // ── GET /posts/:id  — post único para refresh ──
    if (event.httpMethod === 'GET' && event.path.match(/\/posts\/[^/]+$/)) {
      const postId = event.path.split('/').pop()
      const visitor = event.queryStringParameters?.visitor || ''

      const { data: post } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single()

      if (!post) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) }

      const [reactions, userReaction, { count: comment_count }] = await Promise.all([
        getReactions(supabase, postId),
        getUserReaction(supabase, postId, visitor),
        supabase.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', postId),
      ])

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ post: { ...post, reactions, user_reaction: userReaction, comment_count: comment_count || 0 } }),
      }
    }

    // ── GET /posts — feed completo ──
    if (event.httpMethod === 'GET') {
      const visitor = event.queryStringParameters?.visitor || ''

      const { data: posts } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (!posts?.length) return { statusCode: 200, headers, body: JSON.stringify({ posts: [] }) }

      // Enriquece cada post com reações e contagem de comentários
      const enriched = await Promise.all(posts.map(async (post) => {
        const [reactions, userReaction, { count: comment_count }] = await Promise.all([
          getReactions(supabase, post.id),
          getUserReaction(supabase, post.id, visitor),
          supabase.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
        ])
        return { ...post, reactions, user_reaction: userReaction, comment_count: comment_count || 0 }
      }))

      return { statusCode: 200, headers, body: JSON.stringify({ posts: enriched }) }
    }

    // ── POST /posts — cria post ──
    if (event.httpMethod === 'POST') {
      const { caption, image_url, visitor_id, author_name } = JSON.parse(event.body || '{}')

      if (!caption?.trim() && !image_url) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'caption ou image_url obrigatório' }) }
      }

      const { data: post, error } = await supabase
        .from('posts')
        .insert({
          caption: caption?.trim().slice(0, 1000) || null,
          image_url: image_url || null,
          visitor_id,
          author_name: author_name?.trim().slice(0, 50) || 'Anônimo',
        })
        .select()
        .single()

      if (error) throw error

      return { statusCode: 201, headers, body: JSON.stringify({ post }) }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) }

  } catch (err) {
    console.error('posts error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro interno' }) }
  }
}

async function getReactions(supabase, postId) {
  const { data } = await supabase
    .from('reactions')
    .select('emoji')
    .eq('post_id', postId)

  const counts = {}
  for (const r of data || []) {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1
  }
  return counts
}

async function getUserReaction(supabase, postId, visitorId) {
  if (!visitorId) return null
  const { data } = await supabase
    .from('reactions')
    .select('emoji')
    .eq('post_id', postId)
    .eq('visitor_id', visitorId)
    .maybeSingle()
  return data?.emoji || null
}
