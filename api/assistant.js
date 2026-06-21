const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 450);
const MAX_ITEMS_PER_TABLE = Number(process.env.OPENAI_MAX_ITEMS_PER_TABLE || 80);
const MAX_MESSAGE_CHARS = Number(process.env.OPENAI_MAX_MESSAGE_CHARS || 4000);

function limitItems(items) {
  return (items || []).slice(0, MAX_ITEMS_PER_TABLE);
}

function limitText(value, maxLength = MAX_MESSAGE_CHARS) {
  if (typeof value !== 'string') return '';
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...[קוצר כדי לחסוך טוקנים]` : value;
}

function compactState(state) {
  return {
    today: new Date().toISOString().slice(0, 10),
    shabbatParshas: state?.shabbatParshas || [],
    complexes: limitItems(state?.complexes)
      .filter(complex => complex.active !== false)
      .map(complex => ({
        id: complex.id,
        name: complex.name,
        area: complex.area,
        city: complex.city,
        rooms: complex.rooms,
        maxGuests: complex.maxGuests,
        ownerPhone: complex.ownerPhone,
      })),
    availabilityBlocks: limitItems(state?.availabilityBlocks).map(block => ({
      complexId: block.complexId,
      startDate: block.startDate,
      endDate: block.endDate,
      status: block.status,
      customerName: block.customerName,
      note: block.note,
    })),
    leads: limitItems(state?.leads).map(lead => ({
      customerName: lead.customerName,
      startDate: lead.startDate,
      endDate: lead.endDate,
      parsha: lead.parsha,
      guests: lead.guests,
      areaPreference: lead.areaPreference,
      vacationType: lead.vacationType,
      status: lead.status,
    })),
    tasks: limitItems(state?.tasks).map(task => ({
      title: task.title,
      dueDate: task.dueDate,
      status: task.status,
    })),
  };
}

function readOutputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const textParts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) textParts.push(content.text);
    }
  }
  return textParts.join('\n').trim();
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    response.status(501).json({ error: 'OpenAI is not configured' });
    return;
  }

  const { message, state } = request.body || {};
  if (!message || typeof message !== 'string') {
    response.status(400).json({ error: 'Missing message' });
    return;
  }

  const instructions = [
    'You are the operations assistant for קלנופש, an internal Hebrew vacation-complex management app.',
    'Answer in Hebrew, concise and practical.',
    'Use only the provided app data. If data is missing, say what is missing.',
    'Help interpret messy Hebrew lists, availability questions, lead questions, task questions, and operational summaries.',
    'Do not invent bookings, prices, or availability.',
  ].join('\n');

  const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      instructions,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `נתוני האפליקציה:\n${JSON.stringify(compactState(state), null, 2)}\n\nבקשת המשתמשת:\n${limitText(message)}`,
            },
          ],
        },
      ],
    }),
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    if (openaiResponse.status === 429 || errorText.includes('insufficient_quota')) {
      response.status(402).json({ error: 'OpenAI quota or budget limit reached' });
      return;
    }
    response.status(502).json({ error: errorText || 'OpenAI request failed' });
    return;
  }

  const data = await openaiResponse.json();
  response.status(200).json({ text: readOutputText(data) || 'לא הצלחתי להוציא תשובה מ-GPT.' });
}
