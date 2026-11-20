import type { AnalysisProgressEvent } from '../types/ielts';

export async function postSseStream<TResult>(
  url: string,
  body: unknown,
  onProgress: (event: AnalysisProgressEvent) => void
): Promise<TResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || contentType.includes('application/json')) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error || 'Не удалось запустить ИИ-проверку.'
    );
  }

  if (!res.body) {
    throw new Error('Браузер не поддерживает потоковое чтение ответа.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let donePayload: TResult | null = null;

  const processFrame = (rawFrame: string) => {
    const lines = rawFrame.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const jsonStr = dataLines.join('\n');
    const parsed = JSON.parse(jsonStr);

    if (eventName === 'progress') {
      onProgress(parsed as AnalysisProgressEvent);
    } else if (eventName === 'done') {
      donePayload = parsed as TResult;
    } else if (eventName === 'error') {
      throw new Error((parsed as { error?: string }).error || 'Ошибка ИИ-анализа.');
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let sepIdx = buffer.indexOf('\n\n');
    while (sepIdx !== -1) {
      const frame = buffer.slice(0, sepIdx).trim();
      buffer = buffer.slice(sepIdx + 2);
      if (frame) {
        processFrame(frame);
      }
      sepIdx = buffer.indexOf('\n\n');
    }
  }

  const tail = buffer.trim();
  if (tail) {
    processFrame(tail);
  }

  if (!donePayload) {
    throw new Error('Соединение с ИИ-проверкой прервалось до завершения анализа. Ваш текст сохранён.');
  }

  return donePayload;
}
