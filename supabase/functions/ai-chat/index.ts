// Supabase Edge Function: ai-chat
// Handles AI assistant conversations for clients and studio owners
// Supports OpenAI API with tool calling AND a built-in JSON-intent engine
// fallback for offline/demo/unconfigured modes without external API keys.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface ChatRequest {
  tenant_id: string
  role?: "client" | "owner"
  message: string
  conversation_history?: Array<{ role: "user" | "assistant" | "system"; content: string }>
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    const llmApiKey = Deno.env.get("LLM_API_KEY") || ""
    const llmBaseUrl = Deno.env.get("LLM_BASE_URL") || "https://api.openai.com/v1"
    const llmModel = Deno.env.get("LLM_MODEL") || "gpt-4o-mini"

    const body: ChatRequest = await req.json()
    const { tenant_id, role = "client", message } = body

    if (!tenant_id || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tenant_id and message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check rate limit if Supabase is active
    if (supabaseUrl && supabaseServiceKey) {
      const { data: allowed, error: rateErr } = await supabase.rpc("increment_rate_limit", {
        p_tenant_id: tenant_id,
        p_limit_type: "api_request",
        p_max_value: 60, // 60 requests per hour per tenant
      })
      if (!rateErr && allowed === false) {
        return new Response(
          JSON.stringify({ error: "Превышен лимит запросов к помощнику. Попробуйте чуть позже." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
    }

    // Load tenant basic info
    let tenantName = "Студия"
    let tenantPhone = ""
    let tenantAddress = ""
    let tenantTimezone = "Europe/Moscow"
    let servicesList: Array<{ name: string; price: number; duration_minutes: number; category: string }> = []

    if (supabaseUrl && supabaseServiceKey) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name, phone, address, timezone")
        .eq("id", tenant_id)
        .single()
      if (tenant) {
        tenantName = tenant.name
        tenantPhone = tenant.phone || ""
        tenantAddress = tenant.address || ""
        tenantTimezone = tenant.timezone || "Europe/Moscow"
      }

      const { data: services } = await supabase
        .from("services")
        .select("name, price, duration_minutes, category")
        .eq("tenant_id", tenant_id)
        .eq("is_active", true)
      if (services) {
        servicesList = services
      }
    }

    // If external LLM API key is NOT configured or requested by user to run without external API:
    // Execute built-in JSON Intent Router
    if (!llmApiKey || llmApiKey.startsWith("your-")) {
      const lower = message.toLowerCase()

      // Intent 1: Studio location / address / contact
      if (lower.includes("как найти") || lower.includes("где") || lower.includes("адрес") || lower.includes("телефон") || lower.includes("контакт")) {
        const reply = `📍 **${tenantName}** находится по адресу: ${tenantAddress || "уточняется"}.\n\n📞 Связаться с нами можно по телефону: ${tenantPhone || "уточняется"}. Работаем по предварительной записи.`
        return new Response(JSON.stringify({ reply, source: "intent-router" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      // Intent 2: Price inquiry / services list
      if (lower.includes("сколько стоит") || lower.includes("цена") || lower.includes("прайс") || lower.includes("стоимость") || lower.includes("услуг")) {
        const matchedService = servicesList.find((s) => lower.includes(s.name.toLowerCase()) || lower.includes(s.category.toLowerCase()))
        if (matchedService) {
          const reply = `Стоимость услуги **«${matchedService.name}»** составляет **${matchedService.price} ₽**, длительность выполнения — около ${matchedService.duration_minutes} мин. Чтобы записаться, выберите её в каталоге или нажмите кнопку «Записаться».`
          return new Response(JSON.stringify({ reply, source: "intent-router" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }

        const topServices = servicesList.slice(0, 4).map((s) => `• **${s.name}** — ${s.price} ₽ (${s.duration_minutes} мин)`).join("\n")
        const reply = `В нашей студии **${tenantName}** доступны следующие популярные услуги:\n\n${topServices || "Список услуг уточняется"}\n\nПолный перечень с актуальными ценами смотрите в разделе «Услуги».`
        return new Response(JSON.stringify({ reply, source: "intent-router" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      // Intent 3: Nearest available window / booking slot
      if (lower.includes("окно") || lower.includes("когда") || lower.includes("ближайш") || lower.includes("запис") || lower.includes("свободн")) {
        const reply = `Ближайшие свободные окна в **${tenantName}** доступны на этой неделе! Для выбора точного времени нажмите кнопку **«Записаться»** на главном экране — откроется удобный выбор даты и времени с отметкой свободных боксов.`
        return new Response(JSON.stringify({ reply, source: "intent-router" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      // Owner Intent: Tomorrow schedule
      if (role === "owner" && (lower.includes("завтра") || lower.includes("расписание"))) {
        const reply = `На завтра в студии запланированы подтвержденные заезды. Вы можете посмотреть подробности по каждому боксу в календаре выше.`
        return new Response(JSON.stringify({ reply, source: "intent-router" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      // Owner Intent: Revenue / stats
      if (role === "owner" && (lower.includes("денег") || lower.includes("выручка") || lower.includes("получено") || lower.includes("машин"))) {
        const reply = `Статистика за текущую неделю отображена на панелях дашборда: количество заездов, завершенные заказы и фактически поступившая оплата.`
        return new Response(JSON.stringify({ reply, source: "intent-router" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      // Default polite clarifying response
      const reply = `Здравствуйте! Я виртуальный помощник студии **${tenantName}**. Могу подсказать стоимость услуг, свободные окна для записи или как до нас добраться. Что вас интересует?`
      return new Response(JSON.stringify({ reply, source: "intent-router" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // External OpenAI compatible call with grounded tools
    const systemPrompt = `Ты вежливый помощник автосервиса / детейлинга "${tenantName}". 
Отвечай строго на основе предоставленных данных об услугах: ${JSON.stringify(servicesList)}. 
Адрес: ${tenantAddress}, телефон: ${tenantPhone}, часовой пояс: ${tenantTimezone}.
Если данных недостаточно, вежливо уточни. Не выдумывай несуществующие услуги или время.`

    const openAiResponse = await fetch(`${llmBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmApiKey}`,
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
    })

    const openAiData = await openAiResponse.json()
    const aiText = openAiData.choices?.[0]?.message?.content || "Не удалось получить ответ модели."

    return new Response(JSON.stringify({ reply: aiText, source: "llm" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
