import type Anthropic from '@anthropic-ai/sdk';
import type { Signal } from '../types.js';

const SYSTEM_PROMPT = `Ты — опытный трейдинг-аналитик, специализирующийся на техническом анализе графиков форекс и
криптовалют. Тебе присылают скриншот графика цены (свечной или линейный). Внимательно изучи видимые на изображении
данные: подписи цен на оси, форму последних свечей, видимые уровни поддержки/сопротивления, видимые индикаторы
(если есть).

На основе этого дай торговый сигнал: направление (bullish/bearish/neutral), цену входа, стоп-лосс и три уровня
тейк-профита. Все числовые уровни должны быть согласованы между собой и с видимым на графике диапазоном цен:
- Для bullish: stop_loss < entry_price < take_profit_1 < take_profit_2 < take_profit_3
- Для bearish: take_profit_3 < take_profit_2 < take_profit_1 < entry_price < stop_loss
Обоснование (rationale) пиши на русском, 2-3 предложения, простым языком.`;

interface SignalToolInput {
  trend: 'bullish' | 'bearish' | 'neutral';
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  rationale: string;
}

export async function analyzeChart(
  client: Anthropic,
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg'
): Promise<Signal> {
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: 'provide_signal',
        description: 'Возвращает торговый сигнал, извлечённый из скриншота графика',
        input_schema: {
          type: 'object',
          properties: {
            trend: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
            entry_price: { type: 'number' },
            stop_loss: { type: 'number' },
            take_profit_1: { type: 'number' },
            take_profit_2: { type: 'number' },
            take_profit_3: { type: 'number' },
            rationale: { type: 'string' },
          },
          required: [
            'trend',
            'entry_price',
            'stop_loss',
            'take_profit_1',
            'take_profit_2',
            'take_profit_3',
            'rationale',
          ],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'provide_signal' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Проанализируй этот график и дай торговый сигнал.' },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }

  const input = toolUse.input as SignalToolInput;
  return {
    trend: input.trend,
    entryPrice: input.entry_price,
    stopLoss: input.stop_loss,
    takeProfit1: input.take_profit_1,
    takeProfit2: input.take_profit_2,
    takeProfit3: input.take_profit_3,
    rationale: input.rationale,
  };
}
