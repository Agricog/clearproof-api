const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

interface Message {
  role: 'user' | 'assistant'
  content: string
}

async function chat(messages: Message[], system?: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system,
      messages
    })
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Claude API error: ${res.status} ${error}`)
  }

  const data = await res.json()
  return data.content[0].text
}

function stripCodeBlocks(text: string): string {
  // Remove markdown code blocks if present
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export async function transformContent(rawContent: string): Promise<string> {
  const system = `You are a Health & Safety content specialist. Your job is to transform complex H&S documents into clear, simple sections that workers can easily understand.

Rules:
- Use simple, direct language (aim for 6th grade reading level)
- Break into short sections with clear headings
- Use bullet points for lists of requirements
- Highlight critical safety points
- Remove legal jargon, keep practical information
- Output ONLY valid JSON with structure: { "sections": [{ "title": string, "content": string, "critical": boolean }] }
- Do NOT wrap in markdown code blocks`

  const result = await chat([
    { role: 'user', content: `Transform this H&S document into clear, worker-friendly sections:\n\n${rawContent}` }
  ], system)

  return stripCodeBlocks(result)
}

export async function translateContent(content: string, targetLanguage: string): Promise<string> {
  const system = `You are a professional translator specializing in Health & Safety content. Translate accurately while keeping the language simple and clear for workers.`

  return chat([
    { role: 'user', content: `Translate the following H&S content to ${targetLanguage}. Keep it simple and clear:\n\n${content}` }
  ], system)
}

export async function generateQuestions(content: string, language: string): Promise<string> {
  const system = `You are a Health & Safety training specialist. Create scenario-based comprehension questions that verify workers truly understood the safety content - not just memorized it.

Rules:
- Create 3-5 questions
- Use realistic workplace scenarios
- Multiple choice with 3 options
- One clearly correct answer based on the content
- Questions should test understanding, not memory
- Output ONLY valid JSON: { "questions": [{ "scenario": string, "question": string, "options": string[], "correctIndex": number }] }
- Do NOT wrap in markdown code blocks`

  const languageInstruction = language !== 'en' ? ` Output the questions in ${language}.` : ''

  const result = await chat([
    { role: 'user', content: `Based on this H&S content, create scenario-based comprehension questions.${languageInstruction}\n\n${content}` }
  ], system)

  return stripCodeBlocks(result)
}
